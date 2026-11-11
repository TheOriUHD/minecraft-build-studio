// Interior analysis: block-light simulation, dark spots, headroom, reachability from the door, furniture density.
import { VoxelGrid, Bounds, key } from "./voxel.ts";
import { PALETTE, parseState } from "./blocks/state.ts";
import { assets } from "./blocks/assets.ts";
import { dims } from "./inspect.ts";

const LIGHT: [RegExp, number][] = [
  [/^(lantern|glowstone|sea_lantern|shroomlight|jack_o_lantern|beacon|conduit|.*froglight|lava|lava_cauldron)$/, 15],
  [/^(torch|wall_torch|end_rod|copper_torch|copper_wall_torch)$/, 14],
  [/^(soul_lantern|soul_torch|soul_wall_torch|soul_campfire)$/, 10],
];

export function lightOf(s: string): number {
  const st = parseState(s);
  const n = st.name;
  if (n === "campfire") return st.props.lit === "false" ? 0 : 15;
  if (n.endsWith("candle")) return st.props.lit === "true" ? 3 * parseInt(st.props.candles ?? "1", 10) : 0;
  if (n === "redstone_lamp") return st.props.lit === "true" ? 15 : 0;
  if (n.endsWith("furnace") || n === "smoker") return st.props.lit === "true" ? 13 : 0;
  if (n.endsWith("copper_bulb")) return st.props.lit === "true" ? 15 : 0;
  for (const [re, v] of LIGHT) if (re.test(n)) return v;
  return 0;
}

const PASSABLE = /carpet|_button|torch|pressure_plate|flower$|^short_grass|tall_grass|fern|_sign|banner|lantern|candle|vine|rail|^snow$|ladder|_door$|fence_gate|^air$|cave_air|lever|tripwire|_pot$|potted_/;

export function analyzeInterior(grid: VoxelGrid, box: Bounds, entry?: number[]): string {
  const db = assets();
  const opaqueCache = new Map<number, boolean>();
  const nameOf = (x: number, y: number, z: number) => {
    const id = grid.getId(x, y, z);
    return id === undefined || id === 0 ? null : parseState(PALETTE.get(id)).name;
  };
  const opaque = (x: number, y: number, z: number) => {
    const id = grid.getId(x, y, z);
    if (id === undefined || id === 0) return false;
    let v = opaqueCache.get(id);
    if (v === undefined) {
      v = db.isFullOpaque(parseState(PALETTE.get(id)).name);
      opaqueCache.set(id, v);
    }
    return v;
  };
  const blocksMove = (x: number, y: number, z: number) => {
    const n = nameOf(x, y, z);
    return n !== null && !PASSABLE.test(n);
  };
  const standable = (x: number, y: number, z: number) => {
    const n = nameOf(x, y - 1, z);
    if (n === null) return false;
    if (PASSABLE.test(n)) return blocksMove(x, y - 2, z); // carpet etc. on top of a floor
    return true;
  };
  const pad = 15;
  const min = [box.min[0] - pad, box.min[1] - 2, box.min[2] - pad];
  const max = [box.max[0] + pad, box.max[1] + 2, box.max[2] + pad];
  const inBig = (x: number, y: number, z: number) => x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2];

  // block light flood fill
  const light = new Map<number, number>();
  const q: [number, number, number, number][] = [];
  for (const [x, y, z, id] of grid.entries()) {
    if (id === 0 || !inBig(x, y, z)) continue;
    const l = lightOf(PALETTE.get(id));
    if (l > 0) {
      light.set(key(x, y, z), l);
      q.push([x, y, z, l]);
    }
  }
  const sources = q.length;
  const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let i = 0; i < q.length; i++) {
    const [x, y, z, l] = q[i];
    if (l <= 1) continue;
    for (const [dx, dy, dz] of D6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (!inBig(nx, ny, nz) || opaque(nx, ny, nz)) continue;
      const k = key(nx, ny, nz);
      if ((light.get(k) ?? 0) >= l - 1) continue;
      light.set(k, l - 1);
      q.push([nx, ny, nz, l - 1]);
    }
  }

  // walkable cells
  const walk: number[][] = [];
  const walkSet = new Set<number>();
  for (let y = box.min[1]; y <= box.max[1]; y++)
    for (let z = box.min[2]; z <= box.max[2]; z++)
      for (let x = box.min[0]; x <= box.max[0]; x++)
        if (!blocksMove(x, y, z) && !blocksMove(x, y + 1, z) && standable(x, y, z) && (y === box.min[1] || /stairs|slab/.test(nameOf(x, y - 1, z) ?? ""))) {
          walk.push([x, y, z]);
          walkSet.add(key(x, y, z));
        }
  if (!walk.length) return "No walkable floor found in this box. Pass the room's interior air volume (min.y = first air layer above the floor).";
  const lv = (p: number[]) => light.get(key(p[0], p[1], p[2])) ?? 0;
  const dark = walk.filter((p) => lv(p) < 8);
  const black = walk.filter((p) => lv(p) === 0);
  let low = 0;
  for (const [x, y, z] of walk) if (blocksMove(x, y + 2, z)) low++;

  // reachability
  let start = entry as number[] | undefined;
  if (!start) {
    outer: for (const p of walk)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = nameOf(p[0] + dx, p[1], p[2] + dz);
        if (n && /_door$/.test(n)) {
          start = p;
          break outer;
        }
      }
  }
  let reach = "no door next to the floor found (pass entry to test reachability)";
  if (start) {
    const seen = new Set<number>([key(start[0], start[1], start[2])]);
    const st = [start];
    while (st.length) {
      const [x, y, z] = st.pop()!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        for (const dy of [0, 1, -1]) {
          const k = key(x + dx, y + dy, z + dz);
          if (!walkSet.has(k)) continue;
          if (!seen.has(k)) {
            seen.add(k);
            st.push([x + dx, y + dy, z + dz]);
          }
          break;
        }
    }
    const unreachable = walk.filter((p) => !seen.has(key(p[0], p[1], p[2])));
    reach = `${seen.size}/${walk.length} walkable cells reachable from [${start}]` + (unreachable.length ? `; unreachable e.g. ${unreachable.slice(0, 6).map((p) => `[${p}]`).join(" ")}` : " (all)");
  }

  // furniture / clutter inside the box
  let furn = 0;
  for (let y = box.min[1]; y <= box.max[1]; y++)
    for (let z = box.min[2]; z <= box.max[2]; z++)
      for (let x = box.min[0]; x <= box.max[0]; x++) if (nameOf(x, y, z)) furn++;
  const cols = new Set(walk.map(([x, , z]) => `${x},${z}`)).size;
  return [
    `Interior check for ${dims(box)}:`,
    `- walkable floor cells: ${walk.length} (${cols} columns); light sources within 15 blocks: ${sources}`,
    `- light: ${walk.length - dark.length}/${walk.length} cells at block light >= 8; dark (<8): ${dark.length}${dark.length ? ` e.g. ${dark.slice(0, 8).map((p) => `[${p}]`).join(" ")}` : ""}; pitch black: ${black.length}`,
    `- headroom: ${low} walkable cells have < 3 blocks clear above`,
    `- reachability: ${reach}`,
    `- furniture/clutter blocks inside: ${furn} = ${(furn / Math.max(1, cols)).toFixed(2)} per floor column (lived-in rooms ~0.6-1.5; < 0.3 feels empty)`,
  ].join("\n");
}
