// Loads vanilla blockstate + model JSON extracted from the client jar and answers
// questions about blocks: does it exist, which properties, which models to draw, is it a full opaque cube.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { BlockState, parseState } from "./state.ts";

export interface Face {
  uv?: [number, number, number, number];
  texture: string;
  cullface?: string;
  rotation?: number;
  tintindex?: number;
}
export interface Element {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: { origin: [number, number, number]; axis: "x" | "y" | "z"; angle: number; rescale?: boolean };
  faces: Partial<Record<"north" | "south" | "east" | "west" | "up" | "down", Face>>;
  shade?: boolean;
}
export interface ResolvedModel {
  elements: Element[]; // textures resolved to "block/xxx" paths
  ambientocclusion: boolean;
}
export interface ModelRef {
  model: string;
  x?: number;
  y?: number;
  uvlock?: boolean;
}

type Variant = ModelRef | ModelRef[];
interface BlockstateFile {
  variants?: Record<string, Variant>;
  multipart?: { when?: any; apply: Variant }[];
}

export class AssetDB {
  readonly root: string;
  private blockstates = new Map<string, BlockstateFile>();
  private models = new Map<string, any>();
  private resolved = new Map<string, ResolvedModel>();
  private fullCache = new Map<string, boolean>();
  private texAlpha = new Map<string, "opaque" | "cutout" | "translucent">();
  readonly forcedTranslucent = new Set<string>();
  readonly propertyValues = new Map<string, Map<string, Set<string>>>();

  constructor(root: string) {
    this.root = root;
    const dir = path.join(root, "blockstates");
    if (!fs.existsSync(dir)) throw new Error(`asset directory not found: ${dir} (run npm run extract-assets)`);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const name = f.slice(0, -5);
      const bs: BlockstateFile = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      this.blockstates.set(name, bs);
      const pv = new Map<string, Set<string>>();
      const add = (k: string, v: string) => {
        if (!pv.has(k)) pv.set(k, new Set());
        for (const vv of v.split("|")) pv.get(k)!.add(vv);
      };
      if (bs.variants) {
        for (const key of Object.keys(bs.variants)) {
          if (!key) continue;
          for (const kv of key.split(",")) {
            const [k, v] = kv.split("=");
            if (k && v !== undefined) add(k, v);
          }
        }
      }
      if (bs.multipart) {
        const walk = (w: any) => {
          if (!w) return;
          if (w.OR) return w.OR.forEach(walk);
          if (w.AND) return w.AND.forEach(walk);
          for (const [k, v] of Object.entries(w)) add(k, String(v));
        };
        for (const part of bs.multipart) walk(part.when);
      }
      this.propertyValues.set(name, pv);
    }
  }

  get blockNames(): string[] {
    return [...this.blockstates.keys()];
  }
  has(name: string) {
    return this.blockstates.has(name);
  }

  /** Validates a state; returns error/warning strings. */
  validate(state: string): string | null {
    let st: BlockState;
    try {
      st = parseState(state);
    } catch (e: any) {
      return e.message;
    }
    if (!this.has(st.name)) {
      return `unknown block '${st.name}'${this.suggest(st.name)}`;
    }
    const pv = this.propertyValues.get(st.name)!;
    for (const [k, v] of Object.entries(st.props)) {
      // waterlogged/powered etc. often don't affect models; accept common ones silently.
      if (!pv.size) continue; // entity-rendered blocks (chests, signs...) have no model variants
      if (!pv.has(k)) {
        if (["waterlogged", "powered", "open", "persistent", "distance", "lit", "occupied", "snowy", "stage", "level", "moisture", "age", "power", "triggered", "enabled", "locked", "delay", "mode", "note", "instrument", "inverted", "has_book", "signal_fire", "hanging", "attached", "disarmed", "in_wall", "conditional", "drag", "bloom", "unstable"].includes(k)) continue;
        return `block '${st.name}' has no property '${k}' (known: ${[...pv.keys()].join(", ") || "none"})`;
      }
      if (!pv.get(k)!.has(v)) return `block '${st.name}' property '${k}' has no value '${v}' (allowed: ${[...pv.get(k)!].join(", ")})`;
    }
    return null;
  }

  suggest(name: string): string {
    const names = this.blockNames;
    const scored = names
      .map((n) => [n, lev(n, name) - (n.includes(name) || name.includes(n) ? 3 : 0)] as const)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 4)
      .map((x) => x[0]);
    return scored.length ? ` — did you mean ${scored.map((s) => `'${s}'`).join(", ")}?` : "";
  }

  private loadModel(id: string): any {
    const name = id.replace(/^minecraft:/, "");
    let m = this.models.get(name);
    if (m) return m;
    const file = path.join(this.root, "models", name + ".json");
    m = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    this.models.set(name, m);
    return m;
  }

  resolveModel(id: string): ResolvedModel {
    const name = id.replace(/^minecraft:/, "");
    const c = this.resolved.get(name);
    if (c) return c;
    // Walk parent chain, collecting textures and first-found elements.
    let textures: Record<string, string> = {};
    let elements: Element[] | undefined;
    let ao = true;
    let cur: any = this.loadModel(name);
    const chain: any[] = [];
    let guard = 0;
    while (cur && guard++ < 20) {
      chain.push(cur);
      if (!cur.parent) break;
      cur = this.loadModel(cur.parent);
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const m = chain[i];
      if (m.textures) textures = { ...textures, ...m.textures };
      if (m.ambientocclusion === false) ao = false;
    }
    for (const m of chain) {
      if (m.elements) {
        elements = m.elements;
        break;
      }
    }
    const resolveTex = (t0: any): string => {
      let t: any = t0;
      let g = 0;
      const norm = (v: any) => {
        if (v && typeof v === "object") {
          const sp = String(v.sprite ?? v.texture ?? "").replace(/^minecraft:/, "");
          if (v.force_translucent && sp) this.forcedTranslucent.add(sp);
          return sp;
        }
        return v;
      };
      t = norm(t);
      while (t && typeof t === "string" && t.startsWith("#") && g++ < 10) t = norm(textures[t.slice(1)]) ?? "";
      if (typeof t !== "string") return "";
      return t.replace(/^minecraft:/, "");
    };
    const out: Element[] = (elements ?? []).map((e) => {
      const faces: Element["faces"] = {};
      for (const [fn, f] of Object.entries(e.faces ?? {})) {
        const tex = resolveTex((f as Face).texture);
        if (!tex) continue;
        const cf = (f as Face).cullface;
        const cullface = cf === "bottom" ? "down" : cf === "top" ? "up" : cf;
        (faces as any)[fn === "bottom" ? "down" : fn === "top" ? "up" : fn] = { ...(f as Face), texture: tex, cullface };
      }
      return { ...e, faces };
    });
    const r = { elements: out, ambientocclusion: ao };
    this.resolved.set(name, r);
    return r;
  }

  /** Returns the model references for a state (picks first of weighted lists; deterministic). */
  modelsFor(state: string, pick = 0): ModelRef[] {
    const st = parseState(state);
    const bs = this.blockstates.get(st.name);
    if (!bs) return [];
    const one = (v: Variant): ModelRef => (Array.isArray(v) ? v[Math.abs(pick) % v.length] : v);
    if (bs.variants) {
      const keys = Object.keys(bs.variants);
      let best: string | null = null;
      let bestScore = -1;
      for (const k of keys) {
        if (k === "") {
          if (bestScore < 0) {
            best = k;
            bestScore = 0;
          }
          continue;
        }
        let ok = true;
        let score = 0;
        for (const kv of k.split(",")) {
          const [pk, pvv] = kv.split("=");
          const have = st.props[pk];
          if (have === undefined) {
            // unspecified: accept, but prefer the vanilla default value
            if (DEFAULTS[pk] === pvv) score += 0.5;
            continue;
          }
          if (have !== pvv) {
            ok = false;
            break;
          }
          score++;
        }
        if (ok && score > bestScore) {
          best = k;
          bestScore = score;
        }
      }
      if (best === null) best = keys[0];
      return [one(bs.variants[best])];
    }
    if (bs.multipart) {
      const out: ModelRef[] = [];
      const test = (w: any): boolean => {
        if (!w) return true;
        if (w.OR) return w.OR.some(test);
        if (w.AND) return w.AND.every(test);
        return Object.entries(w).every(([k, v]) => {
          const have = st.props[k] ?? defaultProp(k);
          return String(v).split("|").includes(have);
        });
      };
      for (const part of bs.multipart) if (test(part.when)) out.push(one(part.apply));
      return out;
    }
    return [];
  }

  /** True if the block renders as a full, opaque 16³ cube (used for culling, AO and connections). */
  isFullOpaque(name: string): boolean {
    let c = this.fullCache.get(name);
    if (c !== undefined) return c;
    c = false;
    const refs = this.modelsFor(name);
    if (refs.length === 1 && !NON_SOLID.has(name) && !name.includes("leaves") && !name.includes("glass") && !name.endsWith("ice")) {
      const m = this.resolveModel(refs[0].model);
      if (m.elements.length === 1) {
        const e = m.elements[0];
        const full = e.from.every((v) => v === 0) && e.to.every((v) => v === 16) && Object.keys(e.faces).length === 6;
        if (full) {
          c = Object.values(e.faces).every((f) => this.textureAlpha(f!.texture) === "opaque");
        }
      }
    }
    this.fullCache.set(name, c);
    return c;
  }

  textureAlpha(tex: string): "opaque" | "cutout" | "translucent" {
    let a = this.texAlpha.get(tex);
    if (a) return a;
    if (this.forcedTranslucent.has(tex)) {
      this.texAlpha.set(tex, "translucent");
      return "translucent";
    }
    a = "opaque";
    const img = this.texture(tex);
    if (img) {
      let hasZero = false;
      let hasPartial = false;
      const n = img.width * Math.min(img.height, img.width);
      for (let i = 0; i < n; i++) {
        const al = img.data[i * 4 + 3];
        if (al === 0) hasZero = true;
        else if (al < 250) hasPartial = true;
      }
      a = hasPartial ? "translucent" : hasZero ? "cutout" : "opaque";
    }
    this.texAlpha.set(tex, a);
    return a;
  }

  private texCache = new Map<string, PNG | null>();
  texture(tex: string): PNG | null {
    if (this.texCache.has(tex)) return this.texCache.get(tex)!;
    const file = path.join(this.root, "textures", tex + ".png");
    let png: PNG | null = null;
    if (fs.existsSync(file)) {
      try {
        png = PNG.sync.read(fs.readFileSync(file));
      } catch {
        png = null;
      }
    }
    this.texCache.set(tex, png);
    return png;
  }
}

const NON_SOLID = new Set([
  "barrier", "light", "structure_void", "spawner", "beacon", "slime_block", "honey_block", "tinted_glass",
  "mangrove_roots", "chorus_flower",
]);

const DEFAULTS: Record<string, string> = {
  axis: "y", facing: "north", half: "bottom", shape: "straight", type: "bottom", face: "wall", hinge: "left",
  open: "false", powered: "false", waterlogged: "false", rotation: "0", attachment: "floor", hanging: "false",
};

function defaultProp(k: string): string {
  if (["north", "south", "east", "west"].includes(k)) return "none";
  if (k === "up") return "true";
  return "false";
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

let _db: AssetDB | null = null;
export function assets(): AssetDB {
  if (!_db) {
    const root = process.env.BUILDMCP_ASSETS ?? path.resolve(import.meta.dirname, "../../../runtime/assets");
    _db = new AssetDB(root);
  }
  return _db;
}
