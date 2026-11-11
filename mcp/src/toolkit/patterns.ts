// Material specs: a block string, a palette reference ("$wall"), a weighted mix, a gradient, or a function.
// Everything is deterministic: randomness is a hash of the absolute (root-frame) position + seed.

export type Vec = [number, number, number];
export type BlockSpec =
  | string
  | [string, number][] // weighted mix
  | { mix: [BlockSpec, number][]; seed?: number; scale?: number }
  | { gradient: BlockSpec[]; axis?: "x" | "y" | "z"; from?: number; to?: number; noise?: number }
  | { checker: [BlockSpec, BlockSpec]; size?: number }
  | ((p: { x: number; y: number; z: number; lx: number; ly: number; lz: number }) => BlockSpec);

export function hash3(x: number, y: number, z: number, seed: number): number {
  // 32-bit integer mixing per axis (Math.imul keeps every term exact for any seed)
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ (z | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1], for clustered (non-salt-and-pepper) variation. */
export function noise3(x: number, y: number, z: number, scale: number, seed: number): number {
  const fx = x / scale, fy = y / scale, fz = z / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
  const tx = fx - x0, ty = fy - y0, tz = fz - z0;
  const s = (t: number) => t * t * (3 - 2 * t);
  const L = (a: number, b: number, t: number) => a + (b - a) * s(t);
  const h = (i: number, j: number, k: number) => hash3(x0 + i, y0 + j, z0 + k, seed);
  return L(
    L(L(h(0, 0, 0), h(1, 0, 0), tx), L(h(0, 1, 0), h(1, 1, 0), tx), ty),
    L(L(h(0, 0, 1), h(1, 0, 1), tx), L(h(0, 1, 1), h(1, 1, 1), tx), ty),
    tz,
  );
}

export interface ResolveCtx {
  palette: Record<string, BlockSpec>;
  seed: number;
}

export interface Pos {
  x: number;
  y: number;
  z: number;
  lx: number;
  ly: number;
  lz: number;
}

export function resolveSpec(spec: BlockSpec, p: Pos, ctx: ResolveCtx, depth = 0): string {
  if (depth > 16) throw new Error("palette reference loop");
  if (typeof spec === "string") {
    if (spec.startsWith("$")) {
      // "$wall" or "$wall[facing=north]" -> palette entry, props merged if it resolves to a plain block
      const m = /^\$([\w.-]+)(\[.*\])?$/.exec(spec);
      if (!m) throw new Error(`bad palette ref '${spec}'`);
      const entry = ctx.palette[m[1]];
      if (entry === undefined) throw new Error(`palette has no entry '${m[1]}' (have: ${Object.keys(ctx.palette).join(", ")})`);
      const r = resolveSpec(entry, p, ctx, depth + 1);
      if (m[2]) return r.includes("[") ? r.replace("]", "," + m[2].slice(1)) : r + m[2];
      return r;
    }
    return spec;
  }
  if (typeof spec === "function") return resolveSpec(spec(p), p, ctx, depth + 1);
  if (Array.isArray(spec)) return pickWeighted(spec as [BlockSpec, number][], hash3(p.x, p.y, p.z, ctx.seed), p, ctx, depth);
  if ("mix" in spec) {
    const r = spec.scale && spec.scale > 1 ? noise3(p.x, p.y, p.z, spec.scale, ctx.seed + (spec.seed ?? 0)) : hash3(p.x, p.y, p.z, ctx.seed + (spec.seed ?? 0));
    return pickWeighted(spec.mix, r, p, ctx, depth);
  }
  if ("gradient" in spec) {
    const axis = spec.axis ?? "y";
    const v = axis === "x" ? p.lx : axis === "y" ? p.ly : p.lz;
    const from = spec.from ?? 0, to = spec.to ?? from + spec.gradient.length - 1;
    let t = to === from ? 0 : (v - from) / (to - from);
    t += ((hash3(p.x, p.y, p.z, ctx.seed + 7) - 0.5) * (spec.noise ?? 0.35));
    const i = Math.max(0, Math.min(spec.gradient.length - 1, Math.floor(t * spec.gradient.length)));
    return resolveSpec(spec.gradient[i], p, ctx, depth + 1);
  }
  if ("checker" in spec) {
    const s = spec.size ?? 1;
    const c = (Math.floor(p.lx / s) + Math.floor(p.ly / s) + Math.floor(p.lz / s)) & 1;
    return resolveSpec(spec.checker[c], p, ctx, depth + 1);
  }
  throw new Error(`unrecognised block spec ${JSON.stringify(spec)}`);
}

function pickWeighted(list: [BlockSpec, number][], r: number, p: Pos, ctx: ResolveCtx, depth: number): string {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let acc = 0;
  for (const [b, w] of list) {
    acc += w / total;
    if (r < acc) return resolveSpec(b, p, ctx, depth + 1);
  }
  return resolveSpec(list[list.length - 1][0], p, ctx, depth + 1);
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(f, {
    int: (lo: number, hi: number) => lo + Math.floor(f() * (hi - lo + 1)),
    pick: <T,>(arr: T[]) => arr[Math.floor(f() * arr.length)],
    chance: (p: number) => f() < p,
  });
}

export function strSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
