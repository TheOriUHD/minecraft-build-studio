// Interior design toolkit: furniture pieces and an automatic room furnisher that respects walls, doors and windows.
// Wall frame convention (used by every wall piece): x runs along the wall, z points INTO the room (z=0 is the row
// touching the wall), y=0 is the first air layer above the floor. facing=north = toward the wall, south = into the room.
import { Builder } from "./builder.ts";
import { BlockSpec, Vec, mulberry32 } from "./patterns.ts";
import { parseState } from "../blocks/state.ts";

type F = Builder;

export interface Style {
  wood: string; // planks family: spruce, oak, dark_oak, birch, jungle, acacia, mangrove, cherry, bamboo, crimson, warped, pale_oak
  accent: string; // second wood for contrast
  stone: string; // fireplace / counters
  rug: [string, string]; // carpet colours [border, inner]
  bed: string; // bed colour
  metal: "lantern" | "soul_lantern";
}

export const STYLES: Record<string, Style> = {
  rustic: { wood: "spruce", accent: "dark_oak", stone: "cobblestone", rug: ["brown", "red"], bed: "red", metal: "lantern" },
  medieval: { wood: "spruce", accent: "dark_oak", stone: "stone_brick", rug: ["red", "orange"], bed: "red", metal: "lantern" },
  nordic: { wood: "spruce", accent: "stripped_spruce", stone: "cobbled_deepslate", rug: ["gray", "light_gray"], bed: "white", metal: "lantern" },
  noble: { wood: "dark_oak", accent: "spruce", stone: "polished_blackstone", rug: ["red", "yellow"], bed: "purple", metal: "lantern" },
  light: { wood: "birch", accent: "oak", stone: "polished_diorite", rug: ["light_blue", "white"], bed: "light_blue", metal: "lantern" },
  desert: { wood: "jungle", accent: "acacia", stone: "sandstone", rug: ["orange", "yellow"], bed: "orange", metal: "lantern" },
  fantasy: { wood: "cherry", accent: "dark_oak", stone: "mossy_stone_brick", rug: ["pink", "magenta"], bed: "pink", metal: "lantern" },
  modern: { wood: "pale_oak", accent: "dark_oak", stone: "polished_andesite", rug: ["gray", "white"], bed: "white", metal: "lantern" },
};

const planks = (w: string) => (w.startsWith("stripped_") ? w.replace(/^stripped_/, "") : w) + "_planks";
const fam = (w: string) => w.replace(/^stripped_/, "");

// ---------------- individual pieces (wall frame) ----------------

export const furniture = {
  /** Bed against the wall (head at z=0) with optional nightstands left/right. w=1 single, 2 double. */
  bed(f: F, x: number, s: Style, o: { w?: number; nightstands?: boolean } = {}) {
    const w = o.w ?? 1;
    for (let i = 0; i < w; i++) {
      f.set([x + i, 0, 0], `${s.bed}_bed[facing=north,part=head]`);
      f.set([x + i, 0, 1], `${s.bed}_bed[facing=north,part=foot]`);
    }
    if (o.nightstands !== false) {
      for (const nx of [x - 1, x + w]) {
        f.set([nx, 0, 0], "barrel[facing=up]", { mask: "air" });
        f.set([nx, 1, 0], "candle[candles=2,lit=true]", { mask: "air" });
      }
    }
  },
  wardrobe(f: F, x: number, s: Style) {
    f.fill([x, 0, 0], [x + 1, 1, 0], planks(s.accent));
    f.fill([x, 2, 0], [x + 1, 2, 0], `${fam(s.accent)}_slab[type=bottom]`);
    f.set([x, 0, 1], `${fam(s.wood)}_trapdoor[facing=south,half=bottom,open=true]`);
    f.set([x + 1, 0, 1], `${fam(s.wood)}_trapdoor[facing=south,half=bottom,open=true]`);
    f.set([x, 1, 1], `${fam(s.wood)}_trapdoor[facing=south,half=bottom,open=true]`);
    f.set([x + 1, 1, 1], `${fam(s.wood)}_trapdoor[facing=south,half=bottom,open=true]`);
  },
  bookshelf(f: F, x: number, w: number, s: Style, o: { h?: number } = {}) {
    const h = o.h ?? 2;
    for (let i = 0; i < w; i++)
      for (let y = 0; y < h; y++) f.set([x + i, y, 0], (i * 7 + y * 3) % 5 === 0 ? "chiseled_bookshelf[facing=south]" : "bookshelf");
    f.fill([x, h, 0], [x + w - 1, h, 0], `${fam(s.accent)}_slab[type=bottom]`);
    f.set([x, h + 1, 0], "flower_pot");
    if (w > 2) f.set([x + w - 1, h + 1, 0], "candle[candles=3,lit=true]");
  },
  desk(f: F, x: number, s: Style) {
    f.set([x, 0, 0], `${fam(s.accent)}_slab[type=top]`);
    f.set([x + 1, 0, 0], `${fam(s.accent)}_slab[type=top]`);
    f.set([x, 1, 0], "lantern[hanging=false]");
    f.set([x + 1, 1, 0], "candle[candles=1,lit=true]");
    f.set([x, 0, 1], `${fam(s.wood)}_stairs[facing=south,half=bottom]`);
  },
  /** Kitchen counter run: smoker/stove, sink (water cauldron), cupboards; shelf above. */
  counter(f: F, x: number, w: number, s: Style) {
    for (let i = 0; i < w; i++) {
      const k = i % 4;
      const b = i === 0 ? "smoker[facing=south,lit=false]" : k === 2 ? "water_cauldron[level=3]" : "barrel[facing=south]";
      f.set([x + i, 0, 0], b);
      if (b.startsWith("barrel") && i % 2 === 1) f.set([x + i, 1, 0], "flower_pot");
      f.set([x + i, 2, 0], `${fam(s.wood)}_trapdoor[facing=south,half=top,open=false]`);
      if (i % 2 === 0) f.set([x + i, 3, 0], i % 4 === 0 ? "decorated_pot" : "candle[candles=2,lit=true]");
    }
    // hood over the stove
    f.set([x, 2, 0], `${s.stone}_stairs[facing=north,half=top]`);
  },
  fireplace(f: F, x: number, s: Style, ceilingY = 4) {
    const st = s.stone;
    const block = st.endsWith("brick") ? st + "s" : st;
    f.fill([x, 0, 0], [x + 2, 2, 0], "bricks");
    f.set([x + 1, 0, 0], "campfire[lit=true,signal_fire=false]");
    f.set([x + 1, 1, 0], "air");
    f.fill([x, 3, 0], [x + 2, ceilingY, 0], block);
    for (let i = 0; i < 3; i++) f.set([x + i, 2, 1], `${fam(s.accent)}_slab[type=top]`.replace(/^stripped_/, ""));
    f.set([x, 3, 1], "candle[candles=3,lit=true]");
    f.set([x + 2, 3, 1], "flower_pot");
    f.set([x - 1, 0, 0], "barrel[facing=up]", { mask: "air" });
  },
  sofa(f: F, x: number, w: number, s: Style) {
    for (let i = 0; i < w; i++) f.set([x + i, 0, 0], `${fam(s.wood)}_stairs[facing=north,half=bottom]`);
    f.set([x - 1, 0, 0], `${fam(s.wood)}_trapdoor[facing=west,half=bottom,open=true]`, { mask: "air" });
    f.set([x + w, 0, 0], `${fam(s.wood)}_trapdoor[facing=east,half=bottom,open=true]`, { mask: "air" });
  },
  storage(f: F, x: number, w: number) {
    for (let i = 0; i < w; i++) {
      f.set([x + i, 0, 0], i % 2 ? "chest[facing=south]" : "barrel[facing=up]");
      if (i % 2 === 0) f.set([x + i, 1, 0], "barrel[facing=up]");
    }
  },
  workbench(f: F, x: number) {
    f.set([x, 0, 0], "crafting_table");
    f.set([x + 1, 0, 0], "smithing_table");
    f.set([x + 2, 0, 0], "anvil[facing=east]");
    f.set([x, 1, 0], "lantern[hanging=false]");
  },
  bar(f: F, x: number, w: number, s: Style) {
    for (let i = 0; i < w; i++) {
      f.set([x + i, 0, 0], "barrel[facing=south]");
      f.set([x + i, 1, 0], i % 3 === 1 ? "brewing_stand" : "air");
      f.set([x + i, 0, 2], `${fam(s.accent)}_slab[type=top]`); // bar counter
      f.set([x + i, 0, 3], `${fam(s.wood)}_fence`); // stools
    }
  },
  plant(f: F, x: number) {
    f.set([x, 0, 0], "potted_azalea_bush");
  },
  /** Table with chairs (room frame, footprint w×d from p). */
  table(b: F, p: Vec, w: number, d: number, s: Style) {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++) b.set([p[0] + i, p[1], p[2] + j], `${fam(s.accent)}_slab[type=top]`);
    for (let i = 0; i < w; i++) {
      b.set([p[0] + i, p[1], p[2] - 1], `${fam(s.wood)}_stairs[facing=north,half=bottom]`, { mask: "air" });
      b.set([p[0] + i, p[1], p[2] + d], `${fam(s.wood)}_stairs[facing=south,half=bottom]`, { mask: "air" });
    }
    b.set([p[0] + Math.floor((w - 1) / 2), p[1] + 1, p[2] + Math.floor((d - 1) / 2)], "candle[candles=3,lit=true]");
  },
  rug(b: F, a: Vec, c: Vec, colors: [string, string]) {
    const [x0, x1] = [Math.min(a[0], c[0]), Math.max(a[0], c[0])];
    const [z0, z1] = [Math.min(a[2], c[2]), Math.max(a[2], c[2])];
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        b.set([x, a[1], z], `${edge ? colors[0] : colors[1]}_carpet`, { mask: "air" });
      }
  },
  chandelier(b: F, p: Vec, drop: number, metal = "lantern") {
    for (let i = 0; i < drop; i++) b.set([p[0], p[1] - i, p[2]], "iron_chain[axis=y]");
    b.set([p[0], p[1] - drop, p[2]], `${metal}[hanging=true]`);
  },
};

// ---------------- room furnisher ----------------

type ItemDef = { name: string; w: number; d: number; h: number; draw: (f: F, x: number, s: Style) => void; alt?: ItemDef };

const ITEMS = (s: Style, rng: () => number): Record<string, ItemDef[]> => {
  const it = (name: string, w: number, d: number, h: number, draw: ItemDef["draw"], alt?: ItemDef): ItemDef => ({ name, w, d, h, draw, alt });
  // low variants fit under windows (h = height of the solid part; decorations on top are allowed)
  const lowShelf = (w: number) => it("low bookshelf", w, 1, 1, (f, x) => {
    for (let i = 0; i < w; i++) {
      f.set([x + i, 0, 0], i % 2 ? "chiseled_bookshelf[facing=south]" : "bookshelf");
      f.set([x + i, 1, 0], i % 2 ? "candle[candles=2,lit=true]" : "flower_pot");
    }
  });
  const chests = (w: number) => it("chests", w, 1, 1, (f, x) => {
    for (let i = 0; i < w; i++) f.set([x + i, 0, 0], i % 2 ? "chest[facing=south]" : "barrel[facing=up]");
  });
  const lowCounter = (w: number) => it("low counter", w, 1, 1, (f, x) => {
    for (let i = 0; i < w; i++) {
      f.set([x + i, 0, 0], i === 0 ? "smoker[facing=south,lit=false]" : i === 2 ? "water_cauldron[level=3]" : "barrel[facing=south]");
      if (i % 2 === 1) f.set([x + i, 1, 0], i % 4 === 1 ? "flower_pot" : "candle[candles=2,lit=true]");
    }
  });
  const bed2 = it("double bed", 4, 2, 1, (f, x) => furniture.bed(f, x + 1, s, { w: 2 }));
  const bed1 = it("bed", 3, 2, 1, (f, x) => furniture.bed(f, x + 1, s, { w: 1 }));
  const wardrobe = it("wardrobe", 2, 2, 3, (f, x) => furniture.wardrobe(f, x, s), chests(2));
  const shelf3 = it("bookshelf", 3, 1, 3, (f, x) => furniture.bookshelf(f, x, 3, s), lowShelf(3));
  const shelf2 = it("bookshelf", 2, 1, 3, (f, x) => furniture.bookshelf(f, x, 2, s), lowShelf(2));
  const desk = it("desk", 2, 2, 1, (f, x) => furniture.desk(f, x, s));
  const fire = it("fireplace", 3, 2, 3, (f, x) => furniture.fireplace(f, x, s));
  const sofa = it("sofa", 4, 1, 1, (f, x) => furniture.sofa(f, x + 1, 2, s));
  const counter = (w: number) => it("kitchen counter", w, 1, 4, (f, x) => furniture.counter(f, x, w, s), lowCounter(w));
  const storage = (w: number) => it("storage", w, 1, 2, (f, x) => furniture.storage(f, x, w), chests(w));
  const bench = it("workbench", 3, 1, 1, (f, x) => furniture.workbench(f, x));
  const bar = it("bar", 5, 4, 2, (f, x) => furniture.bar(f, x, 5, s));
  const plant = it("plant", 1, 1, 1, (f, x) => furniture.plant(f, x));
  void rng;
  return {
    bedroom: [bed2, wardrobe, shelf2, desk, storage(2), plant, plant],
    kids: [bed1, bed1, storage(2), shelf2, plant],
    living: [fire, sofa, shelf3, shelf2, plant, storage(1), plant],
    kitchen: [counter(5), counter(3), storage(2), shelf2, plant],
    dining: [counter(3), shelf2, storage(2), plant, plant],
    study: [desk, shelf3, shelf3, shelf2, plant, plant],
    storage: [storage(4), storage(3), storage(2), bench, storage(2)],
    workshop: [bench, storage(3), counter(3), storage(2), plant],
    tavern: [bar, fire, storage(3), shelf2, plant, plant],
    hall: [fire, shelf3, shelf3, plant, plant, storage(2)],
  };
};

const isSolid = (s: string | undefined) => {
  if (!s) return false;
  const n = parseState(s).name;
  return !/air$|_door$|glass_pane$|_pane$|bars$|_fence|_trapdoor|carpet|torch|lantern|_sign|banner|flower|_bed$|ladder|vine|button|rail/.test(n) && !n.includes("glass");
};
const isDoor = (s: string | undefined) => !!s && /_door$|fence_gate$/.test(parseState(s).name);
const isAirish = (s: string | undefined) => s === undefined || /air$/.test(parseState(s).name);

/**
 * Furnish a room. a..c = the room's interior AIR volume (a.y = first air layer above the floor, c.y = last air layer
 * under the ceiling). Reads the walls, doors and windows built by earlier components (peek) so furniture never blocks
 * them. type: bedroom | kids | living | kitchen | dining | study | storage | workshop | tavern | hall.
 * Returns a report of what was placed.
 */
export function furnish(b: F, a: Vec, c: Vec, o: { type?: string; style?: string | Style; seed?: number; rug?: boolean; lights?: boolean; table?: boolean; items?: string[] } = {}): string[] {
  const s: Style = typeof o.style === "object" ? o.style : STYLES[o.style ?? "medieval"] ?? STYLES.medieval;
  const rng = mulberry32(o.seed ?? 7);
  const x0 = Math.min(a[0], c[0]), x1 = Math.max(a[0], c[0]);
  const z0 = Math.min(a[2], c[2]), z1 = Math.max(a[2], c[2]);
  const y0 = Math.min(a[1], c[1]), y1 = Math.max(a[1], c[1]);
  const W = x1 - x0 + 1, D = z1 - z0 + 1, H = y1 - y0 + 1;
  const report: string[] = [];
  const occupied = new Set<string>();
  const key = (x: number, z: number) => `${x},${z}`;

  // doors / openings around the perimeter → keep-clear zones
  const keepClear = new Set<string>();
  const markClear = (x: number, z: number, r = 1) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) keepClear.add(key(x + dx, z + dz));
  };
  for (let x = x0; x <= x1; x++)
    for (const [z, zz] of [[z0 - 1, z0], [z1 + 1, z1]] as const) {
      const s0 = b.peek([x, y0, z]), s1 = b.peek([x, y0 + 1, z]);
      if (isDoor(s0) || (isAirish(s0) && isAirish(s1))) markClear(x, zz, 1);
    }
  for (let z = z0; z <= z1; z++)
    for (const [x, xx] of [[x0 - 1, x0], [x1 + 1, x1]] as const) {
      const s0 = b.peek([x, y0, z]), s1 = b.peek([x, y0 + 1, z]);
      if (isDoor(s0) || (isAirish(s0) && isAirish(s1))) markClear(xx, z, 1);
    }
  // stairs / ladders / holes in the floor inside the room → keep clear
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      const fl = b.peek([x, y0 - 1, z]);
      const at = b.peek([x, y0, z]);
      if (isAirish(fl) || (at && /stairs|ladder/.test(at))) markClear(x, z, 1);
      if (at && !isAirish(at)) occupied.add(key(x, z));
    }

  // wall frames: origin at the wall-adjacent row, x along the wall, z into the room
  const walls = [
    { side: "north", o: [x0, y0, z0] as Vec, rot: 0, len: W, depthMax: D },
    { side: "east", o: [x1, y0, z0] as Vec, rot: 1, len: D, depthMax: W },
    { side: "south", o: [x1, y0, z1] as Vec, rot: 2, len: W, depthMax: D },
    { side: "west", o: [x0, y0, z1] as Vec, rot: 3, len: D, depthMax: W },
  ];
  const frames = walls.map((w) => ({ ...w, f: b.at(w.o, { rotate: w.rot }) }));
  // per wall: which positions are usable for tall (h>1) and low items
  const wallInfo = frames.map((w) => {
    const hgt: number[] = [];
    for (let i = 0; i < w.len; i++) {
      let h = 0;
      while (h < H && isSolid(w.f.peek([i, h, -1]))) h++;
      hgt.push(h);
    }
    return { ...w, hgt, tall: hgt.map((h) => h >= 2) };
  });
  const rootXZ = (f: F, lx: number, lz: number) => {
    const r = f.toRoot([lx, 0, lz]);
    const o = b.toRoot([0, 0, 0]);
    return [r[0] - o[0], r[2] - o[2]];
  };
  const fits = (w: (typeof wallInfo)[number], x: number, item: ItemDef) => {
    if (x < 0 || x + item.w > w.len || item.d > w.depthMax - 2 || item.h > H) return false;
    for (let i = 0; i < item.w; i++) {
      if (w.hgt[x + i] < Math.min(item.h, H)) return false;
      for (let dz = 0; dz < item.d; dz++) {
        const [rx, rz] = rootXZ(w.f, x + i, dz);
        if (occupied.has(key(rx, rz)) || keepClear.has(key(rx, rz))) return false;
      }
    }
    return true;
  };
  const place = (w: (typeof wallInfo)[number], x: number, item: ItemDef) => {
    item.draw(w.f.at([x, 0, 0]), 0, s);
    for (let i = -0; i < item.w; i++) for (let dz = 0; dz < item.d + 1; dz++) {
      const [rx, rz] = rootXZ(w.f, x + i, dz);
      occupied.add(key(rx, rz));
    }
    report.push(`${item.name} on ${w.side} wall`);
  };

  const all = ITEMS(s, rng);
  const list = o.items ? o.items.flatMap((n) => Object.values(all).flat().filter((i) => i.name === n).slice(0, 1)) : all[o.type ?? "living"] ?? all.living;
  // place biggest first, try walls in order of free length, positions centred-ish
  for (const item of list) {
    let done = false;
    let order = [...wallInfo].sort((p, q) => q.hgt.reduce((a, v) => a + v, 0) - p.hgt.reduce((a, v) => a + v, 0));
    if (item.h <= 1) order.reverse(); // low pieces prefer the window walls, saving solid walls for tall pieces
    for (const w of order) {
      const centre = Math.floor((w.len - item.w) / 2);
      const xs = Array.from({ length: w.len }, (_, i) => i).sort((p, q) => Math.abs(p - centre) - Math.abs(q - centre));
      for (const x of xs) {
        if (fits(w, x, item)) {
          place(w, x, item);
          done = true;
          break;
        }
      }
      if (done) break;
    }
    if (!done && item.alt) {
      const alt = item.alt;
      for (const w of order) {
        for (let x = 0; x < w.len && !done; x++) if (fits(w, x, alt)) { place(w, x, alt); done = true; }
        if (done) break;
      }
    }
    if (!done) report.push(`(skipped ${item.name}: no free wall space)`);
  }

  // centre: table or rug
  const cx0 = x0 + 2, cx1 = x1 - 2, cz0 = z0 + 2, cz1 = z1 - 2;
  if (cx1 - cx0 >= 1 && cz1 - cz0 >= 1) {
    const wantTable = o.table ?? ["kitchen", "dining", "tavern", "hall", "workshop"].includes(o.type ?? "");
    let free = true;
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) if (occupied.has(key(x, z)) || keepClear.has(key(x, z))) free = false;
    if (free && o.rug !== false) furniture.rug(b, [cx0, y0, cz0], [cx1, y0, cz1], s.rug);
    if (wantTable && free) {
      const tw = Math.max(1, Math.min(4, cx1 - cx0 - 1)), td = Math.max(1, Math.min(2, cz1 - cz0 - 1));
      furniture.table(b, [Math.floor((cx0 + cx1 - tw + 1) / 2), y0, Math.floor((cz0 + cz1 - td + 1) / 2)], tw, td, s);
      report.push(`table ${tw}x${td} with chairs`);
    } else if (free) report.push("rug");
  }
  // lighting: hanging lanterns every ~5 blocks under the ceiling (if there is one)
  if (o.lights !== false) {
    let n = 0;
    const nx = Math.max(1, Math.round(W / 5)), nz = Math.max(1, Math.round(D / 5));
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++) {
        const x = x0 + Math.floor(((i + 0.5) * W) / nx), z = z0 + Math.floor(((k + 0.5) * D) / nz);
        const ceil = b.peek([x, y1 + 1, z]);
        if (!ceil || isAirish(ceil)) continue;
        // keep lights above walkways; over furniture hang them flush with the ceiling
        const drop = occupied.has(key(x, z)) ? 0 : Math.max(0, H - 4);
        if (drop > 0) furniture.chandelier(b, [x, y1, z], drop, s.metal);
        else b.set([x, y1, z], `${s.metal}[hanging=true]`, { mask: "air" });
        n++;
      }
    if (n) report.push(`${n} hanging light(s)`);
  }
  // corner clutter
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    if (!occupied.has(key(x, z)) && !keepClear.has(key(x, z)) && rng() < 0.6) {
      b.set([x, y0, z], rng() < 0.5 ? "potted_fern" : "barrel[facing=up]", { mask: "air" });
    }
  }
  return report;
}

export function interiorLib() {
  return { furnish, furniture, STYLES };
}
void (null as unknown as BlockSpec);
