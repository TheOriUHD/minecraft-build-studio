// Map & lobby pieces: plazas, spawn pads, fountains, game portals, bridges, statues, walls, lamp rings.
// Facade-style pieces use the facade frame (x along, y up, z outward/toward the viewer).
import { Builder, family } from "./builder.ts";
import { BlockSpec, Vec, hash3 } from "./patterns.ts";

type B = Builder;

/** Circular patterned plaza floor at height y (replaces the ground). pattern: rings | compass | tiles. */
export function plaza(b: B, c: Vec, r: number, o: { floor?: BlockSpec; ring?: BlockSpec; accent?: BlockSpec; pattern?: "rings" | "compass" | "tiles"; spokes?: number; border?: BlockSpec | null } = {}) {
  const floor = o.floor ?? { mix: [["polished_andesite", 5], ["andesite", 2], ["stone_bricks", 2]], scale: 2 };
  const ring = o.ring ?? "polished_diorite";
  const accent = o.accent ?? "chiseled_stone_bricks";
  const spokes = o.spokes ?? 8;
  const R = Math.ceil(r);
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > r + 0.5) continue;
      let blk: BlockSpec = floor;
      const ang = Math.atan2(dz, dx);
      const pattern = o.pattern ?? "rings";
      if (d > r - 0.5 && o.border !== null) blk = o.border ?? ring;
      else if (pattern === "rings" && (Math.round(d) % 4 === 0 && d > 1)) blk = ring;
      else if (pattern === "compass" && spokes > 0 && Math.abs(((ang * spokes) / (2 * Math.PI)) - Math.round((ang * spokes) / (2 * Math.PI))) * (d * 2 * Math.PI / spokes) < 0.6 && d > 2) blk = ring;
      else if (pattern === "tiles" && ((Math.floor(dx / 2) + Math.floor(dz / 2)) & 1)) blk = ring;
      if (d < 1.6) blk = accent;
      b.set([c[0] + dx, c[1], c[2] + dz], blk);
    }
}

/** Raised, perfectly symmetric spawn platform with stairs on all four sides. size = half-width. */
export function spawnPad(b: B, c: Vec, o: { size?: number; height?: number; material?: string; top?: BlockSpec; trim?: string } = {}) {
  const s = o.size ?? 6, h = o.height ?? 2;
  const fam = family(o.material ?? "stone_brick");
  const trim = o.trim ? family(o.trim) : fam;
  b.fill([c[0] - s, c[1], c[2] - s], [c[0] + s, c[1] + h - 1, c[2] + s], fam.block);
  plaza(b, [c[0], c[1] + h - 1, c[2]], s - 0.5, { floor: o.top ?? { mix: [["polished_andesite", 3], ["smooth_stone", 1]], scale: 2 }, pattern: "compass", border: null });
  // stairs centred on each side, 3 wide
  for (const [dx, dz, f] of [[0, 1, "north"], [0, -1, "south"], [1, 0, "west"], [-1, 0, "east"]] as const) {
    for (let step = 0; step < h; step++)
      for (let w = -2; w <= 2; w++) {
        const ox = dx !== 0 ? dx * (s + 1 + step) : w, oz = dz !== 0 ? dz * (s + 1 + step) : w;
        const y = c[1] + h - 1 - step;
        b.set([c[0] + ox, y, c[2] + oz], `${fam.stairs}[facing=${f},half=bottom]`);
        if (step > 0) b.fill([c[0] + ox, c[1], c[2] + oz], [c[0] + ox, y - 1, c[2] + oz], fam.block);
      }
  }
  // corner posts with lanterns
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.set([c[0] + sx * s, c[1] + h, c[2] + sz * s], `${trim.wall ?? "stone_brick_wall"}`);
    b.set([c[0] + sx * s, c[1] + h + 1, c[2] + sz * s], "lantern[hanging=false]");
  }
}

/** Tiered round fountain. */
export function fountain(b: B, c: Vec, o: { r?: number; rim?: string; tiers?: number; water?: BlockSpec } = {}) {
  const r = o.r ?? 4;
  const rim = family(o.rim ?? "stone_brick");
  b.circle([c[0], c[1], c[2]], r, rim.block, { filled: false, thickness: 1 });
  b.circle([c[0], c[1] + 1, c[2]], r, `${rim.slab}[type=bottom]`, { filled: false, thickness: 1 });
  b.circle([c[0], c[1] - 1, c[2]], r, rim.block, { filled: true });
  b.circle([c[0], c[1], c[2]], r - 1, o.water ?? "water", { filled: true });
  const tiers = o.tiers ?? 2;
  let y = c[1];
  for (let t = 0; t < tiers; t++) {
    const rr = Math.max(1, Math.round((r - 1) * (0.55 - t * 0.2)));
    b.fill([c[0], y, c[2]], [c[0], y + 2, c[2]], "polished_andesite");
    y += 3;
    b.circle([c[0], y, c[2]], rr, rim.block, { filled: true });
    b.circle([c[0], y + 1, c[2]], rr, `${rim.slab}[type=bottom]`, { filled: false });
    if (rr > 1) b.circle([c[0], y + 1, c[2]], rr - 1, "water", { filled: true });
  }
  b.set([c[0], y + 1, c[2]], "water");
}

/**
 * Game portal / gate in a facade frame (x along, z toward the viewer). Opening w×h centred at x, base y.
 * inner: "nether_portal" | "end_gateway" | any block (e.g. coloured stained glass) | "air". Banners in `color` hang on the pillars.
 */
export function portal(f: B, x: number, y: number, o: { w?: number; h?: number; frame?: string; trim?: string; inner?: BlockSpec; color?: string; pad?: BlockSpec | null; arch?: boolean } = {}) {
  const w = o.w ?? 3, h = o.h ?? 4;
  const fam = family(o.frame ?? "polished_blackstone_brick");
  const trim = o.trim ? family(o.trim) : family("polished_blackstone");
  const x0 = x - Math.floor(w / 2), x1 = x0 + w - 1;
  // pillars (2 wide feel: block + wall)
  for (const px of [x0 - 1, x1 + 1]) {
    f.fill([px, y, 0], [px, y + h, 0], fam.block);
    f.set([px, y, 1], `${fam.stairs}[facing=north,half=bottom]`);
    f.set([px, y + h, 1], `${fam.stairs}[facing=north,half=top]`);
    if (o.color) f.set([px, y + h - 1, 1], `${o.color}_wall_banner[facing=south]`);
  }
  // lintel / arch
  f.fill([x0 - 2, y + h + 1, 0], [x1 + 2, y + h + 1, 0], fam.block);
  f.fill([x0 - 2, y + h + 1, 1], [x1 + 2, y + h + 1, 1], `${trim.slab}[type=top]`);
  f.set([x0 - 2, y + h + 2, 0], `${trim.stairs}[facing=east,half=bottom]`);
  f.set([x1 + 2, y + h + 2, 0], `${trim.stairs}[facing=west,half=bottom]`);
  f.fill([x0 - 1, y + h + 2, 0], [x1 + 1, y + h + 2, 0], `${trim.slab}[type=bottom]`);
  f.set([Math.floor((x0 + x1) / 2), y + h + 2, 0], fam.block);
  if (o.arch !== false && w >= 3) {
    f.set([x0, y + h, 0], `${fam.stairs}[facing=east,half=top]`);
    f.set([x1, y + h, 0], `${fam.stairs}[facing=west,half=top]`);
  }
  // inner surface
  const inner = o.inner ?? "nether_portal";
  const top = o.arch !== false && w >= 3 ? y + h : y + h;
  for (let xx = x0; xx <= x1; xx++)
    for (let yy = y; yy < top + (o.arch !== false && w >= 3 && xx > x0 && xx < x1 ? 1 : 0); yy++) {
      if (inner === "nether_portal") f.set([xx, yy, 0], "nether_portal[axis=x]");
      else f.set([xx, yy, 0], inner);
    }
  if (o.pad !== null) f.fill([x0 - 1, y - 1, 1], [x1 + 1, y - 1, 3], o.pad ?? "polished_blackstone_bricks");
}

/** Straight bridge between two points of equal height (x or z aligned), with railings and an optional arch underneath. */
export function bridge(b: B, a: Vec, c: Vec, o: { width?: number; deck?: BlockSpec; rail?: BlockSpec; arch?: number; support?: BlockSpec; lamps?: number } = {}) {
  const alongX = Math.abs(c[0] - a[0]) >= Math.abs(c[2] - a[2]);
  const len = alongX ? Math.abs(c[0] - a[0]) : Math.abs(c[2] - a[2]);
  const dir = alongX ? Math.sign(c[0] - a[0]) || 1 : Math.sign(c[2] - a[2]) || 1;
  const w = o.width ?? 3;
  const hw = Math.floor(w / 2);
  const y = a[1];
  for (let i = 0; i <= len; i++) {
    const t = len ? i / len : 0;
    const archDrop = o.arch ? Math.round(o.arch * Math.sin(Math.PI * t)) : 0;
    for (let k = -hw; k <= hw; k++) {
      const p: Vec = alongX ? [a[0] + dir * i, y, a[2] + k] : [a[0] + k, y, a[2] + dir * i];
      b.set(p, o.deck ?? { mix: [["spruce_planks", 4], ["stripped_spruce_wood", 1]], scale: 2 });
      // arch beneath
      if (o.arch && (k === -hw || k === hw)) for (let yy = y - 1; yy >= y - 1 - Math.max(0, o.arch - archDrop); yy--) b.set([p[0], yy, p[2]], o.support ?? "stone_bricks");
    }
    for (const k of [-hw - 1, hw + 1]) {
      const p: Vec = alongX ? [a[0] + dir * i, y + 1, a[2] + k] : [a[0] + k, y + 1, a[2] + dir * i];
      b.set(p, o.rail ?? "spruce_fence");
      if (o.lamps && i % o.lamps === 0) b.set([p[0], p[1] + 1, p[2]], "lantern[hanging=false]");
    }
  }
}

/** Pedestal with an obelisk / statue column, optional cap item. */
export function statue(b: B, p: Vec, o: { h?: number; material?: string; accent?: BlockSpec; cap?: BlockSpec } = {}) {
  const h = o.h ?? 6;
  const fam = family(o.material ?? "stone_brick");
  b.fill([p[0] - 1, p[1], p[2] - 1], [p[0] + 1, p[1], p[2] + 1], fam.block);
  for (const [dx, dz, f] of [[0, -2, "south"], [0, 2, "north"], [-2, 0, "east"], [2, 0, "west"]] as const)
    for (let k = -1; k <= 1; k++) b.set([p[0] + (dx || k), p[1], p[2] + (dz || k)], `${fam.stairs}[facing=${f},half=bottom]`);
  b.set([p[0], p[1] + 1, p[2]], o.accent ?? "chiseled_stone_bricks");
  b.fill([p[0], p[1] + 2, p[2]], [p[0], p[1] + h - 2, p[2]], fam.wall ?? "stone_brick_wall");
  b.set([p[0], p[1] + h - 1, p[2]], o.cap ?? "gold_block");
}

/** Wall along a path (map borders, city walls) with crenels and towers every n blocks. */
export function wall(b: B, points: [number, number][], y: number | ((x: number, z: number) => number), o: { h?: number; material?: BlockSpec; cap?: string; towers?: number; towerR?: number } = {}) {
  const h = o.h ?? 6;
  const mat = o.material ?? { mix: [["stone_bricks", 6], ["cracked_stone_bricks", 1], ["mossy_stone_bricks", 1]], scale: 2 };
  const cap = family(o.cap ?? "stone_brick");
  const Y = typeof y === "function" ? y : () => y;
  let run = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const n = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
    for (let s = 0; s <= n; s++, run++) {
      const x = Math.round(ax + ((bx - ax) * s) / (n || 1)), z = Math.round(az + ((bz - az) * s) / (n || 1));
      const g = Y(x, z);
      b.fill([x, g - 2, z], [x, g + h - 1, z], mat);
      b.set([x, g + h, z], run % 2 === 0 ? (cap.wall ?? cap.block) : `${cap.slab}[type=bottom]`);
      if (o.towers && run % o.towers === 0) {
        const r = o.towerR ?? 2.5;
        b.cylinder([x, g - 2, z], r, h + 6, mat);
        b.circle([x, g + h + 4, z], r + 0.6, cap.block, { filled: false });
        b.cone([x, g + h + 5, z], r + 1, Math.round(r * 2.5), "deepslate_tiles");
      }
    }
  }
}

export function lobbyLib() {
  return { plaza, spawnPad, fountain, portal, bridge, statue, wall };
}
void hash3;
