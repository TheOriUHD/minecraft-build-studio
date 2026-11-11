// Headless WebGL renderer (three.js in Chrome via puppeteer) producing review images of builds.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { AddressInfo } from "node:net";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { mesh, MeshOut } from "./mesher.ts";
import { VoxelGrid, Bounds } from "../voxel.ts";

const THREE_DIR = path.resolve(import.meta.dirname, "../../node_modules/three/build");
const PAGE = path.resolve(import.meta.dirname, "page.html");

function findChrome(): string {
  const env = process.env.BUILDMCP_CHROME;
  if (env && fs.existsSync(env)) return env;
  const cands = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const f = cands.find((c) => fs.existsSync(c));
  if (!f) throw new Error("No Chrome/Edge found for rendering; set BUILDMCP_CHROME to a Chromium executable");
  return f;
}

export interface View {
  name: string;
  title: string;
  kind: "ortho" | "persp";
  eye: number[];
  target: number[];
  up?: number[];
  fov?: number;
  halfHeight?: number;
  width: number;
  height: number;
  clip?: { normal: number[]; constant: number }[];
  rulers?: { u: Ruler; v: Ruler };
  compass?: boolean;
  clean?: boolean; // no labels/rulers/compass (presentation shots)
}
interface Ruler {
  name: string;
  axisIndex: number;
  from: number;
  to: number;
  fixed: number[];
}

class RenderService {
  private server?: http.Server;
  private port = 0;
  private browser?: Browser;
  private page?: Page;
  private scenes = new Map<string, { bin: Buffer; json: string; png: Buffer }>();
  private queue: Promise<any> = Promise.resolve();

  private async ensure() {
    if (!this.server) {
      this.server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        try {
          if (u === "/" || u === "/page.html") return send(res, fs.readFileSync(PAGE), "text/html");
          if (u === "/favicon.ico") return res.writeHead(204).end();
          if (u.startsWith("/three/")) {
            const f = path.join(THREE_DIR, path.basename(u));
            return send(res, fs.readFileSync(f), "text/javascript");
          }
          const m = /^\/mesh\/([\w-]+)\.(bin|json|png)$/.exec(u);
          if (m) {
            const s = this.scenes.get(m[1]);
            if (!s) return res.writeHead(404).end();
            if (m[2] === "bin") return send(res, s.bin, "application/octet-stream");
            if (m[2] === "json") return send(res, Buffer.from(s.json), "application/json");
            return send(res, s.png, "image/png");
          }
          res.writeHead(404).end();
        } catch (e) {
          res.writeHead(500).end(String(e));
        }
      });
      await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", () => r()));
      this.port = (this.server.address() as AddressInfo).port;
    }
    if (!this.browser || !this.browser.connected) {
      this.browser = await puppeteer.launch({
        executablePath: findChrome(),
        headless: true,
        args: ["--use-angle=default", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-background-timer-throttling", "--no-first-run", "--no-default-browser-check"],
      });
      this.page = undefined;
    }
    if (!this.page || this.page.isClosed()) {
      this.page = await this.browser.newPage();
      this.page.on("console", (m) => {
        if (m.type() === "error") process.stderr.write(`[render page] ${m.text()}\n`);
      });
      await this.page.goto(`http://127.0.0.1:${this.port}/page.html`);
      await this.page.waitForFunction("window.ready === true", { timeout: 30000 });
    }
    return this.page;
  }

  render(cells: Iterable<[number, number, number, number]>, get: (x: number, y: number, z: number) => number | undefined, bounds: Bounds, views: View[], opts: { sheet?: number; ground?: { y: number; grid: boolean } | null }): Promise<{ images: Buffer[]; tris: number }> {
    const job = this.queue.then(async () => {
      const page = await this.ensure();
      const m = mesh(cells, get);
      const id = "s" + Date.now().toString(36);
      this.scenes.clear();
      this.scenes.set(id, { bin: pack(m), json: JSON.stringify({ bounds, ground: opts.ground ?? null }), png: m.atlas });
      const info: any = await page.evaluate(`window.loadScene(${JSON.stringify(id)})`);
      const urls: string[] = (await page.evaluate(`window.renderViews(${JSON.stringify(views)}, ${opts.sheet ? JSON.stringify({ cols: opts.sheet }) : "null"})`)) as any;
      this.scenes.delete(id);
      return { images: urls.map((u) => Buffer.from(u.split(",")[1], "base64")), tris: info.tris };
    });
    this.queue = job.catch(() => {});
    return job;
  }

  async close() {
    await this.browser?.close().catch(() => {});
    this.server?.close();
  }
}

function send(res: http.ServerResponse, body: Buffer, type: string) {
  res.writeHead(200, { "Content-Type": type, "Content-Length": body.length });
  res.end(body);
}

function pack(m: MeshOut): Buffer {
  const buckets = [m.opaque, m.cutout, m.translucent];
  const header = new Uint32Array(12);
  let total = 48;
  buckets.forEach((b, k) => {
    header[k * 4] = b.pos.length;
    header[k * 4 + 1] = b.uv.length;
    header[k * 4 + 2] = b.col.length;
    header[k * 4 + 3] = b.idx.length;
    total += (b.pos.length + b.uv.length + b.col.length + b.idx.length) * 4;
  });
  const buf = Buffer.alloc(total);
  Buffer.from(header.buffer).copy(buf, 0);
  let off = 48;
  for (const b of buckets) {
    for (const arr of [new Float32Array(b.pos), new Float32Array(b.uv), new Float32Array(b.col)]) {
      Buffer.from(arr.buffer).copy(buf, off);
      off += arr.byteLength;
    }
    const idx = new Uint32Array(b.idx);
    Buffer.from(idx.buffer).copy(buf, off);
    off += idx.byteLength;
  }
  return buf;
}

export const renderService = new RenderService();

// ---------------- camera presets ----------------

export type ViewName = string;

export const VIEW_HELP = `Views: front, back, left, right (orthographic elevations with block rulers), top (plan),
iso_ne / iso_nw / iso_se / iso_sw (3/4 perspective from that corner), overview (= front-right 3/4),
street (eye-level perspective in front of the main facade), plan_y=<y> (floor plan: everything above y cut away),
section_x=<x> / section_z=<z> (vertical cut looking at the cut face), detail:<x>,<y>,<z>[,<radius>] (close-up), cutaway_y=<y>[,ne|nw|se|sw] (dollhouse 3/4 view with everything above y removed — use for interiors),
eye:<x>,<y>,<z>,<yaw>[,<pitch>[,<fov>]] (first-person view standing in block x,y,z, Minecraft yaw: 0=south,90=west,180=north,-90=east; default fov 75),
room:<x0>,<y0>,<z0>,<x1>,<y1>,<z1>[,ne|nw|se|sw] (wide view of a whole room from a corner — pass the room's interior air box; best interior check),
cam:<ex>,<ey>,<ez>,<tx>,<ty>,<tz>[,<fov>] (custom perspective camera).`;

const SIDES: Record<string, { dir: [number, number, number]; right: [number, number, number] }> = {
  // dir = direction from target to camera; right = screen-right direction in world
  south: { dir: [0, 0, 1], right: [1, 0, 0] },
  north: { dir: [0, 0, -1], right: [-1, 0, 0] },
  east: { dir: [1, 0, 0], right: [0, 0, -1] },
  west: { dir: [-1, 0, 0], right: [0, 0, 1] },
};
const ORDER = ["south", "west", "north", "east"]; // clockwise from front when looking down
const sideFrom = (front: string, turn: number) => ORDER[(ORDER.indexOf(front) + turn + 4) % 4];

export function makeViews(names: string[], b: Bounds, opts: { front?: string; width?: number; height?: number; groundY?: number }): View[] {
  const W = opts.width ?? 960, H = opts.height ?? 720;
  const front = opts.front ?? "south";
  const min = b.min, max = [b.max[0] + 1, b.max[1] + 1, b.max[2] + 1];
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const R = Math.hypot(...size) / 2 + 1;
  const aspect = W / H;
  const views: View[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const sideMap: Record<string, string> = { front, back: sideFrom(front, 2), left: sideFrom(front, 1), right: sideFrom(front, -1) };
    if (sideMap[name] || SIDES[name]) {
      const side = sideMap[name] ?? name;
      const s = SIDES[side];
      const horiz = Math.abs(s.right[0]) > 0 ? size[0] : size[2];
      const hh = Math.max(size[1] / 2, horiz / 2 / aspect) * 1.12 + 1;
      const eye = [c[0] + s.dir[0] * (R + 50), c[1], c[2] + s.dir[2] * (R + 50)];
      const uAxis = Math.abs(s.right[0]) > 0 ? 0 : 2;
      const fixedU = [0, min[1] - 0.001, 0];
      fixedU[2 - uAxis] = s.dir[2 - uAxis] > 0 || s.dir[2 - uAxis] === 0 ? max[2 - uAxis] : min[2 - uAxis];
      const lo = uAxis === 0 ? min[0] : min[2], hi = uAxis === 0 ? max[0] - 1 : max[2] - 1;
      views.push({
        name, title: `${name} (${side} elevation, looking ${opp(side)})`, kind: "ortho", eye, target: c, halfHeight: hh, width: W, height: H,
        rulers: {
          u: { name: uAxis === 0 ? "x" : "z", axisIndex: uAxis, from: lo, to: hi, fixed: fixedU },
          v: { name: "y", axisIndex: 1, from: min[1], to: max[1] - 1, fixed: s.right[uAxis] > 0 ? (() => { const f = [...fixedU]; f[uAxis] = lo - 0.0; return f; })() : (() => { const f = [...fixedU]; f[uAxis] = hi + 1; return f; })() },
        },
      });
      continue;
    }
    if (name === "top" || name.startsWith("plan_y=")) {
      const cut = name.startsWith("plan_y=") ? parseFloat(name.slice(7)) : null;
      const hh = Math.max(size[2] / 2, size[0] / 2 / aspect) * 1.12 + 1;
      const top = cut !== null ? cut + 1 : max[1];
      views.push({
        name, title: cut !== null ? `floor plan at y=${cut} (looking down, north up)` : "top (plan, north up)", kind: "ortho",
        eye: [c[0], top + 200, c[2]], target: [c[0], min[1], c[2]], up: [0, 0, -1], halfHeight: hh, width: W, height: H,
        clip: cut !== null ? [{ normal: [0, -1, 0], constant: cut + 1 }] : undefined,
        rulers: { u: { name: "x", axisIndex: 0, from: min[0], to: max[0] - 1, fixed: [0, min[1], max[2]] }, v: { name: "z", axisIndex: 2, from: min[2], to: max[2] - 1, fixed: [min[0], min[1], 0] } },
      });
      continue;
    }
    const sec = /^section_(x|z)=(-?\d+(?:\.\d+)?)$/.exec(name);
    if (sec) {
      const ax = sec[1] === "x" ? 0 : 2, v = parseFloat(sec[2]);
      // look from +axis toward -axis, removing everything with coord > v
      const dir = ax === 0 ? [1, 0, 0] : [0, 0, 1];
      const horiz = ax === 0 ? size[2] : size[0];
      const hh = Math.max(size[1] / 2, horiz / 2 / aspect) * 1.12 + 1;
      const eye = [ax === 0 ? v + 200 : c[0], c[1], ax === 2 ? v + 200 : c[2]];
      const uAxis = ax === 0 ? 2 : 0;
      views.push({
        name, title: `section at ${sec[1]}=${v} (looking ${ax === 0 ? "west" : "north"})`, kind: "ortho", eye, target: [ax === 0 ? v : c[0], c[1], ax === 2 ? v : c[2]],
        halfHeight: hh, width: W, height: H, clip: [{ normal: [-dir[0], 0, -dir[2]], constant: v + 1 }],
        rulers: {
          u: { name: uAxis === 0 ? "x" : "z", axisIndex: uAxis, from: uAxis === 0 ? min[0] : min[2], to: (uAxis === 0 ? max[0] : max[2]) - 1, fixed: ax === 0 ? [v + 1, min[1], 0] : [0, min[1], v + 1] },
          v: { name: "y", axisIndex: 1, from: min[1], to: max[1] - 1, fixed: ax === 0 ? [v + 1, 0, max[2]] : [min[0], 0, v + 1] },
        },
      });
      continue;
    }
    const iso = /^iso_(ne|nw|se|sw)$/.exec(name) ?? (name === "overview" ? [name, null] : null);
    if (iso) {
      let corner = iso[1] as string | null;
      if (!corner) {
        const f = SIDES[front], r = SIDES[sideFrom(front, -1)];
        const d = [f.dir[0] + r.dir[0], f.dir[2] + r.dir[2]];
        corner = (d[1] < 0 ? "n" : "s") + (d[0] > 0 ? "e" : "w");
      }
      const dx = corner.includes("e") ? 1 : -1, dz = corner.includes("s") ? 1 : -1;
      const fov = 35;
      const dist = (R * 0.92) / Math.sin(((fov / 2) * Math.PI) / 180);
      const el = 0.55; // ~30°
      const k = Math.cos(el) / Math.SQRT2;
      views.push({
        name, title: `${name} (3/4 view from ${corner.toUpperCase()})`, kind: "persp", fov,
        eye: [c[0] + dx * dist * k, c[1] + dist * Math.sin(el), c[2] + dz * dist * k], target: c, width: W, height: H, compass: true,
      });
      continue;
    }
    if (name === "street") {
      const f = SIDES[front], r = SIDES[sideFrom(front, -1)];
      const horiz = Math.abs(f.right[0]) > 0 ? size[0] : size[2];
      const fov = 60;
      const dist = Math.max(8, (Math.max(horiz, size[1] * aspect) * 0.75) / Math.tan(((fov / 2) * Math.PI) / 180) / aspect + (Math.abs(f.dir[0]) ? size[0] : size[2]) / 2);
      const gy = (opts.groundY ?? min[1]) + 1.7;
      const eye = [c[0] + f.dir[0] * dist + r.dir[0] * dist * 0.25, gy, c[2] + f.dir[2] * dist + r.dir[2] * dist * 0.25];
      views.push({ name, title: "street (eye level, 1.7 blocks high)", kind: "persp", fov, eye, target: [c[0], gy + size[1] * 0.25, c[2]], width: W, height: H, compass: true });
      continue;
    }
    const det = /^detail:(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)(?:,([\d.]+))?$/.exec(name);
    if (det) {
      const t = [parseFloat(det[1]) + 0.5, parseFloat(det[2]) + 0.5, parseFloat(det[3]) + 0.5];
      const rad = det[4] ? parseFloat(det[4]) : 4;
      const f = SIDES[front];
      const r = SIDES[sideFrom(front, -1)];
      const dist = rad * 2.6;
      views.push({
        name, title: `detail at ${det[1]},${det[2]},${det[3]}`, kind: "persp", fov: 45,
        eye: [t[0] + (f.dir[0] + r.dir[0] * 0.6) * dist, t[1] + dist * 0.45, t[2] + (f.dir[2] + r.dir[2] * 0.6) * dist], target: t, width: W, height: H, compass: true,
      });
      continue;
    }
    const cut = /^cutaway_y=(-?\d+)(?:,(ne|nw|se|sw))?$/.exec(name);
    if (cut) {
      // dollhouse view: everything above y removed, 3/4 perspective looking into the rooms
      const y = parseInt(cut[1], 10);
      let corner = cut[2];
      if (!corner) {
        const f = SIDES[front], r = SIDES[sideFrom(front, -1)];
        const d = [f.dir[0] + r.dir[0], f.dir[2] + r.dir[2]];
        corner = (d[1] < 0 ? "n" : "s") + (d[0] > 0 ? "e" : "w");
      }
      const dx = corner.includes("e") ? 1 : -1, dz = corner.includes("s") ? 1 : -1;
      const fov = 35;
      const t = [c[0], Math.min(y, c[1]), c[2]];
      const Rf = Math.hypot(size[0], size[2]) / 2 + 1;
      const dist = (Rf * 0.95) / Math.sin(((fov / 2) * Math.PI) / 180);
      const el = 0.85; // steeper, to look down into rooms
      const k = Math.cos(el) / Math.SQRT2;
      views.push({
        name, title: `cutaway above y=${y} (from ${corner.toUpperCase()})`, kind: "persp", fov,
        eye: [t[0] + dx * dist * k, t[1] + dist * Math.sin(el), t[2] + dz * dist * k], target: t, width: W, height: H, compass: true,
        clip: [{ normal: [0, -1, 0], constant: y + 1 }],
      });
      continue;
    }
    const eyeV = /^eye:(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)(?:,(-?[\d.]+))?(?:,([\d.]+))?$/.exec(name);
    if (eyeV) {
      // first-person camera standing in block (x,y,z); yaw like Minecraft (0 = south/+z, 90 = west, 180 = north, -90 = east)
      const [x, y, z, yaw] = [1, 2, 3, 4].map((i) => parseFloat(eyeV[i]));
      const pitch = eyeV[5] ? parseFloat(eyeV[5]) : 10;
      const fov = eyeV[6] ? parseFloat(eyeV[6]) : 75;
      const yr = (yaw * Math.PI) / 180, pr = (pitch * Math.PI) / 180;
      const e = [x + 0.5, y + 1.62, z + 0.5];
      const d = [-Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr)];
      views.push({ name, title: `eye view from ${x},${y},${z} yaw ${yaw}`, kind: "persp", fov, eye: e, target: [e[0] + d[0], e[1] + d[1], e[2] + d[2]], width: W, height: H, compass: true });
      continue;
    }
    const room = /^room:(-?\d+),(-?\d+),(-?\d+),(-?\d+),(-?\d+),(-?\d+)(?:,(ne|nw|se|sw))?$/.exec(name);
    if (room) {
      // stand in one corner of a room (its interior air box) and look at the opposite corner, wide angle
      const [ax, ay, az, bx, , bz] = room.slice(1, 7).map(Number);
      const by = Number(room[5]);
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      let corner = room[7];
      if (!corner) {
        const f = SIDES[front];
        corner = (f.dir[2] > 0 ? "s" : f.dir[2] < 0 ? "n" : "s") + (f.dir[0] > 0 ? "e" : "w");
      }
      const ex = corner.includes("e") ? x1 + 0.8 : x0 + 0.2, ez = corner.includes("s") ? z1 + 0.8 : z0 + 0.2;
      const tx = corner.includes("e") ? x0 : x1 + 1, tz = corner.includes("s") ? z0 : z1 + 1;
      // "security camera": just under the ceiling in the corner, looking down across the room to the far floor corner
      const eyeY = y1 + 0.75;
      views.push({ name, title: `room view from ${corner.toUpperCase()} ceiling corner`, kind: "persp", fov: 95, eye: [ex, eyeY, ez], target: [tx, y0 + 0.2, tz], width: W, height: H, compass: true });
      continue;
    }
    const cam = /^cam:(.+)$/.exec(name);
    if (cam) {
      const n = cam[1].split(",").map(Number);
      if (n.length < 6 || n.some(isNaN)) throw new Error(`bad custom camera '${name}'`);
      views.push({ name, title: `camera ${n.slice(0, 3).join(",")} → ${n.slice(3, 6).join(",")}`, kind: "persp", fov: n[6] ?? 50, eye: n.slice(0, 3), target: n.slice(3, 6), width: W, height: H, compass: true });
      continue;
    }
    throw new Error(`unknown view '${name}'. ${VIEW_HELP}`);
  }
  return views;
}

function opp(s: string) {
  return { south: "north", north: "south", east: "west", west: "east" }[s] ?? s;
}

export async function renderGrid(grid: VoxelGrid, context: VoxelGrid | null, views: string[], opts: { front?: string; width?: number; height?: number; sheet?: number; focus?: Bounds | null; ground?: boolean | "backdrop"; groundY?: number; clean?: boolean }) {
  const merged = context ? context.clone() : new VoxelGrid();
  merged.overlay(grid);
  // drop air
  const cells: [number, number, number, number][] = [];
  for (const e of merged.entries()) if (e[3] !== 0) cells.push(e);
  const focus = opts.focus ?? grid.bounds() ?? merged.bounds();
  if (!focus) throw new Error("nothing to render (the build is empty)");
  const groundY = opts.groundY ?? focus.min[1];
  const vs = makeViews(views, focus, { front: opts.front, width: opts.width, height: opts.height, groundY });
  if (opts.clean) for (const v of vs) v.clean = true;
  // With world context, a plain backdrop plane continues the ground to the horizon; without it, a measuring grid.
  const r = await renderService.render(cells, (x, y, z) => merged.getId(x, y, z), focus, vs, {
    sheet: opts.sheet,
    ground: opts.ground === false ? null : context || opts.ground === "backdrop" ? { y: groundY - 0.02, grid: false } : { y: groundY, grid: true },
  });
  return { ...r, views: vs };
}
