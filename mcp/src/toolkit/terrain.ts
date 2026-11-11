// Landscape toolkit: sculpted heightmaps (islands, mountains, valleys, floating islands), building pads, rivers,
// stylised layered cliffs, water, vegetation scattering and rocks. Large maps are built as a "shell"
// (surface + a few layers + cliff faces) so they stay light.
import { Builder } from "./builder.ts";
import { BlockSpec, Vec, hash3, mulberry32, noise3 } from "./patterns.ts";

type B = Builder;

function fbm(x: number, z: number, scale: number, octaves: number, seed: number, ridged = false) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = noise3(x * freq, 0, z * freq, scale, seed + o * 101);
    if (ridged) n = 1 - Math.abs(2 * n - 1);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm; // 0..1
}

export interface TerrainPalette {
  grass?: BlockSpec;
  dirt?: BlockSpec;
  cliff?: BlockSpec; // steep faces (stylised strata look best: mixes / gradients)
  stone?: BlockSpec; // deep fill
  sand?: BlockSpec;
  seabed?: BlockSpec;
  snow?: BlockSpec;
  underside?: BlockSpec; // floating island bottoms
  path?: BlockSpec;
}

export const TERRAIN_PALETTES: Record<string, TerrainPalette> = {
  // stylised, desaturated palettes like professional server maps
  temperate: {
    grass: { mix: [["grass_block", 14], ["moss_block", 2], ["podzol", 1], ["coarse_dirt", 1]], scale: 4 },
    dirt: "dirt",
    cliff: { mix: [["andesite", 5], ["stone", 4], ["tuff", 3], ["cobblestone", 1], ["gravel", 1]], scale: 3 },
    stone: "stone",
    sand: { mix: [["sand", 6], ["gravel", 1]], scale: 3 },
    seabed: { mix: [["gravel", 3], ["sand", 3], ["clay", 1]], scale: 3 },
    snow: "snow_block",
    underside: { mix: [["stone", 4], ["andesite", 3], ["tuff", 3], ["deepslate", 2], ["cobbled_deepslate", 1]], scale: 3 },
    path: { mix: [["dirt_path", 5], ["coarse_dirt", 2], ["gravel", 1], ["packed_mud", 1]], scale: 2 },
  },
  stylized_rock: {
    grass: { mix: [["grass_block", 12], ["moss_block", 3], ["green_concrete_powder", 1]], scale: 4 },
    dirt: { mix: [["dirt", 3], ["coarse_dirt", 1]], scale: 3 },
    cliff: { mix: [["cyan_terracotta", 6], ["light_gray_concrete", 2], ["andesite", 3], ["clay", 2], ["gray_concrete", 1]], scale: 4 },
    stone: "cyan_terracotta",
    sand: { mix: [["smooth_sandstone", 3], ["sand", 3]], scale: 3 },
    seabed: { mix: [["clay", 2], ["gravel", 2], ["sand", 2]], scale: 3 },
    snow: { mix: [["snow_block", 5], ["white_concrete_powder", 1]], scale: 3 },
    underside: { mix: [["cyan_terracotta", 4], ["gray_concrete", 2], ["andesite", 2], ["light_gray_terracotta", 2]], scale: 4 },
    path: { mix: [["dirt_path", 4], ["coarse_dirt", 2], ["packed_mud", 1]], scale: 2 },
  },
  volcanic: {
    grass: { mix: [["moss_block", 4], ["grass_block", 6], ["rooted_dirt", 1]], scale: 4 },
    dirt: "coarse_dirt",
    cliff: { mix: [["smooth_basalt", 6], ["tuff", 3], ["blackstone", 2], ["basalt[axis=y]", 1]], scale: 3 },
    stone: "smooth_basalt",
    sand: { mix: [["gravel", 3], ["black_concrete_powder", 1]], scale: 3 },
    seabed: "gravel",
    snow: "snow_block",
    underside: { mix: [["smooth_basalt", 4], ["blackstone", 3], ["tuff", 2]], scale: 3 },
    path: { mix: [["dirt_path", 3], ["gravel", 2], ["coarse_dirt", 1]], scale: 2 },
  },
  desert: {
    grass: { mix: [["sand", 8], ["smooth_sandstone", 1], ["red_sand", 1]], scale: 4 },
    dirt: "sandstone",
    cliff: { mix: [["sandstone", 4], ["terracotta", 2], ["orange_terracotta", 2], ["smooth_sandstone", 2], ["red_sandstone", 1]], scale: 3 },
    stone: "sandstone",
    sand: "sand",
    seabed: "sand",
    snow: "smooth_sandstone",
    underside: { mix: [["sandstone", 3], ["terracotta", 2], ["orange_terracotta", 1]], scale: 3 },
    path: { mix: [["smooth_sandstone", 2], ["sandstone", 1], ["red_sand", 1]], scale: 2 },
  },
  snowy: {
    grass: { mix: [["snow_block", 8], ["white_concrete_powder", 1], ["grass_block[snowy=true]", 2]], scale: 4 },
    dirt: "dirt",
    cliff: { mix: [["stone", 4], ["andesite", 3], ["diorite", 1], ["calcite", 2], ["packed_ice", 1]], scale: 3 },
    stone: "stone",
    sand: "gravel",
    seabed: "gravel",
    snow: "snow_block",
    underside: { mix: [["stone", 3], ["andesite", 3], ["calcite", 1]], scale: 3 },
    path: { mix: [["dirt_path", 2], ["coarse_dirt", 2], ["snow_block", 1]], scale: 2 },
  },
};

/** A sculptable heightmap over a rectangle of local x/z. Heights are local y (float until built). */
export class HeightMap {
  readonly h: Float32Array;
  /** set by build({cutoff}) / island({sea}): heights below this are "no land" (sea floor or void) */
  landMin = -Infinity;
  constructor(readonly x0: number, readonly z0: number, readonly w: number, readonly d: number, fill = 0) {
    this.h = new Float32Array(w * d).fill(fill);
  }
  /** true if (x,z) is on dry land of this heightmap (inside, above the cutoff, above water if given) */
  isLand(x: number, z: number, water?: number | null) {
    if (!this.inside(x, z)) return false;
    const h = this.raw(x, z);
    return h >= this.landMin && (water == null || Math.round(h) > water);
  }
  inside(x: number, z: number) {
    return x >= this.x0 && z >= this.z0 && x < this.x0 + this.w && z < this.z0 + this.d;
  }
  raw(x: number, z: number) {
    const cx = Math.max(0, Math.min(this.w - 1, Math.round(x) - this.x0)), cz = Math.max(0, Math.min(this.d - 1, Math.round(z) - this.z0));
    return this.h[cz * this.w + cx];
  }
  /** Integer surface height (the top solid block's y). */
  at(x: number, z: number) {
    return Math.round(this.raw(x, z));
  }
  set(x: number, z: number, v: number) {
    if (this.inside(x, z)) this.h[(z - this.z0) * this.w + (x - this.x0)] = v;
  }
  each(fn: (x: number, z: number, h: number) => number | void) {
    for (let z = 0; z < this.d; z++)
      for (let x = 0; x < this.w; x++) {
        const r = fn(x + this.x0, z + this.z0, this.h[z * this.w + x]);
        if (typeof r === "number") this.h[z * this.w + x] = r;
      }
    return this;
  }
  /** Add layered noise: amp blocks of relief, scale = feature size in blocks. ridged → mountain ridges. */
  noise(o: { amp?: number; scale?: number; octaves?: number; seed?: number; ridged?: boolean; offset?: number } = {}) {
    const amp = o.amp ?? 8, scale = o.scale ?? 32, oct = o.octaves ?? 4, seed = o.seed ?? 1, off = o.offset ?? -0.5;
    return this.each((x, z, h) => h + (fbm(x, z, scale, oct, seed, o.ridged) + off) * amp * 2);
  }
  /**
   * Island / landmass mask: keeps height inside an organic outline and drops it below `sea` outside.
   * radius: [rx, rz] of the landmass, centre defaults to the map centre. coast = noise wobble of the outline (0..1).
   */
  island(o: { center?: [number, number]; radius?: [number, number] | number; coast?: number; sea?: number; falloff?: number; seed?: number } = {}) {
    const c = o.center ?? [this.x0 + this.w / 2, this.z0 + this.d / 2];
    const r = typeof o.radius === "number" ? [o.radius, o.radius] : o.radius ?? [this.w * 0.4, this.d * 0.4];
    const sea = o.sea ?? -4, fall = o.falloff ?? 0.25, coast = o.coast ?? 0.35, seed = o.seed ?? 7;
    return this.each((x, z, h) => {
      const dx = (x - c[0]) / r[0], dz = (z - c[1]) / r[1];
      let dist = Math.hypot(dx, dz);
      dist += (fbm(x, z, 24, 3, seed) - 0.5) * coast * 2;
      const t = Math.max(0, Math.min(1, (dist - (1 - fall)) / fall)); // 0 inside, 1 outside
      const s = t * t * (3 - 2 * t);
      return h * (1 - s) + sea * s;
    });
  }
  /** Flatten a rectangle to `level` with a smooth blend ring (building pads, plazas). */
  flatten(a: [number, number], c: [number, number], level: number, blend = 4) {
    const [x0, x1] = [Math.min(a[0], c[0]), Math.max(a[0], c[0])], [z0, z1] = [Math.min(a[1], c[1]), Math.max(a[1], c[1])];
    return this.each((x, z, h) => {
      const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
      const d = Math.hypot(dx, dz);
      if (d === 0) return level;
      if (d >= blend) return;
      const t = d / blend, s = t * t * (3 - 2 * t);
      return level * (1 - s) + h * s;
    });
  }
  flattenCircle(center: [number, number], r: number, level: number, blend = 4) {
    return this.each((x, z, h) => {
      const d = Math.hypot(x - center[0], z - center[1]) - r;
      if (d <= 0) return level;
      if (d >= blend) return;
      const t = d / blend, s = t * t * (3 - 2 * t);
      return level * (1 - s) + h * s;
    });
  }
  /** Raise a smooth hill / mountain (negative height = crater/lake basin). */
  hill(center: [number, number], radius: number, height: number, o: { sharp?: number } = {}) {
    const p = o.sharp ?? 1.5;
    return this.each((x, z, h) => {
      const d = Math.hypot(x - center[0], z - center[1]) / radius;
      if (d >= 1) return;
      return h + height * Math.pow(1 - d * d, p);
    });
  }
  /** Carve a channel (river, canyon, road cut) along a polyline: width, depth below the surrounding terrain or to `level`. */
  carve(points: [number, number][], o: { width?: number; depth?: number; level?: number; blend?: number } = {}) {
    const w = o.width ?? 4, blend = o.blend ?? 3;
    return this.each((x, z, h) => {
      let best = Infinity;
      for (let i = 0; i < points.length - 1; i++) best = Math.min(best, segDist(x, z, points[i], points[i + 1]));
      const inner = w / 2;
      if (best >= inner + blend) return;
      const target = o.level !== undefined ? o.level : h - (o.depth ?? 3);
      if (best <= inner) return Math.min(h, target);
      const t = (best - inner) / blend, s = t * t * (3 - 2 * t);
      return Math.min(h, target * (1 - s) + h * s);
    });
  }
  /** Terraces / stepped plateaus (stylised cliffs). */
  terrace(step = 4, sharpness = 0.7) {
    return this.each((x, z, h) => {
      const k = Math.floor(h / step) * step;
      const f = (h - k) / step;
      return k + step * Math.pow(f, 1 + sharpness * 4);
    });
  }
  smooth(r = 1, passes = 1) {
    for (let p = 0; p < passes; p++) {
      const src = Float32Array.from(this.h);
      for (let z = 0; z < this.d; z++)
        for (let x = 0; x < this.w; x++) {
          let s = 0, n = 0;
          for (let dz = -r; dz <= r; dz++)
            for (let dx = -r; dx <= r; dx++) {
              const xx = x + dx, zz = z + dz;
              if (xx < 0 || zz < 0 || xx >= this.w || zz >= this.d) continue;
              s += src[zz * this.w + xx];
              n++;
            }
          this.h[z * this.w + x] = s / n;
        }
    }
    return this;
  }
  /** Max height difference to the 4 neighbours (cliff detection). */
  slope(x: number, z: number) {
    const h = this.at(x, z);
    return Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => Math.abs(h - this.at(x + dx, z + dz))));
  }
  /**
   * Place the terrain. Shell mode keeps only what can be seen (surface, `depth` soil layers, cliff faces down to the
   * neighbours) — use bottom:"solid" to fill all the way down to `bottom`, or floating:true for a floating island with a
   * tapered rocky underside.
   */
  build(b: B, o: {
    palette?: string | TerrainPalette;
    water?: number | null; // water surface level (local y) or null
    waterBlock?: BlockSpec;
    depth?: number;
    bottom?: number;
    solid?: boolean;
    floating?: boolean;
    undersideDepth?: number; // floating: how far the rock hangs below (blocks at the centre)
    cliffSlope?: number; // height difference that counts as a cliff
    snowLine?: number | null;
    beach?: number; // blocks above water that become sand
    clearAbove?: number; // write air this many blocks above the surface (removes old terrain when sculpting real worlds)
    mask?: (x: number, z: number) => boolean; // only build where true
    cutoff?: number; // columns whose height is below this are left empty (void/sky maps, floating islands)
  } = {}) {
    if (o.cutoff !== undefined) this.landMin = o.cutoff;
    if (o.water != null) this.landMin = Math.max(this.landMin, o.water + 1);
    const pal = typeof o.palette === "object" ? o.palette : TERRAIN_PALETTES[o.palette ?? "temperate"] ?? TERRAIN_PALETTES.temperate;
    const P = { ...TERRAIN_PALETTES.temperate, ...pal };
    const water = o.water ?? null;
    const depth = o.depth ?? 3;
    const cliffSlope = o.cliffSlope ?? 2;
    const bottom = o.bottom ?? -64;
    const beach = o.beach ?? 1;
    const seaFloorMin = Math.min(...Array.from(this.h)) - 1;
    for (let z = this.z0; z < this.z0 + this.d; z++)
      for (let x = this.x0; x < this.x0 + this.w; x++) {
        if (o.mask && !o.mask(x, z)) continue;
        const top = this.at(x, z);
        if (o.cutoff !== undefined) {
          if (this.raw(x, z) < o.cutoff) {
            // a basin dug below the cutoff inside the island (lake) would punch a hole into the void: keep it as land
            if (this.surroundedByLand(x, z, o.cutoff)) this.set(x, z, o.cutoff);
            else continue; // "no land here" (void maps / floating islands)
          }
          // drop stray specks: need at least 4 of the 8 neighbours to be land
          let nb = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && this.inside(x + dx, z + dz) && this.raw(x + dx, z + dz) >= o.cutoff) nb++;
          if (nb < 4) continue;
        }
        const s = this.slope(x, z);
        const minN = Math.min(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => (o.cutoff !== undefined && this.raw(x + dx, z + dz) < o.cutoff ? top - depth : this.at(x + dx, z + dz))));
        const under = water !== null && top < water && !(o.floating && o.cutoff !== undefined && this.edgeDistance(x, z, o.cutoff) <= 4);
        let surface: BlockSpec;
        if (under) surface = P.seabed!;
        else if (s >= cliffSlope) surface = P.cliff!;
        else if (water !== null && top <= water + beach) surface = P.sand!;
        else if (o.snowLine != null && top >= o.snowLine) surface = P.snow!;
        else surface = P.grass!;
        b.set([x, top, z], surface);
        let lowest: number;
        if (o.solid) lowest = bottom;
        else if (o.floating) {
          // tapered underside: deeper toward the middle, noisy
          const edge = this.edgeDistance(x, z, o.cutoff ?? -1e9);
          const ud = (o.undersideDepth ?? 18) * Math.min(1, Math.pow(edge / 14, 0.8)) * (0.7 + 0.6 * fbm(x, z, 9, 3, 77));
          lowest = Math.round(top - depth - ud);
        } else lowest = Math.min(top - depth, minN - 1);
        if (!o.solid && !o.floating && water !== null) lowest = Math.min(lowest, Math.max(seaFloorMin, top - depth));
        for (let y = top - 1; y >= lowest; y--) {
          const steepHere = s >= cliffSlope || y < minN;
          const blk = o.floating && y < top - depth ? P.underside! : steepHere ? P.cliff! : y >= top - depth ? (under ? P.seabed! : P.dirt!) : P.stone!;
          b.set([x, y, z], blk);
        }
        if (under && water !== null) for (let y = top + 1; y <= water; y++) b.set([x, y, z], o.waterBlock ?? "water");
        if (o.clearAbove) for (let y = Math.max(top, water ?? top) + 1; y <= Math.max(top, water ?? top) + o.clearAbove; y++) b.set([x, y, z], "air", { mask: "empty" });
      }
    return this;
  }
  /** true if land (>= cut) exists in all 4 directions within 25 blocks, i.e. this column is enclosed by the landmass */
  surroundedByLand(x: number, z: number, cut: number) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => {
      for (let i = 1; i <= 25; i++) if (this.inside(x + dx * i, z + dz * i) && this.raw(x + dx * i, z + dz * i) >= cut) return true;
      return false;
    });
  }
  private edgeCache?: Map<string, number>;
  /** Distance (blocks) to the nearest column below `cut` (= outside the landmass), approximated by a ring search. */
  edgeDistance(x: number, z: number, cut: number) {
    this.edgeCache ??= new Map();
    const k = `${x},${z}`;
    const c = this.edgeCache.get(k);
    if (c !== undefined) return c;
    let d = 30;
    outer: for (let r = 1; r <= 30; r++) {
      for (let i = -r; i <= r; i++)
        for (const [xx, zz] of [[x + i, z - r], [x + i, z + r], [x - r, z + i], [x + r, z + i]]) {
          if (!this.inside(xx, zz) || this.raw(xx, zz) < cut) {
            d = r;
            break outer;
          }
        }
    }
    this.edgeCache.set(k, d);
    return d;
  }
}

function segDist(px: number, pz: number, a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const L = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / L));
  return Math.hypot(px - (a[0] + t * vx), pz - (a[1] + t * vz));
}

/** Poisson-disk-ish scatter of points in a rectangle (deterministic). Returns [x, z] points. */
export function scatterPoints(a: [number, number], c: [number, number], o: { minDist?: number; count?: number; seed?: number; accept?: (x: number, z: number) => boolean } = {}): [number, number][] {
  const [x0, x1] = [Math.min(a[0], c[0]), Math.max(a[0], c[0])], [z0, z1] = [Math.min(a[1], c[1]), Math.max(a[1], c[1])];
  const md = o.minDist ?? 4;
  const rng = mulberry32(o.seed ?? 11);
  const target = o.count ?? Math.floor(((x1 - x0 + 1) * (z1 - z0 + 1)) / (md * md * 2.2));
  const pts: [number, number][] = [];
  const cell = md / Math.SQRT2;
  const grid = new Map<string, [number, number]>();
  const gk = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  let tries = 0;
  while (pts.length < target && tries < target * 30) {
    tries++;
    const x = Math.round(x0 + rng() * (x1 - x0)), z = Math.round(z0 + rng() * (z1 - z0));
    if (o.accept && !o.accept(x, z)) continue;
    let ok = true;
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    for (let i = -2; i <= 2 && ok; i++)
      for (let j = -2; j <= 2 && ok; j++) {
        const q = grid.get(`${gx + i},${gz + j}`);
        if (q && Math.hypot(q[0] - x, q[1] - z) < md) ok = false;
      }
    if (!ok) continue;
    pts.push([x, z]);
    grid.set(gk(x, z), [x, z]);
  }
  return pts;
}

/** Irregular boulder. */
export function rock(b: B, p: Vec, o: { r?: number; palette?: BlockSpec; seed?: number; flat?: number } = {}) {
  const r = o.r ?? 2;
  const pal = o.palette ?? { mix: [["andesite", 4], ["stone", 3], ["tuff", 2], ["cobblestone", 1], ["mossy_cobblestone", 1]], scale: 2 };
  const seed = o.seed ?? Math.floor(hash3(p[0], p[1], p[2], 3) * 1e6);
  const R = Math.ceil(r + 1);
  for (let y = -1; y <= R; y++)
    for (let z = -R; z <= R; z++)
      for (let x = -R; x <= R; x++) {
        const n = noise3(p[0] + x, p[1] + y, p[2] + z, 2.2, seed) * 0.9;
        const d = Math.hypot(x, y * (o.flat ?? 1.4), z) / (r + 0.5);
        if (d + n * 0.6 < 1) b.set([p[0] + x, p[1] + y, p[2] + z], pal);
      }
}

/**
 * Scatter vegetation & props on a heightmap. kinds: weighted list of what to place:
 * "tree:oak", "tree:spruce", "tree:birch", "tree:dark_oak", "tree:cherry", "bush", "rock", "flowers", "grass", or a function (b, p, rng).
 * Respects slope (no trees on cliffs), water and an avoid(x,z) callback (paths, plazas, buildings).
 */
export function scatter(b: B, lib: any, hm: HeightMap, a: [number, number], c: [number, number], o: {
  kinds: [string | ((b: B, p: Vec, rng: any) => void), number][];
  minDist?: number;
  count?: number;
  seed?: number;
  avoid?: (x: number, z: number) => boolean;
  water?: number | null;
  maxSlope?: number;
}) {
  const rng = mulberry32(o.seed ?? 21);
  const maxSlope = o.maxSlope ?? 1;
  const pts = scatterPoints(a, c, {
    minDist: o.minDist ?? 5, count: o.count, seed: o.seed,
    accept: (x, z) => hm.isLand(x, z) && [[2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dz]) => hm.isLand(x + dx, z + dz)) && hm.slope(x, z) <= maxSlope && !(o.avoid && o.avoid(x, z)) && (o.water == null || hm.at(x, z) > o.water + 1),
  });
  const total = o.kinds.reduce((s, [, w]) => s + w, 0);
  const placed: Record<string, number> = {};
  for (const [x, z] of pts) {
    let r = rng() * total, kind = o.kinds[0][0];
    for (const [k, w] of o.kinds) {
      r -= w;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    const p: Vec = [x, hm.at(x, z) + 1, z];
    const name = typeof kind === "string" ? kind : "custom";
    placed[name] = (placed[name] ?? 0) + 1;
    if (typeof kind === "function") kind(b, p, rng);
    else if (kind.startsWith("tree:")) lib.tree(b, p, { type: kind.slice(5), seed: Math.floor(rng() * 1e6) });
    else if (kind === "bush") lib.bush(b, p, { r: 1 + rng() * 0.8, leaves: rng() < 0.5 ? "oak_leaves[persistent=true]" : "azalea_leaves[persistent=true]" });
    else if (kind === "rock") rock(b, [x, hm.at(x, z), z], { r: 1 + rng() * 1.5, seed: Math.floor(rng() * 1e6) });
    else if (kind === "flowers") {
      const fl = rng.pick(["poppy", "dandelion", "cornflower", "oxeye_daisy", "azure_bluet", "allium", "lily_of_the_valley", "pink_tulip"]);
      for (let i = 0; i < 6; i++) {
        const fx = x + Math.round((rng() - 0.5) * 4), fz = z + Math.round((rng() - 0.5) * 4);
        if (hm.isLand(fx, fz) && hm.slope(fx, fz) <= 1 && !(o.avoid && o.avoid(fx, fz))) b.set([fx, hm.at(fx, fz) + 1, fz], i % 3 === 0 ? "short_grass" : fl, { mask: "empty" });
      }
    } else if (kind === "grass") {
      for (let i = 0; i < 8; i++) {
        const fx = x + Math.round((rng() - 0.5) * 5), fz = z + Math.round((rng() - 0.5) * 5);
        if (hm.isLand(fx, fz) && hm.slope(fx, fz) <= 1 && !(o.avoid && o.avoid(fx, fz))) b.set([fx, hm.at(fx, fz) + 1, fz], rng() < 0.2 ? "tall_grass" : rng() < 0.3 ? "fern" : "short_grass", { mask: "empty" });
      }
    } else throw new Error(`scatter: unknown kind '${kind}'`);
  }
  return placed;
}
