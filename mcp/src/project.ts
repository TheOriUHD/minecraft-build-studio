// Build projects: a folder of component scripts + metadata, compiled deterministically into voxels,
// diffed against what is in the world, applied, checkpointed and undone.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { VoxelGrid, key, unkey } from "./voxel.ts";
import { Builder, Sink, current } from "./toolkit/builder.ts";
import { BlockSpec, Vec, mulberry32, strSeed, hash3, noise3 } from "./toolkit/patterns.ts";
import { makeLib, Terrain } from "./toolkit/lib.ts";
import { PALETTE, parseState, formatState, canonical } from "./blocks/state.ts";
import { autoConnect } from "./blocks/connect.ts";
import { rotVec, transformState } from "./blocks/transform.ts";
import * as bridge from "./bridge.ts";
import { readSchematic } from "./schematic.ts";

export const PROJECTS_DIR = process.env.BUILDMCP_PROJECTS ?? path.resolve(import.meta.dirname, "../../projects");

export interface ComponentMeta {
  name: string;
  enabled?: boolean;
  owner?: string | null; // agent that has claimed it
  status?: string; // e.g. massing / detailing / done
  description?: string;
  params?: Record<string, any>;
  offset?: Vec; // extra translation for this component
}

export interface ProjectMeta {
  name: string;
  world: string;
  origin: Vec; // world position of local [0,0,0]
  rotation?: number; // quarter turns cw applied when placing in the world
  front?: "south" | "north" | "east" | "west"; // which local side is the main facade
  site?: { min: [number, number]; max: [number, number] }; // local x,z rectangle reserved for this build
  seed?: number;
  style?: string;
  palette: Record<string, BlockSpec>;
  components: ComponentMeta[];
  created?: string;
}

export interface Task {
  id: number;
  title: string;
  component?: string;
  role?: string;
  assignee?: string | null;
  status: "open" | "in_progress" | "review" | "done";
  notes?: string;
}

export interface CompileResult {
  grid: VoxelGrid; // project-local composite (finalized)
  perComponent: Map<string, VoxelGrid>;
  anchors: Record<string, Vec>;
  warnings: string[];
  logs: string[];
  ms: number;
}

const safe = (s: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) throw new Error(`invalid name '${s}' (use letters, digits, _ and -)`);
  return s;
};

export class Project {
  readonly dir: string;
  constructor(readonly name: string) {
    this.dir = path.join(PROJECTS_DIR, safe(name));
  }
  static list(): string[] {
    if (!fs.existsSync(PROJECTS_DIR)) return [];
    return fs.readdirSync(PROJECTS_DIR).filter((d) => fs.existsSync(path.join(PROJECTS_DIR, d, "project.json")));
  }
  exists() {
    return fs.existsSync(path.join(this.dir, "project.json"));
  }
  p(...parts: string[]) {
    return path.join(this.dir, ...parts);
  }
  meta(): ProjectMeta {
    if (!this.exists()) throw new Error(`project '${this.name}' does not exist (projects: ${Project.list().join(", ") || "none"})`);
    return JSON.parse(fs.readFileSync(this.p("project.json"), "utf8"));
  }
  saveMeta(m: ProjectMeta) {
    writeAtomic(this.p("project.json"), JSON.stringify(m, null, 2));
  }
  /** Read-modify-write project.json under a cross-process lock (several agents may share a project). */
  async update<T>(fn: (m: ProjectMeta) => T): Promise<T> {
    return withLock(this.p(".lock"), () => {
      const m = this.meta();
      const r = fn(m);
      this.saveMeta(m);
      return r;
    });
  }

  static create(m: ProjectMeta, brief: string): Project {
    const pr = new Project(m.name);
    if (pr.exists()) throw new Error(`project '${m.name}' already exists`);
    for (const d of ["components", "lib", "schematics", "reviews", "exports", ".state/checkpoints"]) fs.mkdirSync(pr.p(d), { recursive: true });
    m.created = new Date().toISOString();
    pr.saveMeta(m);
    fs.writeFileSync(pr.p("brief.md"), brief);
    fs.writeFileSync(pr.p("tasks.json"), "[]");
    return pr;
  }

  componentFile(name: string) {
    return this.p("components", safe(name) + ".js");
  }
  readComponent(name: string): string {
    const f = this.componentFile(name);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  }

  // ---------- notes / tasks ----------
  postNote(author: string, text: string, tags: string[] = []) {
    fs.appendFileSync(this.p("notes.jsonl"), JSON.stringify({ t: new Date().toISOString(), author, text, tags }) + "\n");
  }
  notes(limit = 50): any[] {
    if (!fs.existsSync(this.p("notes.jsonl"))) return [];
    const lines = fs.readFileSync(this.p("notes.jsonl"), "utf8").trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l));
  }
  async tasks<T>(fn: (t: Task[]) => T): Promise<T> {
    return withLock(this.p(".lock-tasks"), () => {
      const f = this.p("tasks.json");
      const t: Task[] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
      const r = fn(t);
      writeAtomic(f, JSON.stringify(t, null, 2));
      return r;
    });
  }

  // ---------- terrain ----------
  heightmapFile() {
    return this.p(".state", "heightmap.json");
  }
  /** Fetch the terrain under the site (+margin) from the server and cache it in local coordinates. */
  async survey(margin = 16): Promise<{ min: [number, number]; max: [number, number]; heights: number[]; palette: string[]; surface: number[] }> {
    const m = this.meta();
    const site = m.site ?? { min: [-16, -16], max: [47, 47] };
    const minL: [number, number] = [site.min[0] - margin, site.min[1] - margin];
    const maxL: [number, number] = [site.max[0] + margin, site.max[1] + margin];
    // world rectangle (rotation-aware)
    const corners = [
      [minL[0], minL[1]], [maxL[0], minL[1]], [minL[0], maxL[1]], [maxL[0], maxL[1]],
    ].map(([x, z]) => this.toWorld([x, 0, z], m));
    const wx0 = Math.min(...corners.map((c) => c[0])), wx1 = Math.max(...corners.map((c) => c[0]));
    const wz0 = Math.min(...corners.map((c) => c[2])), wz1 = Math.max(...corners.map((c) => c[2]));
    const r = await bridge.call("/heightmap", { world: m.world, minX: wx0, minZ: wz0, maxX: wx1, maxZ: wz1 });
    const W = maxL[0] - minL[0] + 1, D = maxL[1] - minL[1] + 1;
    const heights = new Array(W * D).fill(0);
    const surface = new Array(W * D).fill(0);
    for (let z = minL[1]; z <= maxL[1]; z++)
      for (let x = minL[0]; x <= maxL[0]; x++) {
        const w = this.toWorld([x, 0, z], m);
        const i = (w[2] - wz0) * (wx1 - wx0 + 1) + (w[0] - wx0);
        const j = (z - minL[1]) * W + (x - minL[0]);
        heights[j] = r.heights[i] - m.origin[1];
        surface[j] = r.surface[i];
      }
    const hm = { min: minL, max: maxL, heights, palette: r.palette as string[], surface };
    writeAtomic(this.heightmapFile(), JSON.stringify(hm));
    return hm;
  }
  terrain(): Terrain {
    const f = this.heightmapFile();
    if (!fs.existsSync(f)) {
      return { height: () => -1, surface: () => "grass_block" };
    }
    const hm = JSON.parse(fs.readFileSync(f, "utf8"));
    const W = hm.max[0] - hm.min[0] + 1, D = hm.max[1] - hm.min[1] + 1;
    const idx = (x: number, z: number) => {
      const cx = Math.max(0, Math.min(W - 1, x - hm.min[0]));
      const cz = Math.max(0, Math.min(D - 1, z - hm.min[1]));
      return cz * W + cx;
    };
    return {
      height: (x, z) => hm.heights[idx(Math.round(x), Math.round(z))],
      surface: (x, z) => hm.palette[hm.surface[idx(Math.round(x), Math.round(z))]],
    };
  }

  // ---------- coordinates ----------
  toWorld(p: Vec, m = this.meta()): Vec {
    const [x, y, z] = rotVec(p[0], p[1], p[2], { rot: ((m.rotation ?? 0) % 4 + 4) % 4, mirrorX: false, mirrorZ: false });
    return [m.origin[0] + x, m.origin[1] + y, m.origin[2] + z];
  }

  // ---------- compile ----------
  compile(opts: { only?: string[]; skip?: string[] } = {}): CompileResult {
    const t0 = Date.now();
    const m = this.meta();
    const seed = m.seed ?? 1337;
    current.palette = m.palette;
    const terrain = this.terrain();
    const lib: any = makeLib(terrain);
    const logs: string[] = [];
    const warnings = new Set<string>();
    const anchors: Record<string, Vec> = {};
    const shared: Record<string, any> = {}; // objects later components can reuse (e.g. shared.hm = heightmap)
    const schemCache = new Map<string, VoxelGrid>();
    const schematics = (name: string) => {
      let g = schemCache.get(name);
      if (!g) {
        const file = this.p("schematics", path.basename(name).endsWith(".schem") ? path.basename(name) : path.basename(name) + ".schem");
        if (!fs.existsSync(file)) throw new Error(`schematic not found: ${file}`);
        g = readSchematic(fs.readFileSync(file));
        schemCache.set(name, g);
      }
      return g;
    };
    const baseCtx = {
      Math, JSON, console: { log: (...a: any[]) => logs.push(a.map(String).join(" ")) },
      log: (...a: any[]) => logs.push(a.map(String).join(" ")),
      hash: hash3, noise: noise3, terrain, lib, palette: m.palette, anchors, shared,
    };
    // project lib
    const libDir = this.p("lib");
    if (fs.existsSync(libDir)) {
      for (const f of fs.readdirSync(libDir).filter((f) => f.endsWith(".js")).sort()) {
        const exports: any = {};
        const ctx = vm.createContext({ ...baseCtx, exports, module: { exports } });
        try {
          vm.runInContext(fs.readFileSync(path.join(libDir, f), "utf8"), ctx, { filename: `lib/${f}`, timeout: 5000 });
        } catch (e: any) {
          throw new Error(`lib/${f}: ${e.message}`);
        }
        const ex = (ctx as any).module.exports ?? exports;
        Object.assign(lib, ex);
      }
    }
    const perComponent = new Map<string, VoxelGrid>();
    const composite = new VoxelGrid(); // everything compiled so far (for peek)
    const output = new VoxelGrid(); // selected components only
    for (const c of m.components) {
      if (c.enabled === false) continue;
      // filtered compiles still run the earlier components (later ones may read them via peek), but only selected
      // components end up in the output
      const selected = !(opts.only && !opts.only.includes(c.name)) && !opts.skip?.includes(c.name);
      const lastNeeded = opts.only ? Math.max(...opts.only.map((n) => m.components.findIndex((x) => x.name === n))) : Infinity;
      if (!selected && m.components.indexOf(c) > lastNeeded) continue;
      const code = this.readComponent(c.name);
      const grid = new VoxelGrid();
      const sink: Sink = { grid, ctx: { palette: m.palette, seed: (seed ^ strSeed(c.name)) >>> 0 }, anchors: {}, warnings, limit: 4_000_000, schematics, prior: composite };
      const b = new Builder(sink, c.offset ?? [0, 0, 0]);
      const ctx = vm.createContext({ ...baseCtx, b, params: c.params ?? {}, rng: mulberry32((seed ^ strSeed(c.name)) >>> 0), component: c.name });
      try {
        vm.runInContext(`"use strict";\n${code}`, ctx, { filename: `components/${c.name}.js`, timeout: 20000, lineOffset: -1 });
      } catch (e: any) {
        const where = (e.stack ?? "").split("\n").find((l: string) => l.includes(`components/${c.name}.js`)) ?? "";
        throw new Error(`component '${c.name}' failed: ${e.message}${where ? `\n  at ${where.trim()}` : ""}`);
      }
      for (const [k, v] of Object.entries(sink.anchors)) anchors[`${c.name}.${k}`] = v;
      if (selected) {
        perComponent.set(c.name, grid);
        output.overlay(grid);
      }
      composite.overlay(grid);
    }
    finalize(output, warnings, (x, y, z) => composite.get(x, y, z));
    return { grid: output, perComponent, anchors, warnings: [...warnings], logs, ms: Date.now() - t0 };
  }

  // ---------- world application ----------
  private stateFile(n: string) {
    return this.p(".state", n);
  }
  private loadMap(n: string): Map<number, string> {
    const f = this.stateFile(n);
    const out = new Map<number, string>();
    if (!fs.existsSync(f)) return out;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    for (let i = 0; i < j.data.length; i += 4) out.set(key(j.data[i], j.data[i + 1], j.data[i + 2]), j.palette[j.data[i + 3]]);
    return out;
  }
  private saveMap(n: string, mp: Map<number, string>) {
    const pal = new Map<string, number>();
    const palette: string[] = [];
    const data: number[] = [];
    for (const [k, s] of mp) {
      let i = pal.get(s);
      if (i === undefined) {
        i = palette.length;
        palette.push(s);
        pal.set(s, i);
      }
      const [x, y, z] = unkey(k);
      data.push(x, y, z, i);
    }
    writeAtomic(this.stateFile(n), JSON.stringify({ palette, data }));
  }

  /** World-space map for a compiled grid (rotation applied to coordinates and block states). */
  toWorldMap(grid: VoxelGrid, m = this.meta()): Map<number, string> {
    const rot = (((m.rotation ?? 0) % 4) + 4) % 4;
    const o = { rot, mirrorX: false, mirrorZ: false };
    const out = new Map<number, string>();
    for (const [x, y, z, id] of grid.entries()) {
      const w = this.toWorld([x, y, z], m);
      out.set(key(w[0], w[1], w[2]), transformState(PALETTE.get(id), o));
    }
    return out;
  }

  /**
   * Apply the compiled build to the world: writes only what changed since the last apply, restores the
   * original terrain where the build no longer has blocks, and records the original state for undo.
   */
  async apply(res: CompileResult, label: string, author = "agent"): Promise<{ written: number; restored: number; changed: number; checkpoint: string }> {
    const m = this.meta();
    return withLock(this.p(".lock-apply"), async () => {
      const target = this.toWorldMap(res.grid, m);
      const applied = this.loadMap("applied.json");
      const baseline = this.loadMap("baseline.json");
      const writes = new Map<number, string>();
      let restored = 0;
      for (const [k, s] of target) if (applied.get(k) !== s) writes.set(k, s);
      for (const [k] of applied)
        if (!target.has(k)) {
          writes.set(k, baseline.get(k) ?? "air");
          restored++;
        }
      let changed = 0;
      if (writes.size) {
        const r = await writeBlocks(m.world, writes);
        changed = r.changed;
        for (const [k, s] of writes) if (!baseline.has(k) && !applied.has(k)) baseline.set(k, r.previous.get(k) ?? s);
      }
      // positions restored to baseline are no longer "ours"
      for (const [k] of applied) if (!target.has(k)) baseline.delete(k);
      this.saveMap("baseline.json", baseline);
      this.saveMap("applied.json", target);
      const cp = this.checkpoint(label, author);
      return { written: writes.size, restored, changed, checkpoint: cp };
    });
  }

  /** Remove the build from the world, restoring the original blocks. */
  async removeFromWorld(): Promise<number> {
    const m = this.meta();
    return withLock(this.p(".lock-apply"), async () => {
      const applied = this.loadMap("applied.json");
      const baseline = this.loadMap("baseline.json");
      const writes = new Map<number, string>();
      for (const [k] of applied) writes.set(k, baseline.get(k) ?? "air");
      if (writes.size) await writeBlocks(m.world, writes);
      this.saveMap("applied.json", new Map());
      this.saveMap("baseline.json", new Map());
      return writes.size;
    });
  }

  appliedBounds(): { min: Vec; max: Vec } | null {
    const a = this.loadMap("applied.json");
    if (!a.size) return null;
    const g = new VoxelGrid();
    for (const [k] of a) {
      const [x, y, z] = unkey(k);
      g.setId(x, y, z, 1);
    }
    return g.bounds(true) as any;
  }

  // ---------- checkpoints ----------
  checkpoint(label: string, author: string): string {
    const id = new Date().toISOString().replace(/[:.]/g, "-") + "_" + label.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40);
    const dir = this.p(".state", "checkpoints", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(this.p("components"), path.join(dir, "components"), { recursive: true });
    if (fs.existsSync(this.p("lib"))) fs.cpSync(this.p("lib"), path.join(dir, "lib"), { recursive: true });
    fs.copyFileSync(this.p("project.json"), path.join(dir, "project.json"));
    fs.writeFileSync(path.join(dir, "info.json"), JSON.stringify({ id, label, author, t: new Date().toISOString() }));
    return id;
  }
  checkpoints(): { id: string; label: string; author: string; t: string }[] {
    const d = this.p(".state", "checkpoints");
    if (!fs.existsSync(d)) return [];
    return fs
      .readdirSync(d)
      .sort()
      .map((id) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(d, id, "info.json"), "utf8"));
        } catch {
          return { id, label: "?", author: "?", t: "" };
        }
      });
  }
  /** Restore sources (components, lib, project.json) from a checkpoint. Caller re-applies. */
  restoreCheckpoint(id: string) {
    const dir = this.p(".state", "checkpoints", path.basename(id));
    if (!fs.existsSync(dir)) throw new Error(`no checkpoint '${id}'`);
    this.checkpoint("before-restore", "system");
    fs.rmSync(this.p("components"), { recursive: true, force: true });
    fs.cpSync(path.join(dir, "components"), this.p("components"), { recursive: true });
    if (fs.existsSync(path.join(dir, "lib"))) {
      fs.rmSync(this.p("lib"), { recursive: true, force: true });
      fs.cpSync(path.join(dir, "lib"), this.p("lib"), { recursive: true });
    }
    fs.copyFileSync(path.join(dir, "project.json"), this.p("project.json"));
  }
}

async function writeBlocks(world: string, writes: Map<number, string>): Promise<{ changed: number; previous: Map<number, string> }> {
  const previous = new Map<number, string>();
  let changed = 0;
  const entries = [...writes];
  // order: bottom-up so supported blocks (torches, doors, plants) have support when placed
  entries.sort((a, b) => unkey(a[0])[1] - unkey(b[0])[1]);
  const CH = 200_000;
  for (let i = 0; i < entries.length; i += CH) {
    const slice = entries.slice(i, i + CH);
    const pal = new Map<string, number>();
    const palette: string[] = [];
    const blocks: number[] = [];
    for (const [k, s] of slice) {
      const ns = "minecraft:" + s;
      let pi = pal.get(ns);
      if (pi === undefined) {
        pi = palette.length;
        palette.push(ns);
        pal.set(ns, pi);
      }
      const [x, y, z] = unkey(k);
      blocks.push(x, y, z, pi);
    }
    const r = await bridge.call("/write", { world, palette, blocks, physics: false });
    changed += r.changed;
    const pp: string[] = r.previousPalette ?? [];
    const pb: number[] = r.previousBlocks ?? [];
    for (let j = 0; j < pb.length; j += 4) previous.set(key(pb[j], pb[j + 1], pb[j + 2]), canonical(pp[pb[j + 3]]));
  }
  return { changed, previous };
}

/** Final pass on a composite: connections, double-height blocks, persistent leaves. */
export function finalize(grid: VoxelGrid, warnings: Set<string>, context?: (x: number, y: number, z: number) => string | undefined) {
  const adds: [number, number, number, string][] = [];
  for (const [x, y, z, id] of grid.entries()) {
    if (id === 0) continue;
    const s = PALETTE.get(id);
    const st = parseState(s);
    const n = st.name;
    if (n.endsWith("_leaves") && !("persistent" in st.props)) {
      adds.push([x, y, z, formatState({ name: n, props: { ...st.props, persistent: "true" } })]);
    } else if ((n.endsWith("_door") || DOUBLE_PLANTS.has(n)) && st.props.half !== "upper") {
      if (!("half" in st.props)) adds.push([x, y, z, formatState({ name: n, props: { ...st.props, half: "lower" } })]);
      const above = grid.get(x, y + 1, z);
      if (!(above && parseState(above).name === n && parseState(above).props.half === "upper")) {
        if (above !== undefined && grid.getId(x, y + 1, z) !== 0) warnings.add(`${n} at [${x},${y},${z}]: replaced ${above} above it with the door's upper half`);
        adds.push([x, y + 1, z, formatState({ name: n, props: { ...st.props, half: "upper" } })]);
      }
    } else if (n.endsWith("_bed") && !("part" in st.props)) {
      const f = st.props.facing ?? "south";
      const v: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
      adds.push([x, y, z, formatState({ name: n, props: { ...st.props, facing: f, part: "foot" } })]);
      adds.push([x + v[f][0], y, z + v[f][1], formatState({ name: n, props: { ...st.props, facing: f, part: "head" } })]);
    }
  }
  for (const [x, y, z, s] of adds) grid.set(x, y, z, s);
  autoConnect(grid, (x, y, z) => {
    const id = grid.getId(x, y, z);
    if (id !== undefined) return id === 0 ? undefined : PALETTE.get(id);
    return context?.(x, y, z);
  });
}

const DOUBLE_PLANTS = new Set(["tall_grass", "large_fern", "sunflower", "lilac", "rose_bush", "peony", "tall_seagrass", "pitcher_plant"]);

function writeAtomic(file: string, data: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

async function withLock<T>(lockDir: string, fn: () => T | Promise<T>): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      try {
        const age = Date.now() - fs.statSync(lockDir).mtimeMs;
        if (age > 120_000) fs.rmSync(lockDir, { recursive: true, force: true });
      } catch {}
      if (Date.now() - start > 180_000) throw new Error(`timed out waiting for lock ${lockDir}`);
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}
