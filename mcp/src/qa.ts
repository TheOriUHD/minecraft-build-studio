// Automated build QA ("lint for builds") and automatic player-perspective viewpoints.
// Finds the things a player would notice immediately: rooms you can't enter, glass hanging in the air,
// blocked doors, holes in roofs, torches/lanterns attached to nothing, stray blocks, unreachable doors.
import { VoxelGrid, Bounds } from "./voxel.ts";
import { PALETTE, parseState } from "./blocks/state.ts";
import { assets } from "./blocks/assets.ts";

export interface Finding {
  severity: "error" | "warning" | "info";
  kind: string;
  pos: [number, number, number];
  message: string;
}

const PASSABLE = /^(air|cave_air|void_air|light|short_grass|tall_grass|fern|large_fern|dead_bush|.*_carpet|moss_carpet|snow|.*_button|lever|.*torch|.*wall_torch|.*_pressure_plate|tripwire.*|rail|.*_rail|redstone_wire|.*_sign|.*_wall_sign|.*_hanging_sign|.*_banner|.*_wall_banner|vine|glow_lichen|sculk_vein|ladder|.*_door|.*_fence_gate|flower_pot|potted_.*|.*_sapling|poppy|dandelion|cornflower|oxeye_daisy|azure_bluet|allium|.*_tulip|lily_of_the_valley|blue_orchid|sunflower|lilac|rose_bush|peony|torchflower|pink_petals|wildflowers|leaf_litter|bush|.*_mushroom|sugar_cane|wheat|carrots|potatoes|beetroots|lily_pad|seagrass|tall_seagrass|kelp|kelp_plant|nether_portal|end_gateway|end_portal|candle|.*_candle|lantern|soul_lantern|iron_chain|.*_chain|cobweb|structure_void|water|lava|bubble_column|scaffolding|string|firefly_bush|short_dry_grass|tall_dry_grass|cactus_flower)$/;
const NEEDS_BELOW = /^(torch|soul_torch|copper_torch|redstone_torch|candle|.*_candle|.*_carpet|moss_carpet|.*_pressure_plate|rail|.*_rail|redstone_wire|snow|.*_sapling|poppy|dandelion|cornflower|oxeye_daisy|azure_bluet|allium|.*_tulip|lily_of_the_valley|blue_orchid|short_grass|fern|dead_bush|.*_mushroom|sugar_cane|wheat|carrots|potatoes|beetroots|.*_bed|.*_sign|.*_banner|brewing_stand|flower_pot|potted_.*|pink_petals|wildflowers|leaf_litter|bush|torchflower|firefly_bush|short_dry_grass)$/;
const WALL_MOUNTED = /^(wall_torch|soul_wall_torch|redstone_wall_torch|copper_wall_torch|.*_wall_sign|.*_wall_banner|ladder|.*_wall_hanging_sign)$/;
const OPP: Record<string, [number, number, number]> = { north: [0, 0, 1], south: [0, 0, -1], east: [-1, 0, 0], west: [1, 0, 0] };
const DIR: Record<string, [number, number, number]> = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };

export interface QAResult {
  findings: Finding[];
  rooms: { id: number; cells: number; bounds: Bounds; doors: number }[];
  doors: { pos: [number, number, number]; outside: [number, number, number] | null; inside: [number, number, number] | null }[];
  box: Bounds;
}

/**
 * Analyse `grid` (the full composite) inside `box` (usually the buildings' bounds + margin).
 * `focus` limits object-level checks (glass, doors, support…) to the components you care about (default: whole box).
 */
export function runQA(grid: VoxelGrid, box: Bounds, focusGrid?: VoxelGrid, groundAt?: (x: number, z: number) => number | null): QAResult {
  const db = assets();
  const [x0, y0, z0] = box.min, [x1, y1, z1] = box.max;
  const W = x1 - x0 + 1, H = y1 - y0 + 1, D = z1 - z0 + 1;
  if (W * H * D > 12_000_000) throw new Error(`QA box too large (${W}×${H}×${D}); pass components or a smaller region`);
  const idx = (x: number, y: number, z: number) => (y - y0) * W * D + (z - z0) * W + (x - x0);
  const nameAt = (x: number, y: number, z: number) => {
    const id = grid.getId(x, y, z);
    if (id === undefined && groundAt) {
      const g = groundAt(x, z);
      if (g !== null && y <= g) return "stone"; // world terrain under the build
    }
    return id === undefined || id === 0 ? null : parseState(PALETTE.get(id)).name;
  };
  const stateAt = (x: number, y: number, z: number) => {
    const id = grid.getId(x, y, z);
    return id === undefined || id === 0 ? null : parseState(PALETTE.get(id));
  };
  const passCache = new Map<string, boolean>();
  const passable = (n: string | null) => {
    if (n === null) return true;
    let v = passCache.get(n);
    if (v === undefined) {
      v = PASSABLE.test(n);
      passCache.set(n, v);
    }
    return v;
  };
  const solidCache = new Map<string, boolean>();
  const solid = (n: string | null) => {
    if (n === null) return false;
    let v = solidCache.get(n);
    if (v === undefined) {
      v = !passable(n);
      solidCache.set(n, v);
    }
    return v;
  };
  const inFocus = (x: number, y: number, z: number) => !focusGrid || focusGrid.getId(x, y, z) !== undefined;
  const findings: Finding[] = [];
  const add = (severity: Finding["severity"], kind: string, pos: [number, number, number], message: string) => findings.push({ severity, kind, pos, message });

  // ---- 1. air flood from the outside (doors passable) → sealed spaces; (doors closed) → rooms ----
  const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const flood = (doorsOpen: boolean) => {
    const seen = new Uint8Array(W * H * D);
    const q: number[] = [];
    const open = (x: number, y: number, z: number) => {
      const n = nameAt(x, y, z);
      if (!doorsOpen && n && /_door$|fence_gate$/.test(n)) return false;
      return passable(n);
    };
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          if (x !== x0 && x !== x1 && y !== y0 && y !== y1 && z !== z0 && z !== z1) continue;
          if (!open(x, y, z)) continue;
          const i = idx(x, y, z);
          if (!seen[i]) {
            seen[i] = 1;
            q.push(x, y, z);
          }
        }
    for (let h = 0; h < q.length; h += 3) {
      const x = q[h], y = q[h + 1], z = q[h + 2];
      for (const [dx, dy, dz] of N6) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || nz < z0 || nz > z1) continue;
        const i = idx(nx, ny, nz);
        if (seen[i] || !open(nx, ny, nz)) continue;
        seen[i] = 1;
        q.push(nx, ny, nz);
      }
    }
    return seen;
  };
  const outsideOpen = flood(true);
  const outsideClosed = flood(false);
  // interior components with doors closed = rooms
  const roomId = new Int32Array(W * H * D);
  const rooms: QAResult["rooms"] = [];
  let next = 1;
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const i = idx(x, y, z);
        if (outsideClosed[i] || roomId[i] || !passable(nameAt(x, y, z)) || /_door$|fence_gate$/.test(nameAt(x, y, z) ?? "")) continue;
        const id = next++;
        const st = [x, y, z];
        roomId[i] = id;
        let cells = 0;
        const bmin: [number, number, number] = [x, y, z], bmax: [number, number, number] = [x, y, z];
        while (st.length) {
          const cz = st.pop()!, cy = st.pop()!, cx = st.pop()!;
          cells++;
          bmin[0] = Math.min(bmin[0], cx); bmin[1] = Math.min(bmin[1], cy); bmin[2] = Math.min(bmin[2], cz);
          bmax[0] = Math.max(bmax[0], cx); bmax[1] = Math.max(bmax[1], cy); bmax[2] = Math.max(bmax[2], cz);
          for (const [dx, dy, dz] of N6) {
            const nx = cx + dx, ny = cy + dy, nz = cz + dz;
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || nz < z0 || nz > z1) continue;
            const j = idx(nx, ny, nz);
            if (roomId[j] || outsideClosed[j]) continue;
            const n = nameAt(nx, ny, nz);
            if (!passable(n) || /_door$|fence_gate$/.test(n ?? "")) continue;
            roomId[j] = id;
            st.push(nx, ny, nz);
          }
        }
        // only spaces a player could stand in count as rooms
        let standable = false;
        for (let yy = bmin[1]; yy <= bmax[1] && !standable; yy++)
          for (let zz = bmin[2]; zz <= bmax[2] && !standable; zz++)
            for (let xx = bmin[0]; xx <= bmax[0] && !standable; xx++)
              if (roomId[idx(xx, yy, zz)] === id && yy + 1 <= y1 && roomId[idx(xx, yy + 1, zz)] === id && solid(nameAt(xx, yy - 1, zz))) standable = true;
        if (cells >= 4 && standable) rooms.push({ id, cells, bounds: { min: bmin, max: bmax }, doors: 0 });
      }
  // sealed rooms: not reachable from outside even with doors open
  for (const r of rooms) {
    let reachable = false;
    const b = r.bounds;
    for (let y = b.min[1]; y <= b.max[1] && !reachable; y++)
      for (let z = b.min[2]; z <= b.max[2] && !reachable; z++)
        for (let x = b.min[0]; x <= b.max[0] && !reachable; x++) if (roomId[idx(x, y, z)] === r.id && outsideOpen[idx(x, y, z)]) reachable = true;
    const c: [number, number, number] = [Math.round((b.min[0] + b.max[0]) / 2), b.min[1], Math.round((b.min[2] + b.max[2]) / 2)];
    if (!reachable && r.cells >= 8)
      add("info", "sealed-room", c, `enclosed room (${r.cells} air cells, x ${b.min[0]}..${b.max[0]} y ${b.min[1]}..${b.max[1]} z ${b.min[2]}..${b.max[2]}) has NO entrance — add a door or opening`);
  }
  // ---- player walk test: start on open ground (sky above), walk (step up/down 1, through doors);
  //      every roofed floor area that can't be reached has no usable entrance ----
  const isStair = (n: string | null) => !!n && /_stairs$|_slab$/.test(n);
  const climb = (x: number, y: number, z: number) => /^(ladder|vine|scaffolding|twisting_vines.*|weeping_vines.*)$/.test(nameAt(x, y, z) ?? "");
  const standable = (x: number, y: number, z: number) =>
    y - 1 >= y0 && y + 1 <= y1 && (solid(nameAt(x, y - 1, z)) || climb(x, y, z) || climb(x, y - 1, z)) && !solid(nameAt(x, y, z)) && !solid(nameAt(x, y + 1, z));
  const covered = (x: number, y: number, z: number) => {
    for (let yy = y + 2; yy <= y1; yy++) if (solid(nameAt(x, yy, z))) return true;
    return false;
  };
  const walked = new Uint8Array(W * H * D);
  const wq: number[] = [];
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++)
      for (let y = y1 - 1; y > y0; y--) {
        if (standable(x, y, z) && !covered(x, y, z)) {
          walked[idx(x, y, z)] = 1;
          wq.push(x, y, z);
        }
      }
  for (let h = 0; h < wq.length; h += 3) {
    const x = wq[h], y = wq[h + 1], z = wq[h + 2];
    // climbing up/down ladders
    for (const dy of [1, -1]) {
      if (!(climb(x, y, z) || climb(x, y + dy, z))) continue;
      const ny = y + dy;
      if (ny <= y0 || ny >= y1 || solid(nameAt(x, ny, z)) || solid(nameAt(x, ny + 1, z))) continue;
      const k = idx(x, ny, z);
      if (!walked[k]) { walked[k] = 1; wq.push(x, ny, z); }
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      for (const dy of [0, 1, -1, -2]) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || ny <= y0 || ny >= y1) continue;
        if (!standable(nx, ny, nz)) continue;
        if (dy === 1 && solid(nameAt(x, y + 2, z))) continue; // no headroom to step up
        const k = idx(nx, ny, nz);
        if (!walked[k]) {
          walked[k] = 1;
          wq.push(nx, ny, nz);
        }
        break;
      }
  }
  // cluster unreachable covered floor cells (only inside the focus components' footprint if given)
  const unreachableSeen = new Uint8Array(W * H * D);
  for (let y = y0 + 1; y < y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const i0 = idx(x, y, z);
        if (walked[i0] || unreachableSeen[i0] || !standable(x, y, z) || !covered(x, y, z)) continue;
        if (focusGrid && !focusGrid.get(x, y - 1, z) && !focusGrid.get(x, y + 2, z)) continue;
        const st = [x, y, z];
        unreachableSeen[i0] = 1;
        let n = 0;
        const mn = [x, y, z], mx = [x, y, z];
        while (st.length) {
          const cz = st.pop()!, cy = st.pop()!, cx = st.pop()!;
          n++;
          mn[0] = Math.min(mn[0], cx); mn[1] = Math.min(mn[1], cy); mn[2] = Math.min(mn[2], cz);
          mx[0] = Math.max(mx[0], cx); mx[1] = Math.max(mx[1], cy); mx[2] = Math.max(mx[2], cz);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
            for (const dy of [0, 1, -1]) {
              const nx = cx + dx, ny = cy + dy, nz = cz + dz;
              if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || ny <= y0 || ny >= y1) continue;
              const k = idx(nx, ny, nz);
              if (unreachableSeen[k] || walked[k] || !standable(nx, ny, nz) || !covered(nx, ny, nz)) continue;
              unreachableSeen[k] = 1;
              st.push(nx, ny, nz);
              break;
            }
        }
        if (n < 4) continue;
        // classify: an enclosed space (inside a room with doors closed) vs. an outdoor ledge
        let inRoom = 0;
        for (let yy = mn[1]; yy <= mx[1]; yy++)
          for (let zz = mn[2]; zz <= mx[2]; zz++)
            for (let xx = mn[0]; xx <= mx[0]; xx++) if (unreachableSeen[idx(xx, yy, zz)] && roomId[idx(xx, yy, zz)]) inRoom++;
        const pos: [number, number, number] = [Math.round((mn[0] + mx[0]) / 2), mn[1], Math.round((mn[2] + mx[2]) / 2)];
        const where = `(x ${mn[0]}..${mx[0]}, y ${mn[1]}..${mx[1]}, z ${mn[2]}..${mx[2]})`;
        // geometric test too: rooms with a hole in the wall leak air but are still rooms if walled on >= 3 sides
        let enclosed = 0, sampled = 0;
        for (let yy = mn[1]; yy <= mx[1]; yy++)
          for (let zz = mn[2]; zz <= mx[2]; zz++)
            for (let xx = mn[0]; xx <= mx[0]; xx++) {
              if (!unreachableSeen[idx(xx, yy, zz)]) continue;
              sampled++;
              let hits = 0;
              for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                for (let k = 1; k <= 14; k++) {
                  const ax = xx + dx * k, az = zz + dz * k;
                  if (solid(nameAt(ax, yy, az)) || solid(nameAt(ax, yy + 1, az))) { hits++; break; }
                }
              }
              if (hits >= 3) enclosed++;
            }
        if (inRoom < n / 2 && enclosed < sampled * 0.6) {
          if (n >= 12) add("warning", "unreachable-area", pos, `covered outdoor area of ${n} cells ${where} can't be reached on foot`);
          continue;
        }
        // designed-for-use spaces (windows, furniture, lights) are errors; bare closed spaces (attics, voids) are warnings
        let used = false, glassOnly = false;
        const groundLevel = mn[1] <= box.min[1] + 3 + 2; // the building's lowest floor (box has a 3-block margin below)
        for (let yy = mn[1] - 1; yy <= mx[1] + 3 && !used; yy++)
          for (let zz = mn[2] - 1; zz <= mx[2] + 1 && !used; zz++)
            for (let xx = mn[0] - 1; xx <= mx[0] + 1 && !used; xx++) {
              const nm = nameAt(xx, yy, zz);
              if (nm && /_bed$|chest|barrel|lantern|torch|candle|bookshelf|table|furnace|smoker|carpet|_door$|flower_pot|potted_|crafting|lectern|cauldron/.test(nm)) used = true;
              else if (nm && /glass|_pane$|_bars$/.test(nm)) glassOnly = true;
            }
        if (used || groundLevel)
          add("error", "no-entrance", pos, `room with floor area ${n} cells ${where} can't be entered on foot — missing door/opening, blocked doorway, or a step higher than 1 block`);
        else add("warning", "closed-space", pos, `closed space ${n} cells ${where} has no access${glassOnly ? " but has windows" : ""} (fine for an attic; otherwise add stairs/ladder/door)`);
      }
  void isStair;

  // ---- 2. object checks (limited to focus components) ----
  const glassLike = (n: string | null) => !!n && /glass|_pane$|_bars$/.test(n);
  let strays = 0;
  for (const [x, y, z, id] of (focusGrid ?? grid).entries()) {
    if (id === 0 || x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1) continue;
    const st = parseState(PALETTE.get(id));
    const n = st.name;
    // glass that isn't part of a wall
    if (glassLike(n)) {
      const side = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]].filter(([dx, dy, dz]) => {
        const m = nameAt(x + dx, y + dy, z + dz);
        return solid(m) || glassLike(m);
      }).length;
      if (side <= 1) add("error", "floating-glass", [x, y, z], `${n} is not held by a wall/frame (only ${side} solid neighbour) — it looks like glass hanging in the air`);
      else if (n.endsWith("_pane") || n === "glass_pane") {
        const horiz = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].filter(([dx, , dz]) => {
          const m = nameAt(x + dx, y, z + dz);
          return solid(m) || glassLike(m);
        }).length;
        if (horiz === 0) add("warning", "pane-post", [x, y, z], `${n} has no horizontal neighbours, it renders as a thin post — put panes inside a wall opening`);
      }
      // glass with an exterior neighbour on both faces but inside a 1-thick wall is fine; glass with nothing behind at all is fine too
    }
    // supports
    if (NEEDS_BELOW.test(n) && !(n === "snow")) {
      const below = nameAt(x, y - 1, z);
      const okBelow = !!below && (solid(below) || /_bed$|_slab|_stairs|farmland|_pot$/.test(below) || (n.endsWith("_bed") && below !== null));
      if (!okBelow && !(n.endsWith("_bed") || n.endsWith("_banner") || n.endsWith("_sign")) && !(n === "lantern")) add("warning", "unsupported", [x, y, z], `${n} has nothing to stand on`);
    }
    if ((n === "lantern" || n === "soul_lantern") ) {
      const hanging = st.props.hanging === "true";
      const support = hanging ? nameAt(x, y + 1, z) : nameAt(x, y - 1, z);
      if (!support || (hanging ? false : PASSABLE.test(support) && !/chain/.test(support))) {
        if (!support) add("warning", "unsupported", [x, y, z], `${n}${hanging ? " (hanging)" : ""} has nothing ${hanging ? "above" : "below"} it`);
      }
    }
    if (WALL_MOUNTED.test(n) && st.props.facing) {
      const o = OPP[st.props.facing];
      if (o && !solid(nameAt(x + o[0], y, z + o[2]))) add("warning", "unsupported", [x, y, z], `${n} (facing ${st.props.facing}) is not attached to a wall`);
    }
    // doors: blocked or leading nowhere
    if (n.endsWith("_door") && st.props.half !== "upper") {
      const f = st.props.facing ?? "north";
      const sides = [DIR[f], OPP[f]];
      for (const [dx, , dz] of sides) {
        if (solid(nameAt(x + dx, y, z + dz)) || solid(nameAt(x + dx, y + 1, z + dz))) {
          add("error", "blocked-door", [x, y, z], `door at [${x},${y},${z}] is blocked on the ${dx > 0 ? "east" : dx < 0 ? "west" : dz > 0 ? "south" : "north"} side`);
          break;
        }
      }
      if (!solid(nameAt(x, y - 1, z))) add("warning", "door-floor", [x, y, z], `door has no floor below it`);
      const up = nameAt(x, y + 1, z);
      if (!up || !up.endsWith("_door")) add("error", "door-half", [x, y, z], `door has no upper half`);
    }
    // stray blocks: a non-passable block with no non-air neighbour at all
    if (!PASSABLE.test(n) && !/leaves|_log$|_wood$/.test(n)) {
      let neigh = 0;
      for (const [dx, dy, dz] of N6) if (nameAt(x + dx, y + dy, z + dz)) neigh++;
      if (neigh === 0 && inFocus(x, y, z)) {
        strays++;
        if (strays <= 15) add("warning", "stray-block", [x, y, z], `${n} floats on its own (no neighbours)`);
      }
    }
  }
  // doors: find inside/outside standing points
  const doors: QAResult["doors"] = [];
  for (const [x, y, z, id] of (focusGrid ?? grid).entries()) {
    if (id === 0) continue;
    const st = parseState(PALETTE.get(id));
    if (!st.name.endsWith("_door") || st.props.half === "upper") continue;
    if (x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1) continue;
    const f = st.props.facing ?? "north";
    let outside: [number, number, number] | null = null, inside: [number, number, number] | null = null;
    for (const d of [DIR[f], OPP[f]]) {
      const p: [number, number, number] = [x + d[0], y, z + d[2]];
      if (p[0] < x0 || p[0] > x1 || p[2] < z0 || p[2] > z1) continue;
      const i = idx(p[0], p[1], p[2]);
      if (outsideClosed[i]) outside = p;
      else if (roomId[i]) {
        inside = p;
        const r = rooms.find((rr) => rr.id === roomId[i]);
        if (r) r.doors++;
      }
    }
    if (!outside && !inside) add("warning", "door-nowhere", [x, y, z], "door connects nothing (no air on either side)");
    else if (outside && !inside) add("info", "door-outside-only", [x, y, z], "door opens outside on both sides (not leading into a room)");
    doors.push({ pos: [x, y, z], outside, inside });
  }
  if (strays > 15) add("warning", "stray-block", findings.find((f) => f.kind === "stray-block")!.pos, `${strays} stray blocks in total`);

  // ---- 3. rooms that a player can reach but with no light (only if there are some light sources at all) ----
  void db;
  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : b.severity === "error" ? 1 : a.severity === "warning" ? -1 : 1));
  return { findings, rooms, doors, box };
}

/** Standing height at (x,z): highest y such that (x,y-1,z) is solid and (x,y),(x,y+1) are free, searching from yTop down. */
export function standY(grid: VoxelGrid, x: number, z: number, yTop: number, yMin: number, groundAt?: (x: number, z: number) => number | null): number | null {
  const g = groundAt?.(x, z) ?? null;
  for (let y = yTop; y > yMin; y--) {
    const b = grid.get(x, y - 1, z);
    if (!b) {
      if (g !== null && y - 1 <= g) return y; // standing on world terrain
      continue;
    }
    const n = parseState(b).name;
    if (PASSABLE.test(n)) continue;
    const a = grid.get(x, y, z), a2 = grid.get(x, y + 1, z);
    if ((!a || PASSABLE.test(parseState(a).name)) && (!a2 || PASSABLE.test(parseState(a2).name))) return y;
    return null;
  }
  return null;
}

/** Choose player-perspective viewpoints for a walkthrough. Returns render view names (eye:/room:). */
export function walkthroughViews(grid: VoxelGrid, focus: Bounds, qa: QAResult, o: { from?: number[]; max?: number; groundAt?: (x: number, z: number) => number | null } = {}): { views: string[]; labels: string[] } {
  const views: string[] = [], labels: string[] = [];
  const c = [(focus.min[0] + focus.max[0]) / 2, (focus.min[1] + focus.max[1]) / 2, (focus.min[2] + focus.max[2]) / 2];
  const yawTo = (fx: number, fz: number, tx: number, tz: number) => (Math.atan2(-(tx - fx), tz - fz) * 180) / Math.PI;
  const push = (v: string, l: string) => {
    views.push(v);
    labels.push(l);
  };
  // 1. approach from four sides at eye level (stand on the ground, ~8 blocks out, look at the build)
  for (const [dx, dz, name] of [[0, 1, "south"], [1, 0, "east"], [0, -1, "north"], [-1, 0, "west"]] as const) {
    const half = dx ? (focus.max[0] - focus.min[0]) / 2 : (focus.max[2] - focus.min[2]) / 2;
    let spot: [number, number, number] | null = null;
    for (let d = Math.round(half + 9); d >= Math.round(half + 2); d--) {
      const x = Math.round(c[0] + dx * d), z = Math.round(c[2] + dz * d);
      const y = standY(grid, x, z, focus.max[1] + 2, focus.min[1] - 30, o.groundAt);
      if (y !== null) { spot = [x, y, z]; break; }
    }
    const floor = qa.doors.length ? Math.min(...qa.doors.map((d) => d.pos[1])) : focus.min[1];
    if (!spot || spot[1] < floor - 1) {
      // nothing to stand on at a sensible height (void map / cliff edge): hover at the build's floor level like a flying player
      const d = Math.round(half + 9);
      spot = [Math.round(c[0] + dx * d), floor, Math.round(c[2] + dz * d)];
    }
    const yaw = yawTo(spot[0], spot[2], c[0], c[2]);
    const pitch = -Math.max(-25, Math.min(25, ((Math.atan2(c[1] - (spot[1] + 1.6), Math.hypot(c[0] - spot[0], c[2] - spot[2])) * 180) / Math.PI)));
    push(`eye:${spot.join(",")},${yaw.toFixed(0)},${pitch.toFixed(0)},80`, `approach from ${name}`);
  }
  // 2. doors: outside looking in, inside looking out
  for (const d of qa.doors.slice(0, 3)) {
    if (d.outside) {
      const back = [d.outside[0] + (d.outside[0] - d.pos[0]) * 3, d.outside[1], d.outside[2] + (d.outside[2] - d.pos[2]) * 3];
      const y = standY(grid, back[0], back[2], d.pos[1] + 3, d.pos[1] - 4, o.groundAt) ?? d.pos[1];
      push(`eye:${back[0]},${y},${back[2]},${yawTo(back[0], back[2], d.pos[0], d.pos[2]).toFixed(0)},5,80`, `door at [${d.pos}] from outside`);
    }
    if (d.inside) push(`eye:${d.inside.join(",")},${yawTo(d.inside[0], d.inside[2], 2 * d.inside[0] - d.pos[0], 2 * d.inside[2] - d.pos[2]).toFixed(0)},8,90`, `entering through door [${d.pos}]`);
  }
  // 3. rooms (largest first)
  // one view per floor level of each room (multi-storey rooms connected by stairs would otherwise put the camera in the roof)
  for (const r of [...qa.rooms].sort((a, b) => b.doors - a.doors || b.cells - a.cells).slice(0, 3)) {
    const b = r.bounds;
    const levels: number[] = [];
    for (let y = b.min[1]; y <= b.max[1] - 1; y++) {
      let n = 0;
      for (let z = b.min[2]; z <= b.max[2]; z++)
        for (let x = b.min[0]; x <= b.max[0]; x++) {
          const below = grid.get(x, y - 1, z), here = grid.get(x, y, z);
          if (below && !PASSABLE.test(parseState(below).name) && (!here || PASSABLE.test(parseState(here).name))) n++;
        }
      const area = (b.max[0] - b.min[0] + 1) * (b.max[2] - b.min[2] + 1);
      if (n >= Math.max(6, area * 0.3) && (!levels.length || y - levels[levels.length - 1] >= 3)) levels.push(y);
    }
    for (const ly of levels.slice(0, 2)) {
      // stand on a real floor cell of this level (far from the centre, with room to look across), look at the centre
      const free = (x: number, y: number, z: number) => {
        const a = grid.get(x, y, z);
        return !a || PASSABLE.test(parseState(a).name);
      };
      const cells: [number, number][] = [];
      for (let z = b.min[2]; z <= b.max[2]; z++)
        for (let x = b.min[0]; x <= b.max[0]; x++) {
          const below = grid.get(x, ly - 1, z);
          if (below && !PASSABLE.test(parseState(below).name) && free(x, ly, z) && free(x, ly + 1, z)) cells.push([x, z]);
        }
      if (!cells.length) continue;
      const cx = cells.reduce((s2, c2) => s2 + c2[0], 0) / cells.length, cz = cells.reduce((s2, c2) => s2 + c2[1], 0) / cells.length;
      const set = new Set(cells.map((c2) => `${c2[0]},${c2[1]}`));
      let best: [number, number] = cells[0], bestScore = -1;
      for (const [x, z] of cells) {
        const d = Math.hypot(x - cx, z - cz);
        // prefer spots whose step toward the centre is also walkable (not wedged behind furniture)
        const sx = x + Math.sign(Math.round(cx - x)), sz = z + Math.sign(Math.round(cz - z));
        const score = d + (set.has(`${sx},${sz}`) ? 3 : 0);
        if (score > bestScore) { bestScore = score; best = [x, z]; }
      }
      const yaw = yawTo(best[0], best[1], cx, cz);
      push(`eye:${best[0]},${ly},${best[1]},${yaw.toFixed(0)},12,95`, `inside room ${b.max[0] - b.min[0] + 1}×${b.max[2] - b.min[2] + 1}, floor y=${ly} (${r.doors} door${r.doors === 1 ? "" : "s"})`);
    }
  }
  // 4. look around from a given spot (e.g. spawn)
  if (o.from) {
    for (const yaw of [180, -90, 0, 90]) push(`eye:${o.from.join(",")},${yaw},5,80`, `from [${o.from}] looking ${{ 180: "north", "-90": "east", 0: "south", 90: "west" }[String(yaw)]}`);
  }
  const max = o.max ?? 12;
  return { views: views.slice(0, max), labels: labels.slice(0, max) };
}

export function formatFindings(r: QAResult, limit = 40): string {
  const e = r.findings.filter((f) => f.severity === "error").length, w = r.findings.filter((f) => f.severity === "warning").length;
  const lines = [`QA: ${e} error(s), ${w} warning(s). Rooms found: ${r.rooms.length} (${r.rooms.map((x) => `${x.bounds.max[0] - x.bounds.min[0] + 1}×${x.bounds.max[2] - x.bounds.min[2] + 1} with ${x.doors} door(s)`).join(", ") || "none"}). Doors: ${r.doors.length}.`];
  for (const f of r.findings.slice(0, limit)) lines.push(`- [${f.severity}] ${f.kind} at [${f.pos}]: ${f.message}  → look: detail:${f.pos.join(",")},4`);
  if (r.findings.length > limit) lines.push(`… and ${r.findings.length - limit} more`);
  if (!r.findings.length) lines.push("No problems found. Still do a walkthrough — QA can't judge beauty.");
  return lines.join("\n");
}
