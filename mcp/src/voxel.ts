// Sparse voxel grid storing palette ids. Coordinates: |x|,|z| < 524288, |y| < 2048.
import { PALETTE } from "./blocks/state.ts";

const OX = 524288, OY = 2048;
const SY = 4096, SZ = 1048576;

export const key = (x: number, y: number, z: number) => ((x + OX) * SZ + (z + OX)) * SY + (y + OY);
export function unkey(k: number): [number, number, number] {
  const y = (k % SY) - OY;
  const r = Math.floor(k / SY);
  const z = (r % SZ) - OX;
  const x = Math.floor(r / SZ) - OX;
  return [x, y, z];
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export class VoxelGrid {
  readonly cells = new Map<number, number>();

  get size() {
    return this.cells.size;
  }
  setId(x: number, y: number, z: number, id: number) {
    this.cells.set(key(x, y, z), id);
  }
  set(x: number, y: number, z: number, state: string) {
    this.cells.set(key(x, y, z), PALETTE.id(state));
  }
  getId(x: number, y: number, z: number): number | undefined {
    return this.cells.get(key(x, y, z));
  }
  get(x: number, y: number, z: number): string | undefined {
    const i = this.cells.get(key(x, y, z));
    return i === undefined ? undefined : PALETTE.get(i);
  }
  delete(x: number, y: number, z: number) {
    this.cells.delete(key(x, y, z));
  }
  *entries(): Generator<[number, number, number, number]> {
    for (const [k, id] of this.cells) {
      const [x, y, z] = unkey(k);
      yield [x, y, z, id];
    }
  }
  /** Bounds of non-air blocks (air entries are "carves"). */
  bounds(includeAir = false): Bounds | null {
    let min: [number, number, number] | null = null;
    let max: [number, number, number] = [0, 0, 0];
    for (const [x, y, z, id] of this.entries()) {
      if (!includeAir && id === 0) continue;
      if (!min) {
        min = [x, y, z];
        max = [x, y, z];
      } else {
        if (x < min[0]) min[0] = x;
        if (y < min[1]) min[1] = y;
        if (z < min[2]) min[2] = z;
        if (x > max[0]) max[0] = x;
        if (y > max[1]) max[1] = y;
        if (z > max[2]) max[2] = z;
      }
    }
    return min ? { min, max } : null;
  }
  /** Copy cells of other on top of this one. */
  overlay(other: VoxelGrid) {
    for (const [k, v] of other.cells) this.cells.set(k, v);
  }
  clone(): VoxelGrid {
    const g = new VoxelGrid();
    for (const [k, v] of this.cells) g.cells.set(k, v);
    return g;
  }
  counts(): Map<string, number> {
    const m = new Map<string, number>();
    for (const id of this.cells.values()) {
      const s = PALETTE.get(id);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }
  /** Serialize to compact JSON: palette + flat [x,y,z,i,...]. */
  toJSON() {
    const local = new Map<number, number>();
    const palette: string[] = [];
    const data: number[] = [];
    for (const [x, y, z, id] of this.entries()) {
      let li = local.get(id);
      if (li === undefined) {
        li = palette.length;
        palette.push(PALETTE.get(id));
        local.set(id, li);
      }
      data.push(x, y, z, li);
    }
    return { palette, data };
  }
  static fromJSON(j: { palette: string[]; data: number[] }): VoxelGrid {
    const g = new VoxelGrid();
    const ids = j.palette.map((s) => PALETTE.id(s));
    for (let i = 0; i < j.data.length; i += 4) g.setId(j.data[i], j.data[i + 1], j.data[i + 2], ids[j.data[i + 3]]);
    return g;
  }
}
