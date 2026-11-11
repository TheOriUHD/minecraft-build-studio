// Block state parsing, formatting and interning.

export interface BlockState {
  name: string; // without namespace, e.g. "oak_stairs"
  props: Record<string, string>;
}

const parseCache = new Map<string, BlockState>();

/** Parses "minecraft:oak_stairs[facing=north]" / "oak_stairs[facing=north]" / "stone". */
export function parseState(s: string): BlockState {
  let c = parseCache.get(s);
  if (c) return c;
  let str = s.trim();
  if (str.startsWith("minecraft:")) str = str.slice(10);
  const props: Record<string, string> = {};
  let name = str;
  const i = str.indexOf("[");
  if (i >= 0) {
    if (!str.endsWith("]")) throw new Error(`malformed block state '${s}'`);
    name = str.slice(0, i);
    const inner = str.slice(i + 1, -1).trim();
    if (inner) {
      for (const kv of inner.split(",")) {
        const [k, v] = kv.split("=").map((t) => t.trim());
        if (!k || v === undefined) throw new Error(`malformed property '${kv}' in '${s}'`);
        props[k] = v;
      }
    }
  }
  name = name.trim().toLowerCase();
  c = { name, props };
  parseCache.set(s, c);
  return c;
}

export function formatState(st: BlockState, namespace = false): string {
  const keys = Object.keys(st.props).sort();
  const base = (namespace ? "minecraft:" : "") + st.name;
  if (!keys.length) return base;
  return `${base}[${keys.map((k) => `${k}=${st.props[k]}`).join(",")}]`;
}

/** Canonical form used as palette key: no namespace, sorted props. */
export function canonical(s: string): string {
  return formatState(parseState(s));
}

export function withProps(s: string, props: Record<string, string>): string {
  const st = parseState(s);
  return formatState({ name: st.name, props: { ...st.props, ...props } });
}

export const isAir = (s: string) => {
  const n = parseState(s).name;
  return n === "air" || n === "cave_air" || n === "void_air";
};

/** Global intern table so voxel grids can store small integers. Index 0 is always air. */
export class Palette {
  private ids = new Map<string, number>();
  readonly states: string[] = [];
  constructor() {
    this.id("air");
  }
  id(state: string): number {
    const c = canonical(state);
    let i = this.ids.get(c);
    if (i === undefined) {
      i = this.states.length;
      this.states.push(c);
      this.ids.set(c, i);
    }
    return i;
  }
  get(i: number): string {
    return this.states[i];
  }
}

export const PALETTE = new Palette();
