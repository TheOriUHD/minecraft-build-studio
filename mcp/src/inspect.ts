// Text-based analysis of builds: stats, per-component bounds, ASCII slices.
import { VoxelGrid, Bounds } from "./voxel.ts";
import { PALETTE, parseState } from "./blocks/state.ts";

export function dims(b: Bounds | null) {
  if (!b) return "empty";
  const s = [b.max[0] - b.min[0] + 1, b.max[1] - b.min[1] + 1, b.max[2] - b.min[2] + 1];
  return `${s[0]}×${s[1]}×${s[2]} (x ${b.min[0]}..${b.max[0]}, y ${b.min[1]}..${b.max[1]}, z ${b.min[2]}..${b.max[2]})`;
}

export function stats(grid: VoxelGrid, per: Map<string, VoxelGrid>): string {
  const lines: string[] = [];
  let solid = 0;
  for (const id of grid.cells.values()) if (id !== 0) solid++;
  lines.push(`Composite: ${solid} blocks, ${dims(grid.bounds())}`);
  for (const [n, g] of per) {
    let s = 0, air = 0;
    for (const id of g.cells.values()) id === 0 ? air++ : s++;
    lines.push(`  - ${n}: ${s} blocks${air ? ` (+${air} air/carve)` : ""}, ${dims(g.bounds())}`);
  }
  const byName = new Map<string, number>();
  for (const id of grid.cells.values()) {
    if (id === 0) continue;
    const n = parseState(PALETTE.get(id)).name;
    byName.set(n, (byName.get(n) ?? 0) + 1);
  }
  const top = [...byName].sort((a, b) => b[1] - a[1]);
  lines.push(`Materials (${top.length} block types):`);
  lines.push("  " + top.slice(0, 40).map(([n, c]) => `${n} ${c} (${((100 * c) / solid).toFixed(1)}%)`).join(", "));
  return lines.join("\n");
}

const CHARS = "#=+%@&*o0OxXsSdDbBpPqQwWmMnNuUvVkKhHgGfFeEcCaAzZrRtTyYiIlLjJ";

/** ASCII slice. axis y: plan (rows = z north→south, cols = x). axis x/z: elevation (rows = y top→down). */
export function slice(grid: VoxelGrid, axis: "x" | "y" | "z", v: number, region?: Bounds): string {
  const b = region ?? grid.bounds();
  if (!b) return "(empty)";
  const legend = new Map<string, string>();
  const ch = (id: number | undefined) => {
    if (id === undefined) return ".";
    if (id === 0) return " ";
    const n = parseState(PALETTE.get(id)).name;
    let c = legend.get(n);
    if (!c) {
      c = CHARS[legend.size] ?? "?";
      legend.set(n, c);
    }
    return c;
  };
  const rows: string[] = [];
  let header = "";
  if (axis === "y") {
    header = `Plan at y=${v} (rows: z from ${b.min[2]} (north) to ${b.max[2]} (south); cols: x from ${b.min[0]} to ${b.max[0]})`;
    for (let z = b.min[2]; z <= b.max[2]; z++) {
      let r = "";
      for (let x = b.min[0]; x <= b.max[0]; x++) r += ch(grid.getId(x, v, z));
      rows.push(`${String(z).padStart(4)} ${r}`);
    }
    rows.unshift("     " + ruler(b.min[0], b.max[0]));
  } else {
    const u0 = axis === "x" ? b.min[2] : b.min[0], u1 = axis === "x" ? b.max[2] : b.max[0];
    header = `Elevation slice at ${axis}=${v} (rows: y from ${b.max[1]} down to ${b.min[1]}; cols: ${axis === "x" ? "z" : "x"} from ${u0} to ${u1})`;
    for (let y = b.max[1]; y >= b.min[1]; y--) {
      let r = "";
      for (let u = u0; u <= u1; u++) r += ch(axis === "x" ? grid.getId(v, y, u) : grid.getId(u, y, v));
      rows.push(`${String(y).padStart(4)} ${r}`);
    }
    rows.unshift("     " + ruler(u0, u1));
  }
  const leg = [...legend].map(([n, c]) => `${c}=${n}`).join("  ");
  return `${header}\n'.'=nothing set, ' '=air (carved)\n${rows.join("\n")}\nLegend: ${leg}`;
}

function ruler(a: number, b: number) {
  let s = "";
  for (let i = a; i <= b; i++) s += i % 10 === 0 ? "|" : i % 5 === 0 ? "+" : "-";
  return s;
}
