// Built-in component library: well-proportioned details that read well in Minecraft.
// All functions take a Builder (usually a facade frame from b.around(), where +z is outward) and options.
import { Builder, family } from "./builder.ts";
import { BlockSpec, Vec, hash3, mulberry32 } from "./patterns.ts";
import { furnish, furniture, STYLES } from "./interior.ts";
import { HeightMap, TERRAIN_PALETTES, scatter, scatterPoints, rock } from "./terrain.ts";
import { plaza, spawnPad, fountain, portal, bridge, statue, wall } from "./lobby.ts";

type F = Builder;

export interface Terrain {
  height(x: number, z: number): number;
  surface(x: number, z: number): string;
}

export function makeLib(terrain: Terrain) {
  const lib = {
    family,
    furnish,
    // pieces accept a style name ("medieval") or a style object
    furniture: Object.fromEntries(
      Object.entries(furniture).map(([k, fn]) => [k, (...args: any[]) => (fn as any)(...args.map((a) => (typeof a === "string" && (STYLES as any)[a] ? (STYLES as any)[a] : a)))]),
    ) as typeof furniture,
    styles: STYLES,
    // landscapes
    heightmap: (x0: number, z0: number, w: number, d: number, base = 0) => new HeightMap(x0, z0, w, d, base),
    terrainPalettes: TERRAIN_PALETTES,
    scatter: (b: Builder, hm: HeightMap, a: [number, number], c: [number, number], o: any) => scatter(b, lib, hm, a, c, o),
    scatterPoints,
    rock,
    // map / lobby pieces
    plaza, spawnPad, fountain, portal, bridge, statue, wall,

    /**
     * Window in a facade frame. Carves w×h at (x, y) through the wall (depth `wall` blocks inward),
     * glass recessed one block (inset), optional sill (upside-down stairs below, outside), lintel, shutters.
     */
    window(f: F, x: number, y: number, o: { w?: number; h?: number; glass?: BlockSpec; inset?: number; wall?: number; sill?: string | null; lintel?: BlockSpec | null; shutters?: string | null; frame?: BlockSpec | null; arch?: "round" | "pointed" | "segmental" | null } = {}) {
      const w = o.w ?? 1, h = o.h ?? 2, wall = o.wall ?? 1, inset = o.inset ?? (wall > 1 ? 1 : 0);
      const glass = o.glass ?? "glass_pane";
      if (o.frame) {
        f.fill([x - 1, y - 1, 0], [x + w, y + h, 0], o.frame);
      }
      if (o.arch) {
        f.arch(x, x + w - 1, y, h, "air", { style: o.arch, z: 0, depth: Math.max(wall, inset + 1) });
        f.arch(x, x + w - 1, y, h, glass, { style: o.arch, z: -inset, depth: 1 });
      } else {
        f.fill([x, y, 0], [x + w - 1, y + h - 1, -(Math.max(wall, inset + 1) - 1)], "air");
        f.fill([x, y, -inset], [x + w - 1, y + h - 1, -inset], glass);
      }
      if (o.sill !== null && o.sill !== undefined) {
        const s = family(o.sill).stairs;
        for (let i = 0; i < w; i++) f.set([x + i, y - 1, 1], `${s}[facing=north,half=top]`);
      }
      if (o.lintel) f.fill([x - (o.frame ? 1 : 0), y + h, 1], [x + w - 1 + (o.frame ? 1 : 0), y + h, 1], o.lintel);
      if (o.shutters) {
        for (let j = 0; j < h; j++) {
          f.set([x - 1, y + j, 1], `${o.shutters}[facing=south,open=true,half=bottom]`);
          f.set([x + w, y + j, 1], `${o.shutters}[facing=south,open=true,half=bottom]`);
        }
      }
    },

    /** Door in a facade frame at x (left column), floor y. width 1 or 2. Places both halves, carves the wall. */
    door(f: F, x: number, y: number, o: { wood?: string; width?: 1 | 2; wall?: number; frame?: BlockSpec | null; awning?: string | null; step?: string | null; inset?: number } = {}) {
      const wood = o.wood ?? "spruce";
      const width = o.width ?? 1, wall = o.wall ?? 1, inset = o.inset ?? 0;
      f.fill([x, y, 0], [x + width - 1, y + 2, -(wall - 1)], "air");
      for (let i = 0; i < width; i++) {
        const hinge = width === 2 ? (i === 0 ? "left" : "right") : "left";
        f.set([x + i, y, -inset], `${wood}_door[facing=north,half=lower,hinge=${hinge}]`);
        f.set([x + i, y + 1, -inset], `${wood}_door[facing=north,half=upper,hinge=${hinge}]`);
      }
      if (o.frame) {
        f.fill([x - 1, y, 1], [x - 1, y + 2, 1], o.frame);
        f.fill([x + width, y, 1], [x + width, y + 2, 1], o.frame);
        f.fill([x - 1, y + 3, 1], [x + width, y + 3, 1], o.frame);
      }
      if (o.awning) {
        const s = family(o.awning).stairs;
        for (let i = -1; i <= width; i++) f.set([x + i, y + 3, 2], `${s}[facing=north,half=bottom]`);
      }
      if (o.step) {
        const s = family(o.step).stairs;
        for (let i = 0; i < width; i++) f.set([x + i, y - 1, 1], `${s}[facing=north,half=bottom]`);
      }
    },

    /** Column with optional base and capital (works in any frame). */
    column(b: F, base: Vec, h: number, o: { shaft?: BlockSpec; base?: BlockSpec | null; capital?: BlockSpec | null } = {}) {
      const shaft = o.shaft ?? "stone_brick_wall";
      if (o.base) b.set(base, o.base);
      b.fill([base[0], base[1] + (o.base ? 1 : 0), base[2]], [base[0], base[1] + h - 1 - (o.capital ? 1 : 0), base[2]], shaft);
      if (o.capital) b.set([base[0], base[1] + h - 1, base[2]], o.capital);
    },

    /**
     * Timber framing on a facade frame: posts at the ends and every `spacing`, beams at each floor line,
     * optional diagonal braces. Places at z = offset (0 = in wall plane, 1 = proud of the wall).
     */
    timberFrame(f: F, width: number, height: number, o: { post?: string; beam?: string; spacing?: number; floors?: number[]; braces?: boolean; z?: number } = {}) {
      const post = o.post ?? "spruce_log", beam = o.beam ?? o.post ?? "spruce_log";
      const sp = o.spacing ?? 4, z = o.z ?? 0;
      const floors = o.floors ?? [0, height - 1];
      for (let x = 0; x < width; x += sp) f.fill([x, 0, z], [x, height - 1, z], `${post}[axis=y]`);
      f.fill([width - 1, 0, z], [width - 1, height - 1, z], `${post}[axis=y]`);
      for (const y of floors) f.fill([0, y, z], [width - 1, y, z], `${beam}[axis=x]`);
      if (o.braces) {
        for (let x = 0; x + sp < width; x += sp) {
          const span = Math.min(sp, width - 1 - x);
          if (span >= 3) f.line([x + 1, floors[0] + 1, z], [x + span - 1, Math.min(floors[0] + span - 1, height - 2), z], beam.replace(/_log$/, "_planks").replace(/_wood$/, "_planks"));
        }
      }
    },

    chimney(b: F, base: Vec, h: number, o: { material?: BlockSpec; cap?: string; smoke?: boolean } = {}) {
      const m = o.material ?? [["bricks", 5], ["stone_bricks", 1]];
      b.fill(base, [base[0], base[1] + h - 1, base[2]], m as BlockSpec);
      if (o.cap) b.set([base[0], base[1] + h, base[2]], o.cap);
      if (o.smoke) b.set([base[0], base[1] + h - 1, base[2]], "campfire[lit=true,signal_fire=false]");
    },

    /** Organic procedural tree. Leaves are persistent. */
    tree(b: F, base: Vec, o: { type?: "oak" | "spruce" | "birch" | "dark_oak" | "cherry" | "jungle" | "acacia"; height?: number; radius?: number; seed?: number } = {}) {
      const type = o.type ?? "oak";
      const rng = mulberry32(o.seed ?? hash3(base[0], base[1], base[2], 99) * 1e9);
      const log = `${type}_log`, leaves = `${type}_leaves[persistent=true]`;
      const h = o.height ?? (type === "spruce" ? rng.int(9, 14) : rng.int(6, 9));
      if (type === "spruce") {
        b.fill(base, [base[0], base[1] + h, base[2]], `${log}[axis=y]`);
        for (let y = 2; y <= h + 1; y++) {
          const t = (y - 2) / (h - 1);
          const r = Math.max(0.6, (o.radius ?? 3.5) * (1 - t) * (y % 2 === 0 ? 1 : 0.7));
          b.circle([base[0], base[1] + y, base[2]], r, leaves, { mask: "empty" });
        }
        b.set([base[0], base[1] + h + 2, base[2]], leaves);
        return;
      }
      const thick = type === "dark_oak" ? 2 : 1;
      for (let dx = 0; dx < thick; dx++)
        for (let dz = 0; dz < thick; dz++) b.fill([base[0] + dx, base[1], base[2] + dz], [base[0] + dx, base[1] + h - 2, base[2] + dz], `${log}[axis=y]`);
      const top: Vec = [base[0], base[1] + h - 1, base[2]];
      const R = o.radius ?? (type === "dark_oak" ? 4 : 3);
      const branches = rng.int(2, 4);
      const crowns: Vec[] = [top];
      for (let i = 0; i < branches; i++) {
        const ang = (i / branches) * Math.PI * 2 + rng() * 0.8;
        const len = R * (0.6 + rng() * 0.5);
        const by = base[1] + Math.floor(h * (0.5 + rng() * 0.25));
        const end: Vec = [Math.round(base[0] + Math.cos(ang) * len), by + rng.int(1, 3), Math.round(base[2] + Math.sin(ang) * len)];
        b.line([base[0], by, base[2]], end, `${type === "birch" ? "birch" : type}_wood`);
        crowns.push(end);
      }
      for (const c of crowns) {
        const rr = R * (0.65 + rng() * 0.35);
        b.ellipsoid(c, [rr, rr * 0.7, rr], (p: any) => (hash3(p.x, p.y, p.z, 5) < 0.88 ? leaves : "air"), { mask: "empty" });
      }
    },

    bush(b: F, p: Vec, o: { leaves?: string; r?: number } = {}) {
      const leaves = o.leaves ?? "oak_leaves[persistent=true]";
      const r = o.r ?? 1.2;
      b.ellipsoid(p, [r, r * 0.8, r], (q: any) => (hash3(q.x, q.y, q.z, 11) < 0.85 ? leaves : "air"), { mask: "empty", half: "top" });
    },

    lampPost(b: F, p: Vec, o: { h?: number; post?: string; lantern?: string } = {}) {
      const h = o.h ?? 3;
      b.set(p, "stone_brick_wall");
      b.fill([p[0], p[1] + 1, p[2]], [p[0], p[1] + h - 1, p[2]], o.post ?? "spruce_fence");
      b.set([p[0], p[1] + h, p[2]], o.lantern ?? "lantern[hanging=false]");
    },

    /** Path following the terrain, with soft, clustered material variation. points in local x,z. */
    path(b: F, points: [number, number][], o: { width?: number; material?: BlockSpec; follow?: boolean } = {}) {
      const width = o.width ?? 3;
      const mat = o.material ?? { mix: [["dirt_path", 5], ["coarse_dirt", 2], ["gravel", 1], ["packed_mud", 1]], scale: 2 };
      const r = (width - 1) / 2;
      const seen = new Set<string>();
      for (let i = 0; i < points.length - 1; i++) {
        const [x0, z0] = points[i], [x1, z1] = points[i + 1];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0), 1);
        for (let s = 0; s <= n; s++) {
          const cx = x0 + ((x1 - x0) * s) / n, cz = z0 + ((z1 - z0) * s) / n;
          for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
            for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
              if (Math.hypot(dx, dz) > r + 0.35) continue;
              const x = Math.round(cx + dx), z = Math.round(cz + dz);
              const k = `${x},${z}`;
              if (seen.has(k)) continue;
              seen.add(k);
              const y = o.follow === false ? 0 : terrain.height(x, z);
              b.set([x, y, z], mat);
            }
        }
      }
    },

    /**
     * Prepare a site: clear everything above the target floor level in the rectangle and fill below it
     * down to the terrain (foundation/plinth), so a build sits cleanly on uneven ground.
     */
    clearSite(b: F, a: [number, number], c: [number, number], o: { level?: number; fill?: BlockSpec; clearHeight?: number; margin?: number; topsoil?: BlockSpec } = {}) {
      const level = o.level ?? 0;
      const margin = o.margin ?? 0;
      const fillB = o.fill ?? "dirt";
      const x0 = Math.min(a[0], c[0]) - margin, x1 = Math.max(a[0], c[0]) + margin;
      const z0 = Math.min(a[1], c[1]) - margin, z1 = Math.max(a[1], c[1]) + margin;
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const t = terrain.height(x, z);
          for (let y = level; y <= Math.max(level, t) + (o.clearHeight ?? 12); y++) b.set([x, y, z], "air");
          for (let y = Math.min(t, level - 1); y <= level - 1; y++) b.set([x, y, z], y === level - 1 && o.topsoil ? o.topsoil : fillB);
        }
    },

    /** Straight flight of stairs going up in local +z from p. */
    stairs(b: F, p: Vec, steps: number, o: { material?: string; width?: number; support?: BlockSpec | null } = {}) {
      const fam = family(o.material ?? "spruce");
      const w = o.width ?? 1;
      for (let i = 0; i < steps; i++) {
        for (let k = 0; k < w; k++) {
          b.set([p[0] + k, p[1] + i, p[2] + i], `${fam.stairs}[facing=south,half=bottom]`);
          if (o.support !== null) b.fill([p[0] + k, p[1], p[2] + i], [p[0] + k, p[1] + i - 1, p[2] + i], o.support ?? fam.block);
        }
      }
    },

    // --- interior helpers (frame: +z is "forward") ---
    bed(b: F, p: Vec, o: { color?: string; facing?: string } = {}) {
      const c = o.color ?? "red";
      const facing = o.facing ?? "south";
      const d: Record<string, Vec> = { south: [0, 0, 1], north: [0, 0, -1], east: [1, 0, 0], west: [-1, 0, 0] };
      const v = d[facing];
      b.set(p, `${c}_bed[facing=${facing},part=foot]`);
      b.set([p[0] + v[0], p[1], p[2] + v[2]], `${c}_bed[facing=${facing},part=head]`);
    },
    table(b: F, p: Vec, o: { top?: string; leg?: string } = {}) {
      b.set(p, o.leg ?? "spruce_fence");
      b.set([p[0], p[1] + 1, p[2]], o.top ?? "spruce_pressure_plate");
    },
    chair(b: F, p: Vec, o: { wood?: string; facing?: string } = {}) {
      b.set(p, `${o.wood ?? "spruce"}_stairs[facing=${o.facing ?? "north"},half=bottom]`);
    },
    shelfWall(b: F, a: Vec, c: Vec, o: { mix?: BlockSpec } = {}) {
      b.fill(a, c, o.mix ?? [["bookshelf", 6], ["chiseled_bookshelf", 1], ["barrel[facing=up]", 1]]);
    },
  };
  return lib;
}

export type Lib = ReturnType<typeof makeLib>;
