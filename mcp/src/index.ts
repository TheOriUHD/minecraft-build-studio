#!/usr/bin/env node
// Minecraft Build MCP — a programmable building studio for AI agents (and teams of agents).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Project, ProjectMeta, PROJECTS_DIR, CompileResult } from "./project.ts";
import * as bridge from "./bridge.ts";
import { renderGrid, renderService, VIEW_HELP } from "./render/renderer.ts";
import { VoxelGrid, key, unkey, Bounds } from "./voxel.ts";
import { stats, slice, dims } from "./inspect.ts";
import { analyzeInterior } from "./interiorcheck.ts";
import { runQA, walkthroughViews, formatFindings } from "./qa.ts";
import { listDimensions, loadBlocks, chunkDensity } from "./worldreader.ts";
const dims_ = dims;
const NL = String.fromCharCode(10);
import { writeSchematic, readSchematic } from "./schematic.ts";
import { assets } from "./blocks/assets.ts";
import { PALETTE, canonical } from "./blocks/state.ts";
import { rotVec } from "./blocks/transform.ts";

const KNOWLEDGE = path.resolve(import.meta.dirname, "../knowledge");
const doc = (n: string) => fs.readFileSync(path.join(KNOWLEDGE, n), "utf8");

const server = new McpServer(
  { name: "minecraft-build-studio", version: "0.1.0" },
  {
    instructions: `Minecraft Build Studio: build in Minecraft by writing deterministic JavaScript component scripts against a builder toolkit, then LOOK at rendered images and revise.
Start every build by reading toolkit_reference (topic "workflow" and "api") once. Work in stages: massing → proportions → roof/openings/depth → materials/details → landscaping → review.
Each project is a folder of named components (e.g. "massing", "west_tower", "roof", "landscape") that compile in order into one voxel model in project-local coordinates.
Always verify with render() after meaningful changes and critique concretely ("roof overhang too thin on the east gable"), then fix with targeted code edits.
Several agents can work on one project: claim components (component_settings owner), use tasks and notes to coordinate.`,
  },
);

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
const text = (t: string): { content: Content[] } => ({ content: [{ type: "text", text: t }] });
const fail = (e: any) => ({ content: [{ type: "text" as const, text: `ERROR: ${e?.message ?? e}` }], isError: true });

function wrap<T>(fn: (a: T) => Promise<{ content: Content[] }>) {
  return async (a: T) => {
    try {
      return (await fn(a)) as any;
    } catch (e) {
      return fail(e) as any;
    }
  };
}

const proj = (name: string) => {
  const p = new Project(name);
  p.meta();
  return p;
};

function compileSummary(r: CompileResult) {
  const lines = [`Compiled in ${r.ms} ms.`, stats(r.grid, r.perComponent)];
  if (Object.keys(r.anchors).length) lines.push("Anchors: " + Object.entries(r.anchors).map(([k, v]) => `${k}=[${v}]`).join(", "));
  if (r.warnings.length) lines.push("Warnings:\n  " + r.warnings.slice(0, 20).join("\n  "));
  if (r.logs.length) lines.push("Script log:\n  " + r.logs.slice(0, 40).join("\n  "));
  return lines.join("\n");
}

// ----- world context for previews -----
async function worldContext(p: Project, focus: Bounds, margin = 16): Promise<VoxelGrid | null> {
  if (!(await bridge.available())) return null;
  const m = p.meta();
  const min = [focus.min[0] - margin, focus.min[1] - 3, focus.min[2] - margin];
  const max = [focus.max[0] + margin, focus.max[1] + 6, focus.max[2] + margin];
  // world bounds of the local box
  const corners: number[][] = [];
  for (const x of [min[0], max[0]]) for (const z of [min[2], max[2]]) corners.push(p.toWorld([x, 0, z], m));
  const wmin = [Math.min(...corners.map((c) => c[0])), m.origin[1] + min[1], Math.min(...corners.map((c) => c[2]))];
  const wmax = [Math.max(...corners.map((c) => c[0])), m.origin[1] + max[1], Math.max(...corners.map((c) => c[2]))];
  const g = new VoxelGrid();
  const rot = (((m.rotation ?? 0) % 4) + 4) % 4;
  const inv = { rot: (4 - rot) % 4, mirrorX: false, mirrorZ: false };
  // positions currently occupied by this project's applied build show their original (baseline) state
  const baselinePath = p.p(".state", "baseline.json");
  const appliedPath = p.p(".state", "applied.json");
  const base = new Map<number, string>();
  const applied = new Set<number>();
  if (fs.existsSync(appliedPath)) {
    const a = JSON.parse(fs.readFileSync(appliedPath, "utf8"));
    for (let i = 0; i < a.data.length; i += 4) applied.add(key(a.data[i], a.data[i + 1], a.data[i + 2]));
  }
  if (fs.existsSync(baselinePath)) {
    const a = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    for (let i = 0; i < a.data.length; i += 4) base.set(key(a.data[i], a.data[i + 1], a.data[i + 2]), a.palette[a.data[i + 3]]);
  }
  await bridge.readRegion(m.world, wmin, wmax, (x, y, z, s) => {
    const k = key(x, y, z);
    let st = s;
    if (applied.has(k)) st = base.get(k) ?? "air";
    if (st.endsWith(":air") || st === "air") return;
    const [lx, , lz] = rotVec(x - m.origin[0], 0, z - m.origin[2], inv);
    g.set(lx, y - m.origin[1], lz, canonical(st));
  });
  return g;
}

async function readWorldBuild(p: Project): Promise<{ grid: VoxelGrid; bounds: Bounds } | null> {
  const ab = p.appliedBounds();
  if (!ab) return null;
  const m = p.meta();
  const g = new VoxelGrid();
  const rot = (((m.rotation ?? 0) % 4) + 4) % 4;
  const inv = { rot: (4 - rot) % 4, mirrorX: false, mirrorZ: false };
  const pad = 6;
  await bridge.readRegion(m.world, [ab.min[0] - pad, ab.min[1] - 4, ab.min[2] - pad], [ab.max[0] + pad, ab.max[1] + 3, ab.max[2] + pad], (x, y, z, s) => {
    if (s === "minecraft:air") return;
    const [lx, , lz] = rotVec(x - m.origin[0], 0, z - m.origin[2], inv);
    g.set(lx, y - m.origin[1], lz, canonical(s));
  });
  // bounds in local coords
  const c1 = rotVec(ab.min[0] - m.origin[0], 0, ab.min[2] - m.origin[2], inv), c2 = rotVec(ab.max[0] - m.origin[0], 0, ab.max[2] - m.origin[2], inv);
  const bounds: Bounds = {
    min: [Math.min(c1[0], c2[0]), ab.min[1] - m.origin[1], Math.min(c1[2], c2[2])],
    max: [Math.max(c1[0], c2[0]), ab.max[1] - m.origin[1], Math.max(c1[2], c2[2])],
  };
  return { grid: g, bounds };
}

const TERRAINISH = /^(landscape|landscaping|garden|terrain|site|surroundings|vegetation|veg|props|scatter|ground|water|boundary)|terrain|landmass/i;

async function doRender(p: Project, a: { clean?: boolean; frame?: string[]; views?: string[]; components?: string[]; hide?: string[]; context?: "auto" | "world" | "none"; source?: "project" | "world"; width?: number; height?: number; separate?: boolean; region?: { min: number[]; max: number[] } }) {
  const m = p.meta();
  const views = a.views?.length ? a.views : ["overview", "front", "right", "top"];
  let grid: VoxelGrid, focus: Bounds | null, extra = "";
  let context: VoxelGrid | null = null;
  if (a.source === "world") {
    const w = await readWorldBuild(p);
    if (!w) throw new Error("this project has not been applied to the world yet");
    grid = w.grid;
    focus = w.bounds;
    extra = "Rendered from the live world.";
  } else {
    // interior views: hide landscaping (trees cover the dollhouse) unless the caller chose components
    let hide = a.hide;
    if (!a.components && !a.hide && views.every((v) => /^(cutaway_y=|eye:|room:|plan_y=)/.test(v))) {
      hide = m.components.map((c) => c.name).filter((n) => /^(landscape|landscaping|garden|terrain|site|surroundings)/i.test(n));
    }
    const r = p.compile({ only: a.components, skip: hide });
    grid = r.grid;
    focus = grid.bounds();
    if (!focus) throw new Error("nothing to render: the selected components produced no blocks");
    // frame the cameras on the architecture, not on scattered landscaping
    const frameOn: string[] | undefined = a.frame ?? [...r.perComponent.keys()].filter((n) => !TERRAINISH.test(n));
    if (frameOn && frameOn.length && frameOn.length < r.perComponent.size) {
      const fg = new VoxelGrid();
      for (const n of frameOn) {
        const g = r.perComponent.get(n);
        if (g) for (const [k, v] of g.cells) if (v !== 0) fg.cells.set(k, v);
      }
      const fb = fg.bounds();
      if (fb) focus = fb;
    }
    const ctxMode = a.context ?? "auto";
    if (ctxMode !== "none") {
      context = await worldContext(p, focus).catch(() => null);
      if (!context && ctxMode === "world") throw new Error("world context requested but the Minecraft bridge is unreachable");
    }
    extra = context ? "Terrain context from the world is shown around the build." : "No world context (ground grid: thin lines every block, thick every 5).";
    if (r.warnings.length) extra += `\nWarnings: ${r.warnings.slice(0, 8).join("; ")}`;
  }
  if (a.region) focus = { min: a.region.min as any, max: a.region.max as any };
  const per = views.length > 1 && !a.separate;
  const W = a.width ?? (per ? 768 : 1024), H = a.height ?? (per ? 576 : 768);
  const terr = p.terrain();
  const groundY = terr.height(Math.round((focus.min[0] + focus.max[0]) / 2), Math.round((focus.min[2] + focus.max[2]) / 2)) + 1;
  // void worlds (nothing below the build): no fake ground plane
  const isVoid = groundY < focus.min[1] - 40;
  const out = await renderGrid(grid, context, views, { front: m.front ?? "south", width: W, height: H, sheet: per ? (views.length <= 4 ? 2 : 3) : undefined, focus, groundY: isVoid ? focus.min[1] : groundY, ground: isVoid ? false : a.source === "world" ? "backdrop" : true, clean: a.clean });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const saved: string[] = [];
  out.images.forEach((img, i) => {
    const f = p.p("reviews", `${stamp}_${per ? "sheet" : views[i].replace(/[^\w=-]+/g, "_")}.png`);
    fs.writeFileSync(f, img);
    saved.push(f);
  });
  const content: Content[] = out.images.map((img) => ({ type: "image", data: img.toString("base64"), mimeType: "image/png" }));
  content.push({
    type: "text",
    text: `Views: ${out.views.map((v) => v.title).join(" | ")}\nBuild bounds (local): ${dims(focus)}. Front side: ${m.front ?? "south"} (+z = south, +x = east, y up).\n${extra}\nSaved: ${saved.map((s) => path.relative(PROJECTS_DIR, s)).join(", ")}`,
  });
  return { content };
}

// =====================================================================
// Knowledge
// =====================================================================

server.registerTool(
  "toolkit_reference",
  {
    title: "Toolkit reference",
    description: "Documentation for building: 'workflow' (staged process & team roles), 'api' (builder toolkit for component scripts), 'lib' (built-in detail library), 'craft' (architecture & Minecraft building craft: proportions, depth, palettes, roofs, landscaping), 'maps' (large maps, lobbies, minigame maps, terrain sculpting, vegetation scatter, symmetry), 'views' (render cameras). Read workflow+api before your first build.",
    inputSchema: { topic: z.enum(["workflow", "api", "lib", "craft", "maps", "views", "all"]).default("workflow") },
  },
  wrap(async ({ topic }: { topic: string }) => {
    const map: Record<string, string> = { workflow: "workflow.md", api: "api.md", lib: "lib.md", craft: "craft.md", maps: "maps.md" };
    if (topic === "views") return text(VIEW_HELP);
    if (topic === "all") return text(Object.values(map).map(doc).join("\n\n---\n\n") + "\n\n" + VIEW_HELP);
    return text(doc(map[topic]));
  }),
);

server.registerTool(
  "block_search",
  {
    title: "Find block names",
    description: "Search valid Minecraft block ids (this server's version) by substring(s), and show their properties. Use it to get exact names (e.g. 'stone_brick' → stone_bricks, stone_brick_stairs, stone_brick_slab, stone_brick_wall).",
    inputSchema: { query: z.string().describe("space-separated substrings, all must match"), properties: z.boolean().default(false), limit: z.number().default(60) },
  },
  wrap(async ({ query, properties, limit }: any) => {
    const db = assets();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = db.blockNames.filter((n) => terms.every((t: string) => n.includes(t))).sort((a, b) => a.length - b.length).slice(0, limit);
    if (!hits.length) return text(`No blocks match '${query}'.${db.suggest(terms[0] ?? "")}`);
    if (!properties) return text(hits.join(", "));
    return text(hits.map((h) => {
      const pv = db.propertyValues.get(h)!;
      return `${h}${pv.size ? " [" + [...pv].map(([k, v]) => `${k}=${[...v].join("|")}`).join("; ") + "]" : ""}`;
    }).join("\n"));
  }),
);

// =====================================================================
// Projects
// =====================================================================

server.registerTool(
  "list_projects",
  { title: "List projects", description: "List build projects with their location and component count.", inputSchema: {} },
  wrap(async () => {
    const names = Project.list();
    if (!names.length) return text("No projects yet. Create one with create_project.");
    return text(names.map((n) => {
      const m = new Project(n).meta();
      return `- ${n}: world=${m.world} origin=[${m.origin}] components=${m.components.length} ${m.style ? `style="${m.style}"` : ""}`;
    }).join("\n"));
  }),
);

server.registerTool(
  "create_project",
  {
    title: "Create build project",
    description: "Create a new build project. If no origin is given, a free plot is reserved in the flat 'build_flat' test world. For real terrain, pass world + origin (the local [0,0,0] corner; y = first block above ground) and call survey_site.",
    inputSchema: {
      name: z.string().describe("letters, digits, _ -"),
      brief: z.string().default("").describe("design brief: purpose, style, size, mood, references, constraints"),
      world: z.string().optional(),
      origin: z.array(z.number()).length(3).optional(),
      site_size: z.array(z.number()).length(2).optional().describe("[x, z] size of the reserved site in blocks (default 48×48; use e.g. [200,200] for lobbies/maps)"),
      front: z.enum(["south", "north", "east", "west"]).default("south").describe("which local side is the main facade/entrance"),
      style: z.string().optional(),
      palette: z.record(z.string(), z.any()).optional().describe("named materials, e.g. {wall:'stone_bricks', roof:'dark_oak', trim:'spruce_log'} or weighted mixes [['stone_bricks',5],['cracked_stone_bricks',1]]"),
      seed: z.number().optional(),
      template: z.string().optional().describe("copy components/lib/palette from examples/<template> (e.g. 'cottage') as a starting point"),
      world_type: z.enum(["flat", "void", "normal"]).optional().describe("create the world if it doesn't exist: void (empty sky — best for whole maps/lobbies/islands), flat or normal"),
    },
  },
  wrap(async (a: any) => {
    let world = a.world, origin = a.origin;
    const tdir = a.template ? path.resolve(import.meta.dirname, "../../examples", path.basename(a.template)) : null;
    if (tdir && !fs.existsSync(tdir)) throw new Error(`no example '${a.template}' (have: ${fs.readdirSync(path.resolve(import.meta.dirname, "../../examples")).join(", ")})`);
    const tmeta = tdir ? JSON.parse(fs.readFileSync(path.join(tdir, "project.json"), "utf8")) : null;
    if (!origin && !a.world_type) {
      world = world ?? "build_flat";
      const used = Project.list().map((n) => new Project(n).meta()).filter((m) => m.world === world).length;
      const slot = used;
      origin = [(slot % 8) * 160, -60, Math.floor(slot / 8) * 160];
      if (await bridge.available()) await bridge.call("/world", { name: world, type: "flat" });
    }
    world = world ?? "world";
    if (a.world_type && (await bridge.available())) await bridge.call("/world", { name: world, type: a.world_type });
    if (!origin) origin = [0, a.world_type === "void" ? 64 : 0, 0];
    const size = a.site_size ?? [48, 48];
    const m: ProjectMeta = {
      name: a.name, world, origin, rotation: 0, front: a.front, style: a.style, seed: a.seed ?? Math.floor(Math.random() * 1e6),
      site: { min: [0, 0], max: [size[0] - 1, size[1] - 1] }, palette: { ...(tmeta?.palette ?? {}), ...(a.palette ?? {}) },
      components: tmeta ? tmeta.components.map((c: any) => ({ ...c, owner: null })) : [],
    };
    const p = Project.create(m, a.brief);
    if (tdir) {
      for (const d of ["components", "lib", "schematics"]) if (fs.existsSync(path.join(tdir, d))) fs.cpSync(path.join(tdir, d), p.p(d), { recursive: true });
    }
    let survey = "";
    if (await bridge.available()) {
      try {
        const hm = await p.survey();
        const hs = hm.heights;
        survey = Math.max(...hs) < -100 ? "Void world: no terrain under the site (build your own landmass with lib.heightmap)." : `Terrain surveyed: height range ${Math.min(...hs)}..${Math.max(...hs)} (local y).`;
      } catch (e: any) {
        survey = `Survey failed: ${e.message}`;
      }
    } else survey = "Minecraft bridge offline: terrain unknown (assumed flat at y=-1).";
    return text(`Created project '${a.name}' in world '${world}' at origin [${origin}] (local [0,0,0]). Site: x 0..${size[0] - 1}, z 0..${size[1] - 1}. Front: ${a.front}.\n${survey}\nFolder: ${p.dir}\nNext: write components (start with a rough 'massing' component), render, iterate.`);
  }),
);

server.registerTool(
  "project_overview",
  {
    title: "Project overview",
    description: "Brief, palette, components (order, owner, status, size), tasks, recent team notes, checkpoints. Call this when joining a project.",
    inputSchema: { project: z.string(), compile: z.boolean().default(true) },
  },
  wrap(async ({ project, compile }: any) => {
    const p = proj(project);
    const m = p.meta();
    const out: string[] = [];
    out.push(`# ${m.name}  (world ${m.world}, origin [${m.origin}], front ${m.front ?? "south"}${m.style ? `, style: ${m.style}` : ""})`);
    out.push(`## Brief\n${fs.readFileSync(p.p("brief.md"), "utf8")}`);
    out.push(`## Palette\n${JSON.stringify(m.palette, null, 1)}`);
    let comp: CompileResult | null = null;
    if (compile) {
      try {
        comp = p.compile();
      } catch (e: any) {
        out.push(`## Compile error\n${e.message}`);
      }
    }
    out.push(`## Components (compile order)`);
    for (const c of m.components) {
      const g = comp?.perComponent.get(c.name);
      out.push(`- ${c.name}${c.enabled === false ? " [disabled]" : ""} owner=${c.owner ?? "-"} status=${c.status ?? "-"}${c.description ? ` — ${c.description}` : ""}${g ? ` | ${dims(g.bounds())}` : ""}`);
    }
    if (comp) out.push(`Composite: ${dims(comp.grid.bounds())}`);
    if (comp && Object.keys(comp.anchors).length) out.push("Anchors: " + Object.entries(comp.anchors).map(([k, v]) => `${k}=[${v}]`).join(", "));
    const tasks = await p.tasks((t) => t.slice());
    if (tasks.length) out.push("## Tasks\n" + tasks.map((t) => `#${t.id} [${t.status}] ${t.title}${t.component ? ` (${t.component})` : ""}${t.assignee ? ` @${t.assignee}` : ""}${t.notes ? ` — ${t.notes}` : ""}`).join("\n"));
    const notes = p.notes(15);
    if (notes.length) out.push("## Recent notes\n" + notes.map((n) => `${n.t.slice(11, 19)} ${n.author}: ${n.text}`).join("\n"));
    const cps = p.checkpoints().slice(-8);
    if (cps.length) out.push("## Checkpoints (latest last)\n" + cps.map((c) => `${c.id} (${c.author})`).join("\n"));
    const ab = p.appliedBounds();
    out.push(ab ? `In world: yes, world bounds ${JSON.stringify(ab)}` : "In world: not applied yet");
    return text(out.join("\n\n"));
  }),
);

server.registerTool(
  "update_project",
  {
    title: "Update project settings",
    description: "Change brief, palette entries (merged; set an entry to null to delete), style, front, origin/world (moves the build on next apply — remove_from_world first), rotation, site.",
    inputSchema: {
      project: z.string(),
      brief: z.string().optional(),
      palette: z.record(z.string(), z.any()).optional(),
      style: z.string().optional(),
      front: z.enum(["south", "north", "east", "west"]).optional(),
      origin: z.array(z.number()).length(3).optional(),
      world: z.string().optional(),
      rotation: z.number().optional(),
      site_size: z.array(z.number()).length(2).optional(),
    },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    if (a.brief) fs.writeFileSync(p.p("brief.md"), a.brief);
    await p.update((m) => {
      if (a.palette) for (const [k, v] of Object.entries(a.palette)) v === null ? delete m.palette[k] : (m.palette[k] = v as any);
      if (a.style !== undefined) m.style = a.style;
      if (a.front) m.front = a.front;
      if (a.origin) m.origin = a.origin;
      if (a.world) m.world = a.world;
      if (a.rotation !== undefined) m.rotation = a.rotation;
      if (a.site_size) m.site = { min: [0, 0], max: [a.site_size[0] - 1, a.site_size[1] - 1] };
    });
    return text("Updated.\n" + JSON.stringify(p.meta().palette, null, 1));
  }),
);

server.registerTool(
  "survey_site",
  {
    title: "Survey terrain",
    description: "Fetch the terrain heightmap around the project site from the world (used by terrain.height() in scripts) and summarise it. Optionally render the bare site.",
    inputSchema: { project: z.string(), margin: z.number().default(16), render: z.boolean().default(true) },
  },
  wrap(async ({ project, margin, render }: any) => {
    const p = proj(project);
    const hm = await p.survey(margin);
    const W = hm.max[0] - hm.min[0] + 1;
    const hs = hm.heights;
    const counts = new Map<string, number>();
    hm.surface.forEach((i) => counts.set(hm.palette[i], (counts.get(hm.palette[i]) ?? 0) + 1));
    const m = p.meta();
    const site = m.site!;
    // coarse height map (every 4 blocks)
    const rows: string[] = [];
    for (let z = hm.min[1]; z <= hm.max[1]; z += 4) {
      const r: string[] = [];
      for (let x = hm.min[0]; x <= hm.max[0]; x += 4) r.push(String(hs[(z - hm.min[1]) * W + (x - hm.min[0])]).padStart(4));
      rows.push(`${String(z).padStart(4)}:${r.join("")}`);
    }
    const t = `Terrain local heights (top solid block y; build on y+1) from x ${hm.min[0]}..${hm.max[0]}, z ${hm.min[1]}..${hm.max[1]}.
Range ${Math.min(...hs)}..${Math.max(...hs)}. Site rectangle x ${site.min[0]}..${site.max[0]}, z ${site.min[1]}..${site.max[1]}.
Surface: ${[...counts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => `${n.replace("minecraft:", "")} ${c}`).join(", ")}
Heights every 4 blocks (cols x from ${hm.min[0]} step 4):
${rows.join("\n")}`;
    if (!render) return text(t);
    const focus: Bounds = { min: [site.min[0], Math.min(...hs) - 2, site.min[1]], max: [site.max[0], Math.max(...hs) + 4, site.max[1]] };
    const ctx = await worldContext(p, focus, 12);
    if (!ctx) return text(t);
    const out = await renderGrid(new VoxelGrid(), ctx, ["overview", "top"], { front: m.front, width: 768, height: 576, sheet: 2, focus });
    return { content: [{ type: "image", data: out.images[0].toString("base64"), mimeType: "image/png" }, { type: "text", text: t }] };
  }),
);

// =====================================================================
// Components
// =====================================================================

async function afterWrite(p: Project, name: string, preview?: string[]) {
  let r: CompileResult;
  try {
    r = p.compile();
  } catch (e: any) {
    const other = !String(e.message).includes(`'${name}'`);
    return text(`Saved '${name}', but the project does not compile${other ? " because of ANOTHER component (yours may be fine)" : ""}:\n${e.message}`);
  }
  const summary = compileSummary(r);
  if (preview && preview.length) {
    const rr = await doRender(p, { views: preview, frame: TERRAINISH.test(name) ? undefined : [name] });
    rr.content.push({ type: "text", text: summary });
    return rr;
  }
  return text(summary);
}

function checkOwner(p: Project, name: string, agent?: string) {
  const c = p.meta().components.find((c) => c.name === name);
  if (c?.owner && agent && c.owner !== agent) throw new Error(`component '${name}' is claimed by ${c.owner}. Coordinate via notes/tasks, or ask them to release it.`);
}

server.registerTool(
  "write_component",
  {
    title: "Write component script",
    description: "Create or replace a component's JavaScript. The script runs with globals: b (Builder at project origin), lib, palette, params, rng, terrain, anchors, log, hash, noise. Returns compile stats; pass preview views to also get images. See toolkit_reference topic 'api'.",
    inputSchema: {
      project: z.string(),
      name: z.string(),
      code: z.string(),
      description: z.string().optional(),
      agent: z.string().optional().describe("your agent name (respects component claims)"),
      position: z.union([z.literal("end"), z.string()]).default("end").describe("'end' or 'before:<component>' / 'after:<component>' for new components"),
      params: z.record(z.string(), z.any()).optional(),
      preview: z.array(z.string()).optional().describe("views to render after compiling, e.g. ['overview','front']"),
    },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    checkOwner(p, a.name, a.agent);
    await p.update((m) => {
      let c = m.components.find((c) => c.name === a.name);
      if (!c) {
        c = { name: a.name, enabled: true, status: "draft" };
        const pos: string = a.position ?? "end";
        const mm = /^(before|after):(.+)$/.exec(pos);
        const idx = mm ? m.components.findIndex((x) => x.name === mm[2]) : -1;
        if (mm && idx >= 0) m.components.splice(mm[1] === "before" ? idx : idx + 1, 0, c);
        else m.components.push(c);
      }
      if (a.description) c.description = a.description;
      if (a.params) c.params = a.params;
    });
    fs.writeFileSync(p.componentFile(a.name), a.code);
    if (a.agent) p.postNote(a.agent, `wrote component ${a.name}`, ["edit"]);
    return afterWrite(p, a.name, a.preview);
  }),
);

server.registerTool(
  "edit_component",
  {
    title: "Edit component script",
    description: "Exact string replacement inside a component script (old must occur exactly once unless all=true). Faster than rewriting for targeted fixes.",
    inputSchema: { project: z.string(), name: z.string(), old: z.string(), new: z.string(), all: z.boolean().default(false), agent: z.string().optional(), preview: z.array(z.string()).optional() },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    checkOwner(p, a.name, a.agent);
    const code = p.readComponent(a.name);
    if (!code) throw new Error(`component '${a.name}' has no code`);
    const n = code.split(a.old).length - 1;
    if (n === 0) throw new Error("old text not found");
    if (n > 1 && !a.all) throw new Error(`old text occurs ${n} times; make it unique or set all=true`);
    fs.writeFileSync(p.componentFile(a.name), a.all ? code.split(a.old).join(a.new) : code.replace(a.old, a.new));
    return afterWrite(p, a.name, a.preview);
  }),
);

server.registerTool(
  "read_component",
  {
    title: "Read component script",
    description: "Return a component's code and settings (or the project lib file if lib=true).",
    inputSchema: { project: z.string(), name: z.string(), lib: z.boolean().default(false) },
  },
  wrap(async ({ project, name, lib }: any) => {
    const p = proj(project);
    if (lib) {
      const f = p.p("lib", path.basename(name).replace(/\.js$/, "") + ".js");
      return text(fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "(no such lib file)");
    }
    const c = p.meta().components.find((c) => c.name === name);
    return text(`// ${JSON.stringify(c ?? { name, note: "not registered" })}\n${p.readComponent(name) || "(empty)"}`);
  }),
);

server.registerTool(
  "write_library",
  {
    title: "Write shared library file",
    description: "Write project lib/<file>.js: shared helper functions for all components. Assign to module.exports (e.g. module.exports = { gothicWindow(f, x, y) {...} }); they become lib.gothicWindow in every component.",
    inputSchema: { project: z.string(), file: z.string(), code: z.string(), agent: z.string().optional() },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    const f = p.p("lib", path.basename(a.file).replace(/\.js$/, "") + ".js");
    fs.writeFileSync(f, a.code);
    if (a.agent) p.postNote(a.agent, `updated lib/${path.basename(f)}`, ["lib"]);
    try {
      const r = p.compile();
      return text(`Saved ${path.basename(f)}.\n${compileSummary(r)}`);
    } catch (e: any) {
      return text(`Saved, but compile failed: ${e.message}`);
    }
  }),
);

server.registerTool(
  "component_settings",
  {
    title: "Component settings / claims",
    description: "Change a component's order, enabled flag, status, params, offset, description; claim (owner=<agent>) or release (owner=''); or delete it.",
    inputSchema: {
      project: z.string(),
      name: z.string(),
      enabled: z.boolean().optional(),
      status: z.string().optional(),
      owner: z.string().optional(),
      description: z.string().optional(),
      params: z.record(z.string(), z.any()).optional(),
      offset: z.array(z.number()).length(3).optional(),
      move: z.string().optional().describe("'first', 'last', 'before:<name>', 'after:<name>'"),
      rename: z.string().optional(),
      delete: z.boolean().optional(),
      agent: z.string().optional(),
    },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    const msg = await p.update((m) => {
      const i = m.components.findIndex((c) => c.name === a.name);
      if (i < 0) throw new Error(`no component '${a.name}'`);
      const c = m.components[i];
      if (a.owner !== undefined) {
        if (a.owner && c.owner && c.owner !== a.owner && c.owner !== a.agent) throw new Error(`already claimed by ${c.owner}`);
        c.owner = a.owner || null;
      }
      if (a.delete) {
        m.components.splice(i, 1);
        const f = p.componentFile(a.name);
        if (fs.existsSync(f)) fs.renameSync(f, f + ".deleted");
        return `deleted ${a.name}`;
      }
      if (a.enabled !== undefined) c.enabled = a.enabled;
      if (a.status) c.status = a.status;
      if (a.description) c.description = a.description;
      if (a.params) c.params = { ...(c.params ?? {}), ...a.params };
      if (a.offset) c.offset = a.offset as any;
      if (a.rename) {
        fs.renameSync(p.componentFile(a.name), p.componentFile(a.rename));
        c.name = a.rename;
      }
      if (a.move) {
        m.components.splice(m.components.indexOf(c), 1);
        const mm = /^(before|after):(.+)$/.exec(a.move);
        if (a.move === "first") m.components.unshift(c);
        else if (mm) {
          const j = m.components.findIndex((x) => x.name === mm[2]);
          if (j < 0) throw new Error(`no component '${mm[2]}'`);
          m.components.splice(mm[1] === "before" ? j : j + 1, 0, c);
        } else m.components.push(c);
      }
      return `ok: ${JSON.stringify(c)}`;
    });
    if (a.agent && (a.owner !== undefined || a.status)) p.postNote(a.agent, `${a.name}: ${a.owner !== undefined ? (a.owner ? `claimed by ${a.owner}` : "released") : ""} ${a.status ? `status=${a.status}` : ""}`.trim(), ["claim"]);
    return text(msg + "\nOrder: " + p.meta().components.map((c) => c.name).join(" → "));
  }),
);

// =====================================================================
// Seeing
// =====================================================================

server.registerTool(
  "render",
  {
    title: "Render build images",
    description: `Render the build (compiled from the project, or read back from the live world) and return images. Multiple views are combined into one labelled contact sheet. Orthographic views carry block-coordinate rulers in project-local coordinates. ${VIEW_HELP}`,
    inputSchema: {
      project: z.string(),
      views: z.array(z.string()).optional().describe("default ['overview','front','right','top']"),
      components: z.array(z.string()).optional().describe("only render these components"),
      hide: z.array(z.string()).optional().describe("hide these components"),
      context: z.enum(["auto", "world", "none"]).default("auto").describe("show surrounding terrain from the world (auto = if server reachable)"),
      source: z.enum(["project", "world"]).default("project").describe("'world' renders what is actually placed in Minecraft"),
      region: z.object({ min: z.array(z.number()).length(3), max: z.array(z.number()).length(3) }).optional().describe("frame the cameras on this local box instead of the whole build"),
      frame: z.array(z.string()).optional().describe("frame cameras on these components (default: all except landscape/garden/site components)"),
      width: z.number().optional(),
      height: z.number().optional(),
      separate: z.boolean().default(false).describe("return one image per view instead of a contact sheet"),
      clean: z.boolean().default(false).describe("presentation shots: no labels, rulers or compass"),
    },
  },
  wrap(async (a: any) => doRender(proj(a.project), a)),
);

server.registerTool(
  "inspect",
  {
    title: "Inspect build as text",
    description: "Text analysis: 'stats' (dimensions per component, material breakdown), 'slice' (ASCII layer: axis y = floor plan, x/z = elevation cut), 'blocks' (list exact block states in a small box), 'interior' (min/max = a room's interior air box or a whole floor: light levels and dark spots, headroom, reachability from the door, furniture density).",
    inputSchema: {
      project: z.string(),
      kind: z.enum(["stats", "slice", "blocks", "interior"]).default("stats"),
      entry: z.array(z.number()).length(3).optional().describe("interior: a walkable cell just inside the door to test reachability from"),
      axis: z.enum(["x", "y", "z"]).default("y"),
      at: z.number().optional().describe("coordinate of the slice"),
      min: z.array(z.number()).length(3).optional(),
      max: z.array(z.number()).length(3).optional(),
      components: z.array(z.string()).optional(),
    },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    const r = p.compile({ only: a.components });
    if (a.kind === "stats") return text(compileSummary(r));
    const region = a.min && a.max ? { min: a.min, max: a.max } : undefined;
    if (a.kind === "interior") {
      if (!region) throw new Error("interior needs min and max (the room's interior air volume)");
      return text(analyzeInterior(r.grid, region as any, a.entry));
    }
    if (a.kind === "slice") {
      const b = r.grid.bounds();
      const at = a.at ?? (b ? (a.axis === "y" ? b.min[1] + 1 : a.axis === "x" ? Math.floor((b.min[0] + b.max[0]) / 2) : Math.floor((b.min[2] + b.max[2]) / 2)) : 0);
      return text(slice(r.grid, a.axis, at, region as any));
    }
    if (!region) throw new Error("blocks needs min and max");
    const vol = (region.max[0] - region.min[0] + 1) * (region.max[1] - region.min[1] + 1) * (region.max[2] - region.min[2] + 1);
    if (vol > 2000) throw new Error("box too large for 'blocks' (max 2000 cells); use slice");
    const out: string[] = [];
    for (let y = region.min[1]; y <= region.max[1]; y++)
      for (let z = region.min[2]; z <= region.max[2]; z++)
        for (let x = region.min[0]; x <= region.max[0]; x++) {
          const s = r.grid.get(x, y, z);
          if (s !== undefined) out.push(`[${x},${y},${z}] ${s}`);
        }
    return text(out.join("\n") || "(no blocks set in this box)");
  }),
);

// =====================================================================
// Quality assurance: automatic checks + player-perspective walkthrough
// =====================================================================

/** World terrain under the project (from survey_site); void worlds have none. */
function qaGround(p: Project) {
  const t = p.terrain();
  return (x: number, z: number) => {
    const h = t.height(x, z);
    return h < -100 ? null : h;
  };
}

function qaSetup(p: Project, a: { components?: string[]; margin?: number; region?: { min: number[]; max: number[] } }) {
  const r = p.compile();
  const names = a.components?.length ? a.components : [...r.perComponent.keys()].filter((n) => !TERRAINISH.test(n));
  const focusGrid = new VoxelGrid();
  for (const n of names) {
    const g = r.perComponent.get(n);
    if (!g) throw new Error(`no component '${n}' (have: ${[...r.perComponent.keys()].join(", ")})`);
    for (const [k, v] of g.cells) if (v !== 0) focusGrid.cells.set(k, v);
  }
  if (a.region) {
    // restrict the focus to the region
    const R = a.region;
    for (const k of [...focusGrid.cells.keys()]) {
      const [x, y, z] = unkey(k);
      if (x < R.min[0] || x > R.max[0] || y < R.min[1] || y > R.max[1] || z < R.min[2] || z > R.max[2]) focusGrid.cells.delete(k);
    }
  }
  let fb = focusGrid.bounds() ?? r.grid.bounds();
  if (!fb) throw new Error("nothing to check");
  const m = a.margin ?? 6;
  const box: Bounds = { min: [fb.min[0] - m, fb.min[1] - 3, fb.min[2] - m], max: [fb.max[0] + m, fb.max[1] + 3, fb.max[2] + m] };
  return { r, names, focusGrid, focus: fb, box };
}

server.registerTool(
  "qa",
  {
    title: "Quality check (build lint)",
    description: `Automatic checks a player would notice: roofed areas you can't walk into (no door / blocked / step too high), sealed rooms, glass or panes not held by a wall, blocked doors or doors without an upper half/floor, torches/lanterns/signs attached to nothing, stray floating blocks. Checks the building components (terrain-like components are context only) or the ones you pass. Returns coordinates with a 'detail:' view for each; look=true also renders close-ups of the first problems. Run it after every build stage and fix all errors before calling a build done.`,
    inputSchema: {
      project: z.string(),
      components: z.array(z.string()).optional().describe("components to check (default: all non-terrain components)"),
      region: z.object({ min: z.array(z.number()).length(3), max: z.array(z.number()).length(3) }).optional(),
      look: z.boolean().default(true).describe("render close-ups of the first problems"),
    },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    const { r, focusGrid, box } = qaSetup(p, a);
    const res = runQA(r.grid, box, focusGrid, qaGround(p));
    const txt = formatFindings(res);
    const bad = res.findings.filter((f) => f.severity !== "info").slice(0, 6);
    if (!a.look || !bad.length) return text(txt);
    const views = bad.map((f) => `detail:${f.pos.join(",")},4`);
    const out = await renderGrid(r.grid, null, views, { width: 640, height: 420, sheet: views.length > 1 ? 3 : undefined, focus: box, ground: false });
    return { content: [...out.images.map((img) => ({ type: "image" as const, data: img.toString("base64"), mimeType: "image/png" })), { type: "text" as const, text: `${txt}\nClose-ups (in order): ${bad.map((f, i) => `${i + 1}. ${f.kind} [${f.pos}]`).join(" | ")}` }] };
  }),
);

server.registerTool(
  "walkthrough",
  {
    title: "Player-perspective walkthrough",
    description: `See the build as a player does: auto-placed eye-level views approaching from all four sides, at each door from outside and when entering, inside each room (corner view), and optionally a 360° look-around from a spot (e.g. spawn: from=[x,y,z] = the block the player stands in). Use it to judge what looks odd, what is in the way, what can't be reached and how spaces feel — overhead renders hide these problems. Returns a contact sheet plus the camera list (re-render any of them bigger with render views:[...]).`,
    inputSchema: {
      project: z.string(),
      components: z.array(z.string()).optional().describe("which buildings to walk around (default: all non-terrain components)"),
      from: z.array(z.number()).length(3).optional().describe("look around from this standing position (4 directions)"),
      region: z.object({ min: z.array(z.number()).length(3), max: z.array(z.number()).length(3) }).optional().describe("only walk around what is inside this box (e.g. one island of a map)"),
      max: z.number().default(12),
    },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    const { r, focusGrid, focus, box } = qaSetup(p, a);
    const res = runQA(r.grid, box, focusGrid, qaGround(p));
    const { views, labels } = walkthroughViews(r.grid, focus, res, { from: a.from, max: a.max, groundAt: qaGround(p) });
    const m = p.meta();
    let context: VoxelGrid | null = null;
    try {
      context = await worldContext(p, focus);
    } catch {}
    const isVoid = p.terrain().height(Math.round((focus.min[0] + focus.max[0]) / 2), Math.round((focus.min[2] + focus.max[2]) / 2)) < -100;
    const out = await renderGrid(r.grid, context, views, { front: m.front ?? "south", width: 640, height: 420, sheet: 3, focus, ground: isVoid ? false : context ? true : "backdrop", groundY: isVoid ? undefined : p.terrain().height(Math.round(focus.min[0]), Math.round(focus.min[2])) + 1 });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const f = p.p("reviews", `${stamp}_walkthrough.png`);
    fs.writeFileSync(f, out.images[0]);
    const e = res.findings.filter((x) => x.severity === "error").length;
    return {
      content: [
        { type: "image", data: out.images[0].toString("base64"), mimeType: "image/png" },
        { type: "text", text: `Walkthrough (left→right, top→bottom):\n${labels.map((l, i) => `${i + 1}. ${l}  [${views[i]}]`).join("\n")}\nQA errors right now: ${e}${e ? " — run qa for details" : ""}.\nJudge each view like a player: can I get in? Does anything look odd, floating, blocked, too dark, too empty or cramped? Then fix and walk through again.\nSaved: ${path.relative(PROJECTS_DIR, f)}` },
      ],
    };
  }),
);

// =====================================================================
// World
// =====================================================================

server.registerTool(
  "apply",
  {
    title: "Build it in Minecraft",
    description: "Compile and place the build in the world. Only changed blocks are written; blocks the build no longer uses are restored to the original terrain. Creates a checkpoint (sources snapshot) you can restore.",
    inputSchema: { project: z.string(), label: z.string().default("apply"), agent: z.string().optional() },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    const r = p.compile();
    const t0 = Date.now();
    const res = await p.apply(r, a.label, a.agent ?? "agent");
    if (a.agent) p.postNote(a.agent, `applied to world (${a.label}): ${res.written} writes`, ["apply"]);
    const m = p.meta();
    return text(`Applied in ${Date.now() - t0} ms: ${res.written} positions written (${res.changed} actually changed, ${res.restored} restored to terrain). Checkpoint: ${res.checkpoint}\nWorld '${m.world}', origin [${m.origin}]. ${r.warnings.length ? "Warnings: " + r.warnings.slice(0, 8).join("; ") : ""}`);
  }),
);

server.registerTool(
  "checkpoints",
  {
    title: "Checkpoints / undo",
    description: "List checkpoints, or restore one (component sources + project settings), optionally re-applying it to the world. A safety checkpoint is created before restoring.",
    inputSchema: { project: z.string(), restore: z.string().optional(), apply: z.boolean().default(true) },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    if (!a.restore) return text(p.checkpoints().map((c) => `${c.id}  by ${c.author}`).join("\n") || "no checkpoints");
    p.restoreCheckpoint(a.restore);
    let msg = `Restored sources from ${a.restore}.`;
    if (a.apply && p.appliedBounds()) {
      const res = await p.apply(p.compile(), "restore-" + a.restore.slice(0, 20));
      msg += ` Re-applied: ${res.written} writes.`;
    }
    return text(msg);
  }),
);

server.registerTool(
  "remove_from_world",
  { title: "Remove build from world", description: "Restore the original terrain everywhere this project placed blocks. Sources are kept.", inputSchema: { project: z.string() } },
  wrap(async ({ project }: any) => {
    const n = await proj(project).removeFromWorld();
    return text(`Restored ${n} positions.`);
  }),
);

server.registerTool(
  "export_schematic",
  {
    title: "Export .schem",
    description: "Export the compiled build (or selected components) as a Sponge v3 .schem file (WorldEdit/FAWE compatible) into the project's exports folder.",
    inputSchema: { project: z.string(), components: z.array(z.string()).optional(), file: z.string().optional() },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    const r = p.compile({ only: a.components });
    let dv = 4903;
    try {
      dv = (await bridge.call("/status", {}, 2000)).dataVersion;
    } catch {}
    const solid = new VoxelGrid();
    for (const [x, y, z, id] of r.grid.entries()) if (id !== 0) solid.setId(x, y, z, id);
    const buf = writeSchematic(solid, dv);
    const f = p.p("exports", (a.file ?? `${p.name}-${new Date().toISOString().slice(0, 10)}`).replace(/\.schem$/, "") + ".schem");
    fs.writeFileSync(f, buf);
    return text(`Wrote ${f} (${buf.length} bytes, ${dims(solid.bounds())}, DataVersion ${dv}). Paste with //schem load + //paste (origin = min corner).`);
  }),
);

server.registerTool(
  "import_schematic",
  {
    title: "Import .schem",
    description: "Copy a Sponge .schem into the project and (optionally) create a component that pastes it, e.g. to study a reference build or reuse a detail.",
    inputSchema: { project: z.string(), file: z.string().describe("absolute path to the .schem"), component: z.string().optional(), at: z.array(z.number()).length(3).default([0, 0, 0]) },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    const buf = fs.readFileSync(a.file);
    const g = readSchematic(buf);
    const name = path.basename(a.file);
    fs.copyFileSync(a.file, p.p("schematics", name));
    let msg = `Imported ${name}: ${dims(g.bounds())}.`;
    if (a.component) {
      await p.update((m) => {
        if (!m.components.find((c) => c.name === a.component)) m.components.push({ name: a.component, enabled: true, status: "imported" });
      });
      fs.writeFileSync(p.componentFile(a.component), `b.paste(${JSON.stringify(name)}, [${a.at}]);\n`);
      msg += ` Component '${a.component}' pastes it at [${a.at}].`;
    }
    return text(msg);
  }),
);

server.registerTool(
  "server",
  {
    title: "Minecraft server",
    description: "status: server version, worlds, online players. start: launch the local Paper test server (installed by setup) if it is not running. stop: stop it. command: run a console command (e.g. 'time set day'). teleport: move an online player to look at a project (for humans watching).",
    inputSchema: {
      action: z.enum(["status", "start", "stop", "command", "teleport"]).default("status"),
      command: z.string().optional(),
      player: z.string().optional(),
      project: z.string().optional(),
    },
  },
  wrap(async (a: any) => {
    if (a.action === "status") return text(JSON.stringify(await bridge.call("/status"), null, 1));
    if (a.action === "start") {
      if (await bridge.available()) return text("Server already running.");
      const root = path.resolve(import.meta.dirname, "../../runtime");
      const jdk = fs.existsSync(root) ? fs.readdirSync(root).find((d) => d.startsWith("jdk")) : undefined;
      if (!jdk || !fs.existsSync(path.join(root, "server", "paper.jar"))) throw new Error("No local server installed. Run: node scripts/setup.mjs --accept-eula");
      const java = path.join(root, jdk, "bin", process.platform === "win32" ? "java.exe" : "java");
      const log = fs.openSync(path.join(root, "server.log"), "a");
      const child = spawn(java, ["-Xms2G", "-Xmx8G", "-jar", "paper.jar", "--nogui"], { cwd: path.join(root, "server"), detached: true, stdio: ["ignore", log, log], windowsHide: true });
      child.unref();
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (await bridge.available()) return text(`Server started (pid ${child.pid}) in ${i + 1}s. Log: runtime/server.log`);
      }
      throw new Error("Server did not come up within 90 s — see runtime/server.log");
    }
    if (a.action === "stop") {
      await bridge.call("/command", { command: "stop" }).catch(() => {});
      return text("Stop requested.");
    }
    if (a.action === "command") {
      if (!a.command) throw new Error("command required");
      const r = await bridge.call("/command", { command: a.command.replace(/^\//, "") });
      return text(JSON.stringify(r));
    }
    const p = proj(a.project);
    const m = p.meta();
    const ab = p.appliedBounds();
    const c = ab ? [(ab.min[0] + ab.max[0]) / 2, ab.max[1], (ab.min[2] + ab.max[2]) / 2] : [m.origin[0] + 20, m.origin[1] + 10, m.origin[2] + 20];
    const pos = [c[0] + 18, c[1] + 6, c[2] + 26];
    const yaw = (Math.atan2(-(c[0] - pos[0]), c[2] - pos[2]) * 180) / Math.PI;
    await bridge.call("/player", { name: a.player, world: m.world, pos, yaw, pitch: 20, gamemode: "creative" });
    return text(`Teleported ${a.player} to look at ${p.name}.`);
  }),
);

// =====================================================================
// Reference worlds (study existing builds from saves)
// =====================================================================

const refCache = new Map<string, { grid: VoxelGrid; key: string }>();
function refDims(save: string) {
  if (!fs.existsSync(save)) throw new Error(`save folder not found: ${save}`);
  return listDimensions(save);
}

server.registerTool(
  "reference",
  {
    title: "Study a reference world",
    description: `Study builds in any Minecraft save folder (e.g. a downloaded map) without a server.
list: dimensions with block counts and extents (and a coarse height map of where builds are).
render: render a box of a dimension with the normal views (${"overview, top, front..., plan_y=, section_x=, detail:, cam:"}); coordinates are the save's WORLD coordinates.
slice: ASCII layer of a box. stats: material breakdown of a box (great for learning palettes).
Use it to learn proportions, palettes, detailing and interiors from expert builds. Never copy builds wholesale; extract principles.`,
    inputSchema: {
      save: z.string().describe("absolute path to the world save folder"),
      action: z.enum(["list", "render", "slice", "stats"]).default("list"),
      dimension: z.string().optional().describe("dimension id from list (default: largest)"),
      min: z.array(z.number()).length(3).optional(),
      max: z.array(z.number()).length(3).optional(),
      views: z.array(z.string()).optional(),
      axis: z.enum(["x", "y", "z"]).default("y"),
      at: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    },
  },
  wrap(async (a: any) => {
    const dims = refDims(a.save);
    if (a.action === "list") {
      const out: string[] = [];
      for (const d of dims.slice(0, 40)) {
        const cd = chunkDensity(d);
        if (!cd.length) continue;
        const xs = cd.map((c) => c.cx), zs = cd.map((c) => c.cz);
        const tot = cd.reduce((s, c) => s + c.n, 0);
        out.push(`- ${d.id}: ${tot} blocks, x ${Math.min(...xs) * 16}..${Math.max(...xs) * 16 + 15}, z ${Math.min(...zs) * 16}..${Math.max(...zs) * 16 + 15}, top y ${Math.max(...cd.map((c) => c.top))}`);
      }
      return text(out.join(NL) || "no blocks found");
    }
    const dim = a.dimension ? dims.find((d) => d.id === a.dimension || d.id.endsWith(a.dimension)) : dims[0];
    if (!dim) throw new Error(`dimension not found; available: ${dims.map((d) => d.id).join(", ")}`);
    if (!a.min || !a.max) throw new Error("min and max (world coordinates) are required; use action list to find extents");
    const k = `${dim.dir}|${a.min}|${a.max}`;
    let grid = refCache.get(dim.dir)?.key === k ? refCache.get(dim.dir)!.grid : null;
    if (!grid) {
      grid = loadBlocks(dim, { min: a.min, max: a.max });
      refCache.clear();
      refCache.set(dim.dir, { grid, key: k });
    }
    const box: Bounds = { min: a.min, max: a.max };
    if (a.action === "stats") return text(`${dims.length} dims; box ${dims_(box)}${NL}` + stats(grid, new Map()));
    if (a.action === "slice") {
      const at = a.at ?? Math.floor((a.min[a.axis === "x" ? 0 : a.axis === "y" ? 1 : 2] + a.max[a.axis === "x" ? 0 : a.axis === "y" ? 1 : 2]) / 2);
      return text(slice(grid, a.axis, at, box));
    }
    const views = a.views?.length ? a.views : ["overview", "top"];
    const per = views.length > 1;
    const focus = grid.bounds() ?? box;
    const out = await renderGrid(grid, null, views, { width: a.width ?? (per ? 768 : 1280), height: a.height ?? (per ? 576 : 960), sheet: per ? (views.length <= 4 ? 2 : 3) : undefined, focus, ground: false });
    const content: Content[] = out.images.map((img) => ({ type: "image", data: img.toString("base64"), mimeType: "image/png" }));
    content.push({ type: "text", text: `Views: ${out.views.map((v) => v.title).join(" | ")}${NL}Blocks in box: ${grid.size}, occupied bounds ${dims_(focus)} (world coords).` });
    return { content };
  }),
);

// =====================================================================
// Team coordination
// =====================================================================

server.registerTool(
  "tasks",
  {
    title: "Team task board",
    description: "Shared task board for a build team. list | add {title, component?, role?, notes?} | update {id, status?, assignee?, notes?} | claim {id, agent}.",
    inputSchema: {
      project: z.string(),
      action: z.enum(["list", "add", "update", "claim"]).default("list"),
      id: z.number().optional(),
      title: z.string().optional(),
      component: z.string().optional(),
      role: z.string().optional(),
      status: z.enum(["open", "in_progress", "review", "done"]).optional(),
      assignee: z.string().optional(),
      notes: z.string().optional(),
      agent: z.string().optional(),
    },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    const r = await p.tasks((t) => {
      if (a.action === "add") {
        if (!a.title) throw new Error("title required");
        const id = (t.reduce((mx, x) => Math.max(mx, x.id), 0) || 0) + 1;
        t.push({ id, title: a.title, component: a.component, role: a.role, status: "open", assignee: a.assignee ?? null, notes: a.notes });
        return `added #${id}`;
      }
      if (a.action === "update" || a.action === "claim") {
        const x = t.find((x) => x.id === a.id);
        if (!x) throw new Error(`no task #${a.id}`);
        if (a.action === "claim") {
          if (x.assignee && x.assignee !== a.agent) throw new Error(`task #${a.id} is assigned to ${x.assignee}`);
          x.assignee = a.agent;
          x.status = "in_progress";
        }
        if (a.status) x.status = a.status;
        if (a.assignee !== undefined) x.assignee = a.assignee;
        if (a.notes) x.notes = (x.notes ? x.notes + " | " : "") + a.notes;
        return `updated #${x.id}`;
      }
      return "";
    });
    const all = await p.tasks((t) => t.slice());
    return text((r ? r + "\n" : "") + (all.map((t) => `#${t.id} [${t.status}] ${t.title}${t.role ? ` <${t.role}>` : ""}${t.component ? ` (${t.component})` : ""}${t.assignee ? ` @${t.assignee}` : ""}${t.notes ? ` — ${t.notes}` : ""}`).join("\n") || "no tasks"));
  }),
);

server.registerTool(
  "notes",
  {
    title: "Team notes",
    description: "Shared message board: post design decisions, critiques, hand-offs; read what teammates said.",
    inputSchema: { project: z.string(), action: z.enum(["read", "post"]).default("read"), text: z.string().optional(), agent: z.string().optional(), limit: z.number().default(30) },
  },
  wrap(async (a: any) => {
    const p = proj(a.project);
    if (a.action === "post") {
      if (!a.text) throw new Error("text required");
      p.postNote(a.agent ?? "agent", a.text);
    }
    return text(p.notes(a.limit).map((n) => `${n.t.slice(5, 16).replace("T", " ")} ${n.author}: ${n.text}`).join("\n") || "no notes");
  }),
);

// =====================================================================
// Prompts (roles) & resources
// =====================================================================

const ROLES = JSON.parse(doc("roles.json")) as Record<string, { title: string; prompt: string }>;
for (const [id, r] of Object.entries(ROLES)) {
  server.registerPrompt(
    id,
    { title: r.title, description: r.title, argsSchema: { project: z.string().optional(), task: z.string().optional() } },
    ({ project, task }: any) => ({
      messages: [{ role: "user", content: { type: "text", text: `${r.prompt}\n\n${project ? `Project: ${project}\n` : ""}${task ? `Task: ${task}` : ""}` } }],
    }),
  );
}
for (const f of ["workflow.md", "api.md", "lib.md", "craft.md", "maps.md"]) {
  server.registerResource(f, `buildstudio://docs/${f}`, { title: f, mimeType: "text/markdown" }, async (uri) => ({ contents: [{ uri: uri.href, text: doc(f) }] }));
}

process.on("SIGINT", async () => {
  await renderService.close();
  process.exit(0);
});
process.stdin.on("close", async () => {
  await renderService.close();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
void PALETTE;
void unkey;
