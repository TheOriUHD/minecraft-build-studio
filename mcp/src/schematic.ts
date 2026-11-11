// Sponge schematic (.schem) export (v3) and import (v2/v3), compatible with WorldEdit / FAWE.
import zlib from "node:zlib";
import nbt from "prismarine-nbt";
import { VoxelGrid } from "./voxel.ts";
import { PALETTE } from "./blocks/state.ts";

function varints(vals: number[]): Buffer {
  const out: number[] = [];
  for (let v of vals) {
    while ((v & ~0x7f) !== 0) {
      out.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    out.push(v);
  }
  return Buffer.from(out);
}

export function writeSchematic(grid: VoxelGrid, dataVersion: number, opts: { includeAir?: boolean } = {}): Buffer {
  const bb = grid.bounds(opts.includeAir ?? false);
  if (!bb) throw new Error("nothing to export");
  const W = bb.max[0] - bb.min[0] + 1, H = bb.max[1] - bb.min[1] + 1, L = bb.max[2] - bb.min[2] + 1;
  const pal = new Map<string, number>([["minecraft:air", 0]]);
  const data = new Array(W * H * L).fill(0);
  for (const [x, y, z, id] of grid.entries()) {
    if (x < bb.min[0] || y < bb.min[1] || z < bb.min[2] || x > bb.max[0] || y > bb.max[1] || z > bb.max[2]) continue;
    const s = "minecraft:" + PALETTE.get(id);
    let pi = pal.get(s);
    if (pi === undefined) {
      pi = pal.size;
      pal.set(s, pi);
    }
    data[(x - bb.min[0]) + (z - bb.min[2]) * W + (y - bb.min[1]) * W * L] = pi;
  }
  const palette: Record<string, any> = {};
  for (const [s, i] of pal) palette[s] = { type: "int", value: i };
  const root = {
    type: "compound",
    name: "",
    value: {
      Schematic: {
        type: "compound",
        value: {
          Version: { type: "int", value: 3 },
          DataVersion: { type: "int", value: dataVersion },
          Width: { type: "short", value: W },
          Height: { type: "short", value: H },
          Length: { type: "short", value: L },
          Offset: { type: "intArray", value: [0, 0, 0] },
          Metadata: { type: "compound", value: { WEOffsetX: { type: "int", value: 0 }, WEOffsetY: { type: "int", value: 0 }, WEOffsetZ: { type: "int", value: 0 } } },
          Blocks: {
            type: "compound",
            value: {
              Palette: { type: "compound", value: palette },
              Data: { type: "byteArray", value: [...varints(data)].map((b) => (b > 127 ? b - 256 : b)) },
              BlockEntities: { type: "list", value: { type: "compound", value: [] } },
            },
          },
        },
      },
    },
  };
  return zlib.gzipSync(nbt.writeUncompressed(root as any, "big"));
}

export function readSchematic(buf: Buffer): VoxelGrid {
  const raw = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf;
  const parsed = nbt.parseUncompressed(raw, "big");
  let s: any = nbt.simplify(parsed as any);
  if (s.Schematic) s = s.Schematic;
  const W = s.Width, H = s.Height, L = s.Length;
  let palette: Record<string, number>, bytes: number[];
  if (s.Blocks) {
    palette = s.Blocks.Palette;
    bytes = s.Blocks.Data;
  } else {
    palette = s.Palette;
    bytes = s.BlockData;
  }
  if (!palette || !bytes) throw new Error("unsupported schematic (need Sponge v2/v3)");
  const inv: string[] = [];
  for (const [k, v] of Object.entries(palette)) inv[v as number] = k;
  const g = new VoxelGrid();
  let i = 0, idx = 0;
  while (i < bytes.length) {
    let v = 0, shift = 0, b: number;
    do {
      b = bytes[i++] & 0xff;
      v |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    const x = idx % W, z = Math.floor(idx / W) % L, y = Math.floor(idx / (W * L));
    g.set(x, y, z, inv[v] ?? "air");
    idx++;
  }
  void H;
  return g;
}
