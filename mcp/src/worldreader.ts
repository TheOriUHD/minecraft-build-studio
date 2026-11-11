// Reads blocks straight from a Minecraft save (Anvil .mca region files), without a server.
// Used to study reference builds: render, slice and analyse any downloaded world.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import nbt from "prismarine-nbt";
import { VoxelGrid } from "./voxel.ts";
import { canonical, formatState } from "./blocks/state.ts";

export interface DimensionInfo {
  id: string; // relative path used to address it
  dir: string; // folder containing region/
  regions: string[];
  bytes: number;
}

/** Find every dimension folder (one with a region/ subfolder) inside a save. */
export function listDimensions(save: string): DimensionInfo[] {
  const out: DimensionInfo[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 6) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const p = path.join(d, e.name);
      if (e.name === "region") {
        const regions = fs.readdirSync(p).filter((f) => f.endsWith(".mca"));
        const bytes = regions.reduce((s, f) => s + fs.statSync(path.join(p, f)).size, 0);
        if (regions.length) out.push({ id: path.relative(save, d).replace(/\\/g, "/") || ".", dir: d, regions, bytes });
      } else if (e.name !== "entities" && e.name !== "poi") walk(p, depth + 1);
    }
  };
  walk(save, 0);
  return out.sort((a, b) => b.bytes - a.bytes);
}

interface Section {
  y: number;
  palette: string[];
  data: bigint[] | null;
}

function readChunk(buf: Buffer, idx: number): any | null {
  const loc = buf.readUInt32BE(idx * 4);
  const off = (loc >>> 8) * 4096;
  if (!off || off >= buf.length) return null;
  const len = buf.readUInt32BE(off);
  const type = buf[off + 4];
  const data = buf.subarray(off + 5, off + 4 + len);
  let raw: Buffer;
  try {
    raw = type === 2 ? zlib.inflateSync(data) : type === 1 ? zlib.gunzipSync(data) : type === 3 ? data : zlib.inflateSync(data);
  } catch {
    return null;
  }
  return nbt.parseUncompressed(raw, "big");
}

function sectionsOf(chunk: any): { x: number; z: number; sections: Section[] } | null {
  const v = chunk.value;
  const lvl = v.Level?.value ?? v;
  const x = lvl.xPos?.value, z = lvl.zPos?.value;
  const secs = (lvl.sections ?? lvl.Sections)?.value?.value ?? [];
  const sections: Section[] = [];
  for (const s of secs) {
    const bs = s.block_states?.value;
    if (!bs) continue;
    const pal = bs.palette?.value?.value ?? [];
    const palette = pal.map((p: any) => {
      const name = String(p.Name.value).replace(/^minecraft:/, "");
      const props: Record<string, string> = {};
      if (p.Properties) for (const [k, vv] of Object.entries<any>(p.Properties.value)) props[k] = String(vv.value);
      return formatState({ name, props });
    });
    const data = bs.data ? (bs.data.value as [number, number][]).map(([hi, lo]) => (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0)) : null;
    sections.push({ y: s.Y.value, palette, data });
  }
  return { x, z, sections };
}

/**
 * Load blocks of a dimension within an optional box (world coords). Air is skipped.
 * Returns the grid in world coordinates.
 */
export function loadBlocks(dim: DimensionInfo, box?: { min: number[]; max: number[] }, limit = 6_000_000): VoxelGrid {
  const g = new VoxelGrid();
  const idCache = new Map<string, number>();
  const { PALETTE } = (globalThis as any).__pal ?? { PALETTE: null };
  void PALETTE;
  for (const rf of dim.regions) {
    const m = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(rf);
    if (!m) continue;
    const rx = +m[1], rz = +m[2];
    if (box && (rx * 512 > box.max[0] || rx * 512 + 511 < box.min[0] || rz * 512 > box.max[2] || rz * 512 + 511 < box.min[2])) continue;
    const buf = fs.readFileSync(path.join(dim.dir, "region", rf));
    if (buf.length < 8192) continue;
    for (let i = 0; i < 1024; i++) {
      const cx0 = rx * 32 + (i % 32), cz0 = rz * 32 + Math.floor(i / 32);
      if (box && (cx0 * 16 > box.max[0] || cx0 * 16 + 15 < box.min[0] || cz0 * 16 > box.max[2] || cz0 * 16 + 15 < box.min[2])) continue;
      const ch = readChunk(buf, i);
      if (!ch) continue;
      const c = sectionsOf(ch);
      if (!c) continue;
      for (const s of c.sections) {
        if (box && (s.y * 16 > box.max[1] || s.y * 16 + 15 < box.min[1])) continue;
        const pal = s.palette;
        if (!pal.length || (pal.length === 1 && /^(air|cave_air|void_air)$/.test(pal[0]))) continue;
        const ids = pal.map((p) => {
          let id = idCache.get(p);
          if (id === undefined) {
            id = /^(air|cave_air|void_air)$/.test(p) ? -1 : g.cells.size >= 0 ? palId(p) : 0;
            idCache.set(p, id);
          }
          return id;
        });
        const bits = Math.max(4, Math.ceil(Math.log2(pal.length)));
        const per = Math.floor(64 / bits);
        const mask = (1n << BigInt(bits)) - 1n;
        for (let j = 0; j < 4096; j++) {
          let pi = 0;
          if (s.data && pal.length > 1) {
            const word = s.data[Math.floor(j / per)];
            pi = Number((word >> BigInt((j % per) * bits)) & mask);
          }
          const id = ids[pi];
          if (id === undefined || id < 0) continue;
          const x = c.x * 16 + (j & 15), z = c.z * 16 + ((j >> 4) & 15), y = s.y * 16 + (j >> 8);
          if (box && (x < box.min[0] || x > box.max[0] || y < box.min[1] || y > box.max[1] || z < box.min[2] || z > box.max[2])) continue;
          g.setId(x, y, z, id);
        }
        if (g.size > limit) throw new Error(`more than ${limit} blocks — pass a smaller box`);
      }
    }
  }
  return g;
}

import { PALETTE as GLOBAL_PALETTE } from "./blocks/state.ts";
function palId(s: string) {
  return GLOBAL_PALETTE.id(canonical(s));
}

/** Coarse occupancy map: count of non-air blocks per 16x16 column (chunk) — finds where the builds are. */
export function chunkDensity(dim: DimensionInfo): { cx: number; cz: number; n: number; top: number }[] {
  const out: { cx: number; cz: number; n: number; top: number }[] = [];
  for (const rf of dim.regions) {
    const m = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(rf);
    if (!m) continue;
    const buf = fs.readFileSync(path.join(dim.dir, "region", rf));
    if (buf.length < 8192) continue;
    for (let i = 0; i < 1024; i++) {
      const ch = readChunk(buf, i);
      if (!ch) continue;
      const c = sectionsOf(ch);
      if (!c) continue;
      let n = 0, top = -999;
      for (const s of c.sections) {
        if (!s.palette.length || (s.palette.length === 1 && /^(air|cave_air|void_air)$/.test(s.palette[0]))) continue;
        const airIdx = s.palette.findIndex((p) => /^(air|cave_air|void_air)$/.test(p));
        if (!s.data) {
          n += 4096;
          top = Math.max(top, s.y * 16 + 15);
          continue;
        }
        const bits = Math.max(4, Math.ceil(Math.log2(s.palette.length)));
        const per = Math.floor(64 / bits);
        const mask = (1n << BigInt(bits)) - 1n;
        for (let j = 0; j < 4096; j++) {
          const pi = Number((s.data[Math.floor(j / per)] >> BigInt((j % per) * bits)) & mask);
          if (pi !== airIdx) {
            n++;
            top = Math.max(top, s.y * 16 + (j >> 8));
          }
        }
      }
      if (n) out.push({ cx: c.x, cz: c.z, n, top });
    }
  }
  return out;
}
