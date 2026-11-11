// Turns voxels into textured triangle meshes using the real vanilla block models.
// Output: three buckets (opaque, cutout, translucent) of interleaved vertex data + a texture atlas.
import { PNG } from "pngjs";
import { assets, Element, Face, ModelRef } from "../blocks/assets.ts";
import { PALETTE, parseState } from "../blocks/state.ts";
import { key } from "../voxel.ts";

export interface MeshBucket {
  pos: number[];
  uv: number[];
  col: number[]; // rgb per vertex (tint * ao * shade)
  idx: number[];
}
export interface MeshOut {
  opaque: MeshBucket;
  cutout: MeshBucket;
  translucent: MeshBucket;
  atlas: Buffer; // PNG
  atlasSize: number;
}

type Getter = (x: number, y: number, z: number) => number | undefined; // palette id

const FACE_DIRS: Record<string, [number, number, number]> = {
  north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0],
};

const GRASS = [0x91 / 255, 0xbd / 255, 0x59 / 255];
const FOLIAGE = [0x77 / 255, 0xab / 255, 0x2f / 255];
const WATER = [0x3f / 255, 0x76 / 255, 0xe4 / 255];
function tintFor(name: string): number[] {
  if (name === "birch_leaves") return [0x80 / 255, 0xa7 / 255, 0x55 / 255];
  if (name === "spruce_leaves") return [0x61 / 255, 0x99 / 255, 0x61 / 255];
  if (name.includes("leaves") || name === "vine") return FOLIAGE;
  if (name === "water" || name === "bubble_column") return WATER;
  if (name === "lily_pad") return [0x20 / 255, 0x80 / 255, 0x30 / 255];
  if (name.includes("stem")) return [0.6, 0.7, 0.3];
  if (name === "redstone_wire") return [0.8, 0, 0];
  return GRASS;
}

class Atlas {
  readonly tiles = new Map<string, number>();
  readonly order: string[] = [];
  index(tex: string): number {
    let i = this.tiles.get(tex);
    if (i === undefined) {
      i = this.order.length;
      this.order.push(tex);
      this.tiles.set(tex, i);
    }
    return i;
  }
  build(): { png: Buffer; size: number; cols: number } {
    const n = Math.max(1, this.order.length);
    const cols = Math.ceil(Math.sqrt(n));
    const T = 16, PAD = 0;
    const size = nextPow2(cols * (T + PAD * 2));
    const img = new PNG({ width: size, height: size });
    img.data.fill(0);
    const db = assets();
    this.order.forEach((tex, i) => {
      const src = db.texture(tex);
      const ox = (i % cols) * T, oy = Math.floor(i / cols) * T;
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const d = ((oy + y) * size + ox + x) * 4;
          if (!src) {
            const c = (x >> 2) + (y >> 2) & 1 ? 255 : 0;
            img.data[d] = c; img.data[d + 1] = 0; img.data[d + 2] = c; img.data[d + 3] = 255;
            continue;
          }
          const sx = Math.floor((x * src.width) / T), sy = Math.floor((y * src.width) / T); // first frame for animations
          const s = (sy * src.width + sx) * 4;
          img.data[d] = src.data[s]; img.data[d + 1] = src.data[s + 1]; img.data[d + 2] = src.data[s + 2]; img.data[d + 3] = src.data[s + 3];
        }
    });
    this.cols = cols;
    this.size = size;
    return { png: PNG.sync.write(img), size, cols };
  }
  cols = 1;
  size = 16;
}
const nextPow2 = (v: number) => {
  let p = 16;
  while (p < v) p *= 2;
  return p;
};

interface Quad {
  v: [number, number, number][]; // 4 corners
  uv: [number, number][]; // 4 corners in 0..16 texel space
  tex: string;
  tint: number[] | null;
  shade: number;
  ao: boolean;
  normal: [number, number, number];
  cull?: string;
  bucket: "opaque" | "cutout" | "translucent";
}

// Special blocks without element models (entity-rendered or fluid). Approximations.
function specialModels(name: string, props: Record<string, string>): { elements: Element[]; ao: boolean } | null {
  const box = (from: number[], to: number[], tex: string | Record<string, string>, tint?: number): Element => {
    const faces: any = {};
    for (const f of ["north", "south", "east", "west", "up", "down"]) faces[f] = { texture: typeof tex === "string" ? tex : tex[f] ?? tex.side, tintindex: tint };
    return { from: from as any, to: to as any, faces };
  };
  if (name === "water" || name === "lava") {
    const lvl = parseInt(props.level ?? "0", 10);
    const h = lvl === 0 ? 14 : Math.max(2, 14 - lvl * 1.6);
    const t = name === "water" ? "block/water_still" : "block/lava_still";
    const e = box([0, 0, 0], [16, h, 16], t, name === "water" ? 0 : undefined);
    for (const [fn, f] of Object.entries(e.faces)) (f as Face).cullface = fn === "up" && h < 16 ? undefined : fn;
    return { elements: [e], ao: false };
  }
  if (name.endsWith("chest")) {
    const t = name === "ender_chest" ? "block/obsidian" : name === "trapped_chest" ? "block/oak_planks" : "block/oak_planks";
    return { elements: [box([1, 0, 1], [15, 14, 15], { side: t, up: "block/oak_log_top" })], ao: true };
  }
  if (name.endsWith("_bed")) {
    const color = name.replace("_bed", "");
    return { elements: [box([0, 3, 0], [16, 9, 16], { side: `block/${color}_wool`, down: "block/oak_planks" }), box([0, 0, 0], [3, 3, 3], "block/oak_planks"), box([13, 0, 13], [16, 3, 16], "block/oak_planks")], ao: true };
  }
  if (name.endsWith("_sign") || name.endsWith("_banner")) {
    const wood = name.replace(/_(wall_)?(hanging_)?sign$/, "").replace(/_(wall_)?banner$/, "");
    const t = name.endsWith("banner") ? `block/${wood}_wool` : `block/${wood}_planks`;
    if (name.includes("wall")) return { elements: [box([0, 4, 14], [16, 12, 16], t)], ao: false };
    return { elements: [box([0, 7, 7], [16, 16, 9], t), box([7, 0, 7], [9, 7, 9], "block/oak_log")], ao: false };
  }
  if (name.endsWith("shulker_box")) {
    const c = name === "shulker_box" ? "purple" : name.replace("_shulker_box", "");
    return { elements: [box([0, 0, 0], [16, 16, 16], `block/${c}_shulker_box`)], ao: true };
  }
  if (name.endsWith("_skull") || name.endsWith("_head")) return { elements: [box([4, 0, 4], [12, 8, 12], "block/bone_block_side")], ao: false };
  if (name === "decorated_pot") return { elements: [box([1, 0, 1], [15, 16, 15], "block/terracotta")], ao: true };
  if (name === "bell") return { elements: [box([4, 4, 4], [12, 13, 12], "block/gold_block")], ao: false };
  if (name === "conduit") return { elements: [box([5, 5, 5], [11, 11, 11], "block/prismarine")], ao: false };
  return null;
}

/**
 * Mesh a set of blocks. `cells` iterates [x,y,z,id] of blocks to draw; `get` resolves any position (for culling/AO).
 */
export function mesh(cells: Iterable<[number, number, number, number]>, get: Getter): MeshOut {
  const db = assets();
  const atlas = new Atlas();
  const out: MeshOut = {
    opaque: { pos: [], uv: [], col: [], idx: [] },
    cutout: { pos: [], uv: [], col: [], idx: [] },
    translucent: { pos: [], uv: [], col: [], idx: [] },
    atlas: Buffer.alloc(0),
    atlasSize: 16,
  };
  const fullCache = new Map<number, boolean>();
  const isFull = (id: number | undefined) => {
    if (id === undefined || id === 0) return false;
    let c = fullCache.get(id);
    if (c === undefined) {
      c = db.isFullOpaque(parseState(PALETTE.get(id)).name);
      fullCache.set(id, c);
    }
    return c;
  };
  const quadCache = new Map<number, Quad[]>();
  const quadsFor = (id: number, x: number, y: number, z: number): Quad[] => {
    const name = parseState(PALETTE.get(id)).name;
    // vary weighted models by position (e.g. grass rotations); cache only non-varying
    let q = quadCache.get(id);
    if (q) return q;
    q = buildQuads(PALETTE.get(id));
    quadCache.set(id, q);
    void name; void x; void y; void z;
    return q;
  };
  const allQuads: { q: Quad; x: number; y: number; z: number; id: number }[] = [];
  for (const [x, y, z, id] of cells) {
    if (id === 0) continue;
    const st = parseState(PALETTE.get(id));
    if (st.name === "air" || st.name === "cave_air" || st.name === "barrier" || st.name === "light" || st.name === "structure_void") continue;
    const qs = quadsFor(id, x, y, z);
    for (const q of qs) {
      if (q.cull) {
        const d = FACE_DIRS[q.cull] ?? (q.cull === "self" ? [0, 1, 0] : null);
        if (!d) { process.stderr.write(`bad cull ${q.cull} on ${PALETTE.get(id)}
`); continue; }
        const nid = get(x + d[0], y + d[1], z + d[2]);
        if (q.cull === "self") {
          // fluids: hide faces against same fluid or full blocks
          if (nid === id || isFull(nid) || (nid !== undefined && parseState(PALETTE.get(nid)).name === st.name)) continue;
        } else {
          if (isFull(nid)) continue;
          // glass-like: hide faces between identical translucent/cutout blocks
          if (nid === id && q.bucket !== "opaque" && !st.name.includes("leaves")) continue;
        }
      }
      emit(out, atlas, q, x, y, z, get, isFull);
    }
  }
  void allQuads;
  const a = atlas.build();
  // remap uvs to atlas: emit() stored tile index in uv (tile + local/16)
  for (const b of [out.opaque, out.cutout, out.translucent]) {
    for (let i = 0; i < b.uv.length; i += 2) {
      const tile = Math.floor(b.uv[i] / 2);
      const u = b.uv[i] - tile * 2, v = b.uv[i + 1];
      const tx = tile % a.cols, ty = Math.floor(tile / a.cols);
      b.uv[i] = ((tx + u) * 16) / a.size;
      b.uv[i + 1] = 1 - ((ty + v) * 16) / a.size;
    }
  }
  out.atlas = a.png;
  out.atlasSize = a.size;
  return out;

  function buildQuads(state: string): Quad[] {
    const st = parseState(state);
    const special = specialModels(st.name, st.props);
    const refs: (ModelRef & { els: Element[]; ao: boolean })[] = [];
    if (special) refs.push({ model: "", els: special.elements, ao: special.ao });
    else
      for (const r of db.modelsFor(state)) {
        const m = db.resolveModel(r.model);
        refs.push({ ...r, els: m.elements, ao: m.ambientocclusion });
      }
    const quads: Quad[] = [];
    for (const r of refs) {
      for (const el of r.els) {
        for (const [fname, face] of Object.entries(el.faces)) {
          if (!face) continue;
          const qd = faceQuad(el, fname, face);
          // element rotation
          if (el.rotation && el.rotation.angle) rotateQuad(qd.v, el.rotation);
          // model rotation x then y (blockstate)
          let cull = face.cullface === "self" ? "self" : face.cullface ? face.cullface : undefined;
          let normal = FACE_DIRS[fname].slice() as [number, number, number];
          if (r.x) {
            rotX(qd.v, r.x);
            normal = rotXv(normal, r.x);
            if (cull && cull !== "self") cull = dirRotX(cull, r.x);
          }
          if (r.y) {
            rotY(qd.v, r.y);
            normal = rotYv(normal, r.y);
            if (cull && cull !== "self") cull = dirRotY(cull, r.y);
          }
          if (r.uvlock && (r.x || r.y)) qd.uv = uvLock(qd.v, normal);
          const alpha = db.textureAlpha(face.texture);
          const bucket = alpha === "translucent" ? "translucent" : alpha === "cutout" ? "cutout" : "opaque";
          const shade = el.shade === false ? 1 : faceShade(normal);
          quads.push({
            v: qd.v, uv: qd.uv, tex: face.texture,
            tint: face.tintindex !== undefined && face.tintindex >= 0 ? tintFor(st.name) : null,
            shade, ao: r.ao, normal, cull, bucket,
          });
        }
      }
    }
    return quads;
  }
}

function faceShade(n: [number, number, number]) {
  if (n[1] > 0.5) return 1.0;
  if (n[1] < -0.5) return 0.5;
  if (Math.abs(n[2]) > 0.5) return 0.8;
  return 0.6;
}

function faceQuad(el: Element, f: string, face: Face): { v: [number, number, number][]; uv: [number, number][] } {
  const [x0, y0, z0] = el.from.map((v) => v / 16);
  const [x1, y1, z1] = el.to.map((v) => v / 16);
  let v: [number, number, number][];
  // corners ordered: top-left, bottom-left, bottom-right, top-right (as seen looking at the face)
  switch (f) {
    case "north": v = [[x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0]]; break;
    case "south": v = [[x0, y1, z1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1]]; break;
    case "west": v = [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]]; break;
    case "east": v = [[x1, y1, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0]]; break;
    case "up": v = [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]; break;
    default: v = [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]]; break;
  }
  let uv4: [number, number, number, number];
  if (face.uv) uv4 = face.uv;
  else {
    // default uv from element position
    const F = el.from, T = el.to;
    switch (f) {
      case "north": uv4 = [16 - T[0], 16 - T[1], 16 - F[0], 16 - F[1]]; break;
      case "south": uv4 = [F[0], 16 - T[1], T[0], 16 - F[1]]; break;
      case "west": uv4 = [F[2], 16 - T[1], T[2], 16 - F[1]]; break;
      case "east": uv4 = [16 - T[2], 16 - T[1], 16 - F[2], 16 - F[1]]; break;
      case "up": uv4 = [F[0], F[2], T[0], T[2]]; break;
      default: uv4 = [F[0], 16 - T[2], T[0], 16 - F[2]]; break;
    }
  }
  const [u0, v0, u1, v1] = uv4;
  let uv: [number, number][] = [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
  const rot = ((face.rotation ?? 0) / 90) % 4;
  for (let i = 0; i < rot; i++) uv = [uv[1], uv[2], uv[3], uv[0]];
  return { v, uv };
}

function rotateQuad(v: [number, number, number][], r: NonNullable<Element["rotation"]>) {
  const a = (r.angle * Math.PI) / 180;
  const o = r.origin.map((x) => x / 16);
  const c = Math.cos(a), s = Math.sin(a);
  for (const p of v) {
    const x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2];
    if (r.axis === "y") { p[0] = x * c + z * s + o[0]; p[2] = -x * s + z * c + o[2]; }
    else if (r.axis === "x") { p[1] = y * c - z * s + o[1]; p[2] = y * s + z * c + o[2]; }
    else { p[0] = x * c - y * s + o[0]; p[1] = x * s + y * c + o[1]; }
    if (r.rescale) {
      const k = 1 / Math.cos(Math.PI / 4);
      if (r.axis !== "x") p[0] = (p[0] - o[0]) * (Math.abs(r.angle) === 45 ? k : 1) + o[0];
      if (r.axis !== "z") p[2] = (p[2] - o[2]) * (Math.abs(r.angle) === 45 ? k : 1) + o[2];
    }
  }
}

// Blockstate rotations: x rotates around X axis, y around Y axis, both clockwise-looking-down-the-axis (MC convention).
function rotY(v: [number, number, number][], deg: number) {
  const n = ((deg / 90) % 4 + 4) % 4;
  for (const p of v) for (let i = 0; i < n; i++) { const x = p[0], z = p[2]; p[0] = 1 - z; p[2] = x; }
}
function rotX(v: [number, number, number][], deg: number) {
  const n = ((deg / 90) % 4 + 4) % 4;
  for (const p of v) for (let i = 0; i < n; i++) { const y = p[1], z = p[2]; p[1] = z; p[2] = 1 - y; }
}
function rotYv(n: [number, number, number], deg: number): [number, number, number] {
  let [x, y, z] = n;
  const k = ((deg / 90) % 4 + 4) % 4;
  for (let i = 0; i < k; i++) { const nx = -z; z = x; x = nx; }
  return [x, y, z];
}
function rotXv(n: [number, number, number], deg: number): [number, number, number] {
  let [x, y, z] = n;
  const k = ((deg / 90) % 4 + 4) % 4;
  for (let i = 0; i < k; i++) { const ny = z; z = -y; y = ny; }
  return [x, y, z];
}
const dirOf = (v: [number, number, number]) => Object.entries(FACE_DIRS).find(([, d]) => d[0] === Math.round(v[0]) && d[1] === Math.round(v[1]) && d[2] === Math.round(v[2]))![0];
const dirRotY = (d: string, deg: number) => dirOf(rotYv(FACE_DIRS[d], deg));
const dirRotX = (d: string, deg: number) => dirOf(rotXv(FACE_DIRS[d], deg));

/** uvlock: derive uvs from world-space position of the face (keeps textures aligned to the grid). */
function uvLock(v: [number, number, number][], n: [number, number, number]): [number, number][] {
  return v.map((p) => {
    if (Math.abs(n[1]) > 0.5) return [p[0] * 16, (n[1] > 0 ? p[2] : 1 - p[2]) * 16] as [number, number];
    if (Math.abs(n[2]) > 0.5) return [(n[2] > 0 ? p[0] : 1 - p[0]) * 16, (1 - p[1]) * 16] as [number, number];
    return [(n[0] > 0 ? 1 - p[2] : p[2]) * 16, (1 - p[1]) * 16] as [number, number];
  });
}

function emit(out: MeshOut, atlas: Atlas, q: Quad, x: number, y: number, z: number, get: Getter, isFull: (id: number | undefined) => boolean) {
  const b = out[q.bucket];
  const tile = atlas.index(q.tex);
  const base = b.pos.length / 3;
  const tint = q.tint ?? [1, 1, 1];
  // ambient occlusion for faces on the block boundary
  const n = q.normal;
  for (let i = 0; i < 4; i++) {
    const p = q.v[i];
    b.pos.push(x + p[0], y + p[1], z + p[2]);
    b.uv.push(tile * 2 + clamp01(q.uv[i][0] / 16), clamp01(q.uv[i][1] / 16));
    let ao = 1;
    if (q.ao) {
      // sample the 3 neighbours around this vertex in the plane in front of the face
      const fx = x + Math.floor(p[0] + n[0] * 0.5 + 0.0001 * n[0]);
      const fy = y + Math.floor(p[1] + n[1] * 0.5 + 0.0001 * n[1]);
      const fz = z + Math.floor(p[2] + n[2] * 0.5 + 0.0001 * n[2]);
      const ax = axes(n);
      const s1 = sideSign(p, ax[0]), s2 = sideSign(p, ax[1]);
      const o1 = offset(ax[0], s1), o2 = offset(ax[1], s2);
      const front = [x + n[0], y + n[1], z + n[2]];
      void fx; void fy; void fz;
      const occ = (d: number[]) => (isFull(get(front[0] + d[0], front[1] + d[1], front[2] + d[2])) ? 1 : 0);
      const a1 = occ(o1), a2 = occ(o2), a3 = occ([o1[0] + o2[0], o1[1] + o2[1], o1[2] + o2[2]]);
      const level = a1 && a2 ? 3 : a1 + a2 + a3;
      ao = [1, 0.8, 0.65, 0.5][level];
    }
    const k = q.shade * ao;
    b.col.push(tint[0] * k, tint[1] * k, tint[2] * k);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
const clamp01 = (v: number) => Math.max(0, Math.min(0.9999, v));
function axes(n: number[]): [number, number] {
  if (Math.abs(n[0]) > 0.5) return [1, 2];
  if (Math.abs(n[1]) > 0.5) return [0, 2];
  return [0, 1];
}
function sideSign(p: number[], axis: number) {
  return p[axis] > 0.5 ? 1 : -1;
}
function offset(axis: number, s: number) {
  const o = [0, 0, 0];
  o[axis] = s;
  return o;
}
export { key };
