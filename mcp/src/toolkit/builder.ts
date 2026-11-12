// The Builder: the programmable building API exposed to component scripts.
// Every builder has a local frame (origin + orientation). Child frames are made with at()/around()/mirror().
// Coordinates are integers, points are [x, y, z] arrays, all boxes are inclusive.
import { VoxelGrid } from "../voxel.ts";
import { IDENTITY, Orient, compose, rotVec, transformState } from "../blocks/transform.ts";
import { PALETTE, parseState, formatState, isAir } from "../blocks/state.ts";
import { BlockSpec, ResolveCtx, Vec, resolveSpec, noise3 } from "./patterns.ts";
import { assets } from "../blocks/assets.ts";

export interface Sink {
  grid: VoxelGrid;
  ctx: ResolveCtx;
  anchors: Record<string, Vec>;
  warnings: Set<string>;
  limit: number;
  schematics: (name: string) => VoxelGrid;
  prior?: VoxelGrid; // composite of the components compiled before this one
}

type Mask = string | ((state: string | undefined, p: Vec) => boolean);
export interface DrawOpts {
  mask?: Mask; // only write where the current cell matches: "empty", "air", "!air", "solid", a block name, or fn
  hollow?: boolean;
}

const validated = new Map<string, string | null>();

export class Builder {
  constructor(
    readonly sink: Sink,
    readonly origin: Vec = [0, 0, 0],
    readonly orient: Orient = IDENTITY,
  ) {}

  // ---------- frames ----------

  /** Local -> root coordinates. */
  toRoot(p: Vec): Vec {
    const [x, y, z] = rotVec(p[0], p[1], p[2], this.orient);
    return [this.origin[0] + x, this.origin[1] + y, this.origin[2] + z];
  }

  /**
   * Child builder at a local offset. rotate: quarter turns clockwise seen from above (or 90/180/270),
   * mirror: "x" flips local x, "z" flips local z. Block states (stairs, logs, doors...) rotate along.
   */
  at(offset: Vec, opts: { rotate?: number; mirror?: "x" | "z" | null } = {}): Builder {
    let r = opts.rotate ?? 0;
    if (Math.abs(r) >= 4) r = Math.round(r / 90);
    r = ((r % 4) + 4) % 4;
    const local: Orient = { rot: r, mirrorX: opts.mirror === "x", mirrorZ: opts.mirror === "z" };
    return new Builder(this.sink, this.toRoot(offset), compose(this.orient, local));
  }

  /** Repeat fn n times, each in a frame shifted by step*i. */
  repeat(n: number, step: Vec, fn: (b: Builder, i: number) => void) {
    for (let i = 0; i < n; i++) fn(this.at([step[0] * i, step[1] * i, step[2] * i]), i);
  }

  /**
   * Draw fn twice: once normally and once mirrored across the plane axis=center
   * (e.g. mirror("x", 7, b => ...) for a symmetric facade 15 wide; center may be .5 for even widths).
   */
  symmetric(axis: "x" | "z", center: number, fn: (b: Builder, side: 0 | 1) => void) {
    fn(this, 0);
    const off: Vec = axis === "x" ? [2 * center, 0, 0] : [0, 0, 2 * center];
    if (!Number.isInteger(2 * center)) throw new Error("symmetric center must be integer or .5");
    fn(this.at(off, { mirror: axis }), 1);
  }

  /**
   * Rotational symmetry: run fn n times (n = 2 or 4), each time rotated by 360/n degrees around (cx, cz).
   * Use .5 centres for even-sized layouts. Block states rotate along. fn gets (frame, index).
   */
  radial(n: 2 | 4, cx: number, cz: number, fn: (b: Builder, i: number) => void) {
    if (n !== 2 && n !== 4) throw new Error("radial supports n = 2 or 4 (block grids only rotate in 90° steps); use polar() for other counts");
    if (!Number.isInteger(2 * cx) || !Number.isInteger(2 * cz)) throw new Error("radial centre must be integer or .5");
    for (let i = 0; i < n; i++) {
      const q = n === 2 ? i * 2 : i;
      const [rx, , rz] = rotVec(-cx, 0, -cz, { rot: q, mirrorX: false, mirrorZ: false });
      fn(this.at([cx + rx, 0, cz + rz], { rotate: q }), i);
    }
  }

  /** Mirror symmetry on both axes (4 copies) around (cx, cz). fn gets (frame, quadrant 0..3). */
  mirror4(cx: number, cz: number, fn: (b: Builder, q: number) => void) {
    let q = 0;
    this.symmetric("x", cx, (bx) => bx.symmetric("z", cz, (bz) => fn(bz, q++)));
  }

  /**
   * Place n frames evenly on a circle (any n). Each frame's origin is on the circle and it is turned (to the nearest
   * 90°) so that local +z points OUTWARD — design the item as if it stands at the origin facing south.
   * fn gets (frame, index, angleRadians).
   */
  polar(center: Vec, radius: number, n: number, fn: (b: Builder, i: number, angle: number) => void, startAngle = 0) {
    for (let i = 0; i < n; i++) {
      const a = startAngle + (i / n) * Math.PI * 2;
      const x = Math.round(center[0] + Math.sin(a) * radius), z = Math.round(center[2] + Math.cos(a) * radius);
      // outward direction (sin a, cos a); rotation that maps +z (south) to it
      const deg = ((Math.atan2(-Math.sin(a), Math.cos(a)) * 180) / Math.PI + 360) % 360; // clockwise from south
      const q = Math.round(deg / 90) % 4;
      fn(this.at([x, center[1], z], { rotate: q }), i, a);
    }
  }

  /**
   * Run fn for each of the four vertical faces of the box a..b, in a facade frame:
   * local x runs left→right along the wall as seen from OUTSIDE, y up from a.y, z points OUTWARD
   * (z=0 is the wall plane, z<0 is inside). Stairs with facing=south face outward.
   * fn receives (frame, info) where info.width is the wall length and info.side is south/east/north/west.
   */
  around(a: Vec, b: Vec, fn: (f: Builder, info: { side: string; width: number; height: number; index: number }) => void, sides = ["south", "east", "north", "west"]) {
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [z0, z1] = [Math.min(a[2], b[2]), Math.max(a[2], b[2])];
    const y0 = Math.min(a[1], b[1]);
    const height = Math.abs(b[1] - a[1]) + 1;
    const W = x1 - x0 + 1, D = z1 - z0 + 1;
    const defs: Record<string, { o: Vec; rot: number; width: number }> = {
      // facade frames: +z = outward
      south: { o: [x0, y0, z1], rot: 0, width: W },
      east: { o: [x1, y0, z1], rot: 3, width: D },
      north: { o: [x1, y0, z0], rot: 2, width: W },
      west: { o: [x0, y0, z0], rot: 1, width: D },
    };
    sides.forEach((s, i) => {
      const d = defs[s];
      if (!d) throw new Error(`unknown side ${s}`);
      fn(this.at(d.o, { rotate: d.rot }), { side: s, width: d.width, height, index: i });
    });
  }

  // ---------- core writes ----------

  private resolve(spec: BlockSpec, lp: Vec, rp: Vec): string {
    let s = resolveSpec(spec, { x: rp[0], y: rp[1], z: rp[2], lx: lp[0], ly: lp[1], lz: lp[2] }, this.sink.ctx);
    if (!validated.has(s)) {
      const err = assets().validate(s);
      validated.set(s, err);
    }
    const err = validated.get(s);
    if (err) {
      if (err.startsWith("unknown block")) throw new Error(err);
      this.sink.warnings.add(err);
    }
    return transformState(s, this.orient);
  }

  private matches(mask: Mask | undefined, rp: Vec): boolean {
    if (!mask) return true;
    const cur = this.sink.grid.get(rp[0], rp[1], rp[2]);
    if (typeof mask === "function") return mask(cur, rp);
    switch (mask) {
      case "empty":
        return cur === undefined;
      case "air":
        return cur === undefined || isAir(cur);
      case "!air":
      case "solid":
        return cur !== undefined && !isAir(cur);
      default: {
        const neg = mask.startsWith("!");
        const names = (neg ? mask.slice(1) : mask).split("|").map((n) => n.replace(/^minecraft:/, ""));
        const hit = cur !== undefined && names.includes(parseState(cur).name);
        return neg ? !hit : hit;
      }
    }
  }

  /** Place one block. */
  set(p: Vec, block: BlockSpec, opts: DrawOpts = {}) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every((v) => Number.isFinite(v)))
      throw new Error(`set: position must be [x, y, z] numbers, got ${JSON.stringify(p)} (b.each passes [x,y,z] arrays; block-spec functions get {x,y,z,lx,ly,lz})`);
    if (!p.every(Number.isInteger)) p = [Math.round(p[0]), Math.round(p[1]), Math.round(p[2])];
    const rp = this.toRoot(p);
    if (!this.matches(opts.mask, rp)) return;
    const s = this.resolve(block, p, rp);
    const g = this.sink.grid;
    g.setId(rp[0], rp[1], rp[2], PALETTE.id(s));
    if (g.size > this.sink.limit) throw new Error(`block limit exceeded (${this.sink.limit})`);
  }

  /** Current block at a local position in this component (undefined if this component hasn't set it). */
  get(p: Vec): string | undefined {
    const rp = this.toRoot(p);
    return this.sink.grid.get(rp[0], rp[1], rp[2]);
  }

  /**
   * Current block at a local position looking at this component first, then at everything the earlier
   * components built (e.g. to find walls, doors and windows when furnishing a room).
   */
  peek(p: Vec): string | undefined {
    const rp = this.toRoot(p);
    const s = this.sink.grid.get(rp[0], rp[1], rp[2]) ?? this.sink.prior?.get(rp[0], rp[1], rp[2]);
    return s?.replace(/^minecraft:/, "");
  }

  /** Remove a block from this component's output (does NOT carve; use clear() to write air). */
  unset(p: Vec) {
    const rp = this.toRoot(p);
    this.sink.grid.delete(rp[0], rp[1], rp[2]);
  }

  /** Record a named point (in root coordinates) that later components can read via anchors["comp.name"]. */
  anchor(name: string, p: Vec) {
    this.sink.anchors[name] = this.toRoot(p);
  }

  /** Iterate every cell of the inclusive box. */
  each(a: Vec, b: Vec, fn: (p: Vec) => void) {
    const [x0, x1] = order(a[0], b[0]), [y0, y1] = order(a[1], b[1]), [z0, z1] = order(a[2], b[2]);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) fn([x, y, z]);
  }

  /** Solid cuboid (hollow:true leaves the inside untouched). */
  fill(a: Vec, b: Vec, block: BlockSpec, opts: DrawOpts = {}) {
    const [x0, x1] = order(a[0], b[0]), [y0, y1] = order(a[1], b[1]), [z0, z1] = order(a[2], b[2]);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          if (opts.hollow && x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1) continue;
          this.set([x, y, z], block, opts);
        }
  }

  /** Hollow box shell. */
  box(a: Vec, b: Vec, block: BlockSpec, opts: DrawOpts = {}) {
    this.fill(a, b, block, { ...opts, hollow: true });
  }

  /** Only the four vertical sides of the box (no floor/ceiling). */
  walls(a: Vec, b: Vec, block: BlockSpec, opts: DrawOpts = {}) {
    const [x0, x1] = order(a[0], b[0]), [y0, y1] = order(a[1], b[1]), [z0, z1] = order(a[2], b[2]);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || z === z0 || z === z1) this.set([x, y, z], block, opts);
  }

  /** The 12 edges of a box (frames, timber outlines). */
  edges(a: Vec, b: Vec, block: BlockSpec, opts: DrawOpts = {}) {
    const [x0, x1] = order(a[0], b[0]), [y0, y1] = order(a[1], b[1]), [z0, z1] = order(a[2], b[2]);
    this.each([x0, y0, z0], [x1, y1, z1], (p) => {
      const ex = p[0] === x0 || p[0] === x1, ey = p[1] === y0 || p[1] === y1, ez = p[2] === z0 || p[2] === z1;
      if (+ex + +ey + +ez >= 2) this.set(p, block, opts);
    });
  }

  /** Write air (carves through blocks from earlier components too). */
  clear(a: Vec, b: Vec = a) {
    this.fill(a, b, "air");
  }

  /** Replace blocks of this component within a box. from: block name(s) "a|b" or mask. */
  replace(a: Vec, b: Vec, from: Mask, to: BlockSpec) {
    this.fill(a, b, to, { mask: from });
  }

  /** 3D line (Bresenham-like, gap-free). width>1 makes a square brush. */
  line(a: Vec, b: Vec, block: BlockSpec, opts: DrawOpts & { width?: number } = {}) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const n = Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2]));
    const w = opts.width ?? 1;
    const r0 = -Math.floor((w - 1) / 2), r1 = Math.ceil((w - 1) / 2);
    const seen = new Set<string>();
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const p: Vec = [Math.round(a[0] + d[0] * t), Math.round(a[1] + d[1] * t), Math.round(a[2] + d[2] * t)];
      for (let dx = r0; dx <= r1; dx++)
        for (let dy = r0; dy <= r1; dy++)
          for (let dz = r0; dz <= r1; dz++) {
            const q: Vec = [p[0] + dx, p[1] + dy, p[2] + dz];
            const k = q.join(",");
            if (seen.has(k)) continue;
            seen.add(k);
            this.set(q, block, opts);
          }
    }
  }

  /** Connected line segments through points. */
  path(points: Vec[], block: BlockSpec, opts: DrawOpts & { width?: number; closed?: boolean } = {}) {
    for (let i = 0; i < points.length - 1; i++) this.line(points[i], points[i + 1], block, opts);
    if (opts.closed && points.length > 2) this.line(points[points.length - 1], points[0], block, opts);
  }

  /** Smooth Catmull-Rom curve through control points (arches, organic walls, paths, tree branches). */
  curve(points: Vec[], block: BlockSpec, opts: DrawOpts & { width?: number; closed?: boolean; samples?: number } = {}) {
    const pts = opts.closed ? [points[points.length - 1], ...points, points[0], points[1]] : [points[0], ...points, points[points.length - 1]];
    const out: Vec[] = [];
    for (let i = 1; i < pts.length - 2; i++) {
      const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
      const steps = opts.samples ?? Math.max(2, Math.ceil(len * 2));
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        const c = (k: number) =>
          0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
        out.push([Math.round(c(0)), Math.round(c(1)), Math.round(c(2))]);
      }
    }
    out.push(opts.closed ? points[0] : points[points.length - 1]);
    this.path(out, block, opts);
  }

  /** Disk or ring in a plane. axis = normal of the plane ("y" = horizontal disk). */
  circle(center: Vec, r: number, block: BlockSpec, opts: DrawOpts & { filled?: boolean; axis?: "x" | "y" | "z"; thickness?: number } = {}) {
    const filled = opts.filled ?? true;
    const th = opts.thickness ?? 1;
    const R = Math.ceil(r);
    for (let u = -R; u <= R; u++)
      for (let v = -R; v <= R; v++) {
        const d = Math.hypot(u, v);
        if (d > r + 0.5) continue;
        if (!filled && d <= r + 0.5 - th) continue;
        const p: Vec = opts.axis === "x" ? [center[0], center[1] + u, center[2] + v] : opts.axis === "z" ? [center[0] + u, center[1] + v, center[2]] : [center[0] + u, center[1], center[2] + v];
        this.set(p, block, opts);
      }
  }

  /** Vertical (default) cylinder from base center upward. hollow → tube of given thickness. */
  cylinder(base: Vec, r: number, h: number, block: BlockSpec, opts: DrawOpts & { thickness?: number; axis?: "x" | "y" | "z" } = {}) {
    const axis = opts.axis ?? "y";
    for (let i = 0; i < h; i++) {
      const c: Vec = axis === "y" ? [base[0], base[1] + i, base[2]] : axis === "x" ? [base[0] + i, base[1], base[2]] : [base[0], base[1], base[2] + i];
      this.circle(c, r, block, { ...opts, axis, filled: !opts.hollow, thickness: opts.thickness ?? 1 });
    }
  }

  /** Cone / spire: radius r at base shrinking to 0 at height h. */
  cone(base: Vec, r: number, h: number, block: BlockSpec, opts: DrawOpts = {}) {
    for (let i = 0; i < h; i++) {
      const rr = r * (1 - i / h);
      this.circle([base[0], base[1] + i, base[2]], rr, block, { ...opts, filled: !opts.hollow });
    }
  }

  /** Ellipsoid; radii [rx, ry, rz]. half: "top"|"bottom" for domes / bowls. */
  ellipsoid(center: Vec, radii: Vec | number, block: BlockSpec, opts: DrawOpts & { thickness?: number; half?: "top" | "bottom" } = {}) {
    const [rx, ry, rz] = typeof radii === "number" ? [radii, radii, radii] : radii;
    const th = opts.thickness ?? 1;
    const X = Math.ceil(rx), Y = Math.ceil(ry), Z = Math.ceil(rz);
    for (let y = opts.half === "top" ? 0 : -Y; y <= (opts.half === "bottom" ? 0 : Y); y++)
      for (let z = -Z; z <= Z; z++)
        for (let x = -X; x <= X; x++) {
          const d = (x / (rx + 0.5)) ** 2 + (y / (ry + 0.5)) ** 2 + (z / (rz + 0.5)) ** 2;
          if (d > 1) continue;
          if (opts.hollow) {
            const di = (x / Math.max(0.01, rx + 0.5 - th)) ** 2 + (y / Math.max(0.01, ry + 0.5 - th)) ** 2 + (z / Math.max(0.01, rz + 0.5 - th)) ** 2;
            if (di < 1) continue;
          }
          this.set([center[0] + x, center[1] + y, center[2] + z], block, opts);
        }
  }

  sphere(center: Vec, r: number, block: BlockSpec, opts: DrawOpts & { thickness?: number; half?: "top" | "bottom" } = {}) {
    this.ellipsoid(center, [r, r, r], block, opts);
  }

  /** Vertical prism from a 2D polygon [[x,z],...] between heights y0..y1. hollow → outline only. */
  polygon(points: [number, number][], y0: number, y1: number, block: BlockSpec, opts: DrawOpts = {}) {
    const xs = points.map((p) => p[0]), zs = points.map((p) => p[1]);
    const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const inside = (x: number, z: number) => {
      let c = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, zi] = points[i], [xj, zj] = points[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
      }
      return c;
    };
    const cells = new Set<string>();
    for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) if (inside(x + 0.5, z + 0.5)) cells.add(`${x},${z}`);
    // include the outline itself
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      for (let s = 0; s <= n; s++) cells.add(`${Math.round(a[0] + ((b[0] - a[0]) * s) / (n || 1))},${Math.round(a[1] + ((b[1] - a[1]) * s) / (n || 1))}`);
    }
    for (const c of cells) {
      const [x, z] = c.split(",").map(Number);
      if (opts.hollow) {
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !cells.has(`${x + dx},${z + dz}`));
        if (!edge) continue;
      }
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set([x, y, z], block, opts);
    }
  }

  /**
   * Arch / opening shape in the XY plane of this frame (good in facade frames from around()).
   * Carves (or fills) the region x0..x1, from y0 up to a rounded or pointed top. style: "round" | "pointed" | "flat" | "segmental".
   */
  arch(x0: number, x1: number, y0: number, height: number, block: BlockSpec = "air", opts: DrawOpts & { style?: "round" | "pointed" | "flat" | "segmental"; z?: number; depth?: number } = {}) {
    const style = opts.style ?? "round";
    const w = x1 - x0 + 1;
    const cx = (x0 + x1) / 2;
    const half = w / 2;
    const depth = opts.depth ?? 1;
    const z0 = opts.z ?? 0;
    for (let x = x0; x <= x1; x++) {
      const dx = Math.abs(x - cx);
      let top: number;
      if (style === "flat") top = height - 1;
      else if (style === "round") {
        const spring = height - Math.ceil(half);
        top = spring + Math.floor(Math.sqrt(Math.max(0, half * half - dx * dx)) + 0.3);
      } else if (style === "segmental") {
        const spring = height - Math.max(1, Math.round(half / 2));
        top = spring + Math.round((Math.max(1, Math.round(half / 2))) * (1 - (dx / half) ** 2));
      } else {
        // pointed (gothic): two arcs of radius w centered at opposite springs
        const spring = height - Math.ceil(w * 0.85);
        const r = w;
        const ox = x <= cx ? x1 + 0.5 : x0 - 0.5;
        top = spring + Math.floor(Math.sqrt(Math.max(0, r * r - (x - ox) ** 2)));
        top = Math.min(top, height - 1);
      }
      for (let y = y0; y <= y0 + top; y++) for (let z = z0; z > z0 - depth; z--) this.set([x, y, z], block, opts);
    }
  }

  // ---------- roofs ----------

  /**
   * Roofs from stairs/slabs with correct facing, hips, valleys and overhangs.
   * parts: one or more rectangles {a:[x,_,z], b:[x,_,z], type, axis}; heights of overlapping parts merge with max()
   * (so cross-gables and L/T plans produce proper valleys).
   * y: height of the roof base (first layer sits on top of the walls when y = wallTop+1).
   * pitch: rise per block: 0.5 (slabs), 1 (stairs), 2 (steep) or an array of rises per step (e.g. [2,2,1,1,0.5] gambrel).
   * material: base name like "dark_oak" / "deepslate_tile" / "spruce" or {stairs, slab, block}.
   */
  roof(opts: {
    parts?: { a: Vec | [number, number]; b: Vec | [number, number]; type?: "gable" | "hip" | "shed" | "flat"; axis?: "x" | "z"; lowSide?: "north" | "south" | "east" | "west" }[];
    a?: Vec | [number, number];
    b?: Vec | [number, number];
    type?: "gable" | "hip" | "shed" | "flat";
    axis?: "x" | "z";
    lowSide?: "north" | "south" | "east" | "west";
    y: number;
    pitch?: number | number[];
    overhang?: number;
    gableOverhang?: number;
    material: string | { stairs: string; slab: string; block: string };
    gable?: BlockSpec | null; // fill for the triangular gable end walls
    underside?: BlockSpec | null; // block placed under each roof cell inside the footprint (ceiling/shell)
    ridge?: "slab" | "block" | "none";
    hollow?: boolean;
    trim?: string | { stairs: string; slab: string; block: string } | null; // contrasting outline on eaves + rakes
    ridgeTrim?: string | { stairs: string; slab: string; block: string } | null; // material for the ridge cap
    texture?: { material: string; amount?: number; scale?: number } | null; // clustered second material on the planes
  }) {
    const mat0 = family(opts.material);
    const trimMat = opts.trim ? family(opts.trim) : null;
    let ridgeMat: { block: string; stairs: string; slab: string } | null = null;
    if (opts.ridgeTrim) {
      try {
        ridgeMat = family(opts.ridgeTrim);
      } catch {
        // a plain block (e.g. "gold_block") without stairs/slabs: use it as a full-block ridge cap
        const blk = typeof opts.ridgeTrim === "string" ? opts.ridgeTrim : opts.ridgeTrim.block;
        ridgeMat = { block: blk, slab: blk, stairs: mat0.stairs };
      }
    }
    const texMat = opts.texture ? family(opts.texture.material) : null;
    const parts = opts.parts ?? [{ a: opts.a!, b: opts.b!, type: opts.type, axis: opts.axis, lowSide: opts.lowSide }];
    const ov = opts.overhang ?? 1;
    const gov = opts.gableOverhang ?? ov;
    const xz = (v: Vec | [number, number]): [number, number] => (v.length === 3 ? [v[0], v[2]] : [v[0], v[1]]);
    const rises = Array.isArray(opts.pitch) ? opts.pitch : null;
    const p = typeof opts.pitch === "number" ? opts.pitch : 1;
    // cumulative surface height (in half blocks) after d steps
    // (cumulative rounding, so fractional pitches like 0.75 / 1.5 average out correctly)
    const T = (d: number) => {
      let t = 0;
      for (let i = 0; i < d; i++) t += rises ? rises[Math.min(i, rises.length - 1)] : p;
      return Math.round(2 * t);
    };
    // Heightfield over union of parts (expanded by overhang), measured in "distance" units then converted.
    const H = new Map<string, number>(); // half-block surface height relative to base
    const inFoot = new Set<string>();
    const gableCells: [number, number, number][] = []; // x,z,partIndex
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    parts.forEach((part, pi) => {
      const [ax, az] = xz(part.a), [bx, bz] = xz(part.b);
      const [x0, x1] = order(ax, bx), [z0, z1] = order(az, bz);
      const type = part.type ?? "gable";
      const axis = part.axis ?? (x1 - x0 >= z1 - z0 ? "x" : "z");
      const ex = type === "gable" && axis === "x" ? gov : ov;
      const ez = type === "gable" && axis === "z" ? gov : ov;
      for (let z = z0 - ez; z <= z1 + ez; z++)
        for (let x = x0 - ex; x <= x1 + ex; x++) {
          let d: number;
          const dxe = Math.min(x - (x0 - ov), x1 + ov - x);
          const dze = Math.min(z - (z0 - ov), z1 + ov - z);
          if (type === "flat") d = ov;
          else if (type === "hip") d = Math.min(dxe, dze);
          else if (type === "shed") {
            const low = part.lowSide ?? (axis === "x" ? "south" : "east");
            d = low === "south" ? z1 + ov - z : low === "north" ? z - (z0 - ov) : low === "east" ? x1 + ov - x : x - (x0 - ov);
          } else d = axis === "x" ? dze : dxe;
          const h = T(d) - T(ov);
          const k = `${x},${z}`;
          if (!H.has(k) || H.get(k)! < h) H.set(k, h);
          if (x >= x0 && x <= x1 && z >= z0 && z <= z1) inFoot.add(k);
          if (type === "gable" && ((axis === "x" && (x === x0 || x === x1)) || (axis === "z" && (z === z0 || z === z1))) && x >= x0 && x <= x1 && z >= z0 && z <= z1)
            gableCells.push([x, z, pi]);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
    });
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const p0 = parts[0];
    const firstGableAxis = (p0.type ?? "gable") === "gable"
      ? (p0.axis ?? (Math.abs(xz(p0.b)[0] - xz(p0.a)[0]) >= Math.abs(xz(p0.b)[1] - xz(p0.a)[1]) ? "x" : "z"))
      : null;
    const N: [string, number, number][] = [["north", 0, -1], ["south", 0, 1], ["east", 1, 0], ["west", -1, 0]];
    const base = opts.y;
    const isEdge = (x: number, z: number) => N.some(([, dx, dz]) => !H.has(`${x + dx},${z + dz}`));
    const tex = opts.texture;
    const matAt = (x: number, z: number, ridgeCell = false) => {
      if (ridgeCell && ridgeMat) return ridgeMat;
      if (trimMat && isEdge(x, z)) return trimMat;
      if (texMat && tex && noise3(x, 0, z, tex.scale ?? 2.5, 4242) < (tex.amount ?? 0.3)) return texMat;
      return mat0;
    };
    for (const [k, h] of H) {
      const [x, z] = k.split(",").map(Number);
      let mat = matAt(x, z);
      // up-slope neighbour: highest neighbour, ties broken towards the roof centre
      let best: string | null = null, bestH = h, bestT = -Infinity, tie: string | null = null;
      const slopeAxisZ = firstGableAxis ? firstGableAxis === "x" : maxX - minX >= maxZ - minZ;
      for (const [dn, dx, dz] of N) {
        const nh = H.get(`${x + dx},${z + dz}`);
        if (nh === undefined) continue;
        const tw = towards(dx, dz, x, z, cx, cz);
        if (nh > h && (nh > bestH || (nh === bestH && tw > bestT))) {
          best = dn;
          bestH = nh;
          bestT = tw;
        } else if (nh === h && tw > 0 && (slopeAxisZ ? dz !== 0 : dx !== 0)) {
          // two-row ridge: equal neighbour across the ridge, and the cell behind us is lower
          const behind = H.get(`${x - dx},${z - dz}`);
          if (behind === undefined || behind < h) tie = dn;
        }
      }
      const delta = best ? bestH - h : 0;
      const y = base + Math.floor(h / 2);
      const halfUp = h % 2 !== 0;
      if (best && delta >= 2) {
        if (halfUp) this.set([x, y, z], mat.block); // full block (a top slab would leave a see-through gap)
        const sy = halfUp ? y + 1 : y;
        // rise to the up-slope neighbour's surface: full blocks, then a stair for the last block of rise
        const r = Math.floor((bestH - (halfUp ? h + 1 : h)) / 2);
        for (let i = 0; i < r - 1; i++) this.set([x, sy + i, z], mat.block);
        this.set([x, sy + Math.max(0, r - 1), z], `${mat.stairs}[facing=${best},half=bottom]`);
      } else if (best && delta === 1) {
        if (halfUp) this.set([x, y, z], `${mat.slab}[type=bottom]`);
        else this.set([x, y - 1, z], `${mat.slab}[type=top]`);
      } else {
        // ridge / flat cell
        const ridge = opts.ridge ?? "slab";
        if (ridgeMat && !tie) mat = ridgeMat;
        if (tie && !halfUp && h > 0 && !parts.every((pt) => pt.type === "flat")) {
          this.set([x, y, z], `${mat.stairs}[facing=${tie},half=bottom]`);
        } else if (halfUp) this.set([x, y, z], `${mat.slab}[type=bottom]`);
        else {
          this.set([x, y - 1, z], mat.block);
          if (ridge === "slab") this.set([x, y, z], `${mat.slab}[type=bottom]`);
          else if (ridge === "block") this.set([x, y, z], mat.block);
        }
      }
      if (opts.underside && inFoot.has(k)) this.set([x, y - (halfUp ? 0 : 1) - (best && delta >= 2 ? 0 : 1), z], opts.underside, { mask: "empty" });
      if (!opts.hollow && inFoot.has(k) && !opts.underside) {
        // nothing: shell roofs are hollow by default
      }
    }
    // Close vertical gaps where neighbouring roof cells differ by more than one step (valleys, wing junctions).
    for (const [k, h] of H) {
      const [x, z] = k.split(",").map(Number);
      const y = base + Math.floor(h / 2);
      let lowest = Infinity;
      for (const [, dx, dz] of N) {
        const nh = H.get(`${x + dx},${z + dz}`);
        // a half-height neighbour (bottom slab) leaves its upper half open → our column must cover that level too
        if (nh !== undefined && nh < h) lowest = Math.min(lowest, base + Math.floor(nh / 2) + (nh % 2 ? 0 : 1));
      }
      for (let yy = lowest; yy <= y - 1; yy++) this.set([x, yy, z], mat0.block, { mask: "empty" });
    }
    if (opts.gable) {
      for (const [x, z] of gableCells) {
        const h = H.get(`${x},${z}`)!;
        const top = base + Math.floor(h / 2) - 1;
        for (let y = base; y <= top; y++) this.set([x, y, z], opts.gable, { mask: "empty" });
      }
    }
  }

  // ---------- schematics ----------

  /** Paste a schematic from the project's schematics/ folder. Its min corner lands at `at`. */
  paste(name: string, at: Vec = [0, 0, 0], opts: { rotate?: number; mirror?: "x" | "z"; ignoreAir?: boolean } = {}) {
    const g = this.sink.schematics(name);
    const f = this.at(at, opts);
    const bb = g.bounds(true);
    if (!bb) return;
    for (const [x, y, z, id] of g.entries()) {
      if (id === 0 && (opts.ignoreAir ?? true)) continue;
      f.set([x - bb.min[0], y - bb.min[1], z - bb.min[2]], PALETTE.get(id));
    }
  }
}

function order(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}
function towards(dx: number, dz: number, x: number, z: number, cx: number, cz: number) {
  return dx * (cx - x) + dz * (cz - z);
}

/** Derive {block, stairs, slab, wall} names from a material base like "stone_brick", "dark_oak", "deepslate_tile". */
/** Palette of the project currently compiling (lets family("$roof") resolve palette references). */
export const current: { palette: Record<string, any> } = { palette: {} };

export function family(base0: string | { stairs: string; slab: string; block: string }): { block: string; stairs: string; slab: string; wall?: string; fence?: string } {
  if (typeof base0 === "object") return base0;
  let base = base0;
  for (let i = 0; i < 5 && base.startsWith("$"); i++) {
    const v = current.palette[base.slice(1)];
    if (v === undefined) throw new Error(`palette has no entry '${base.slice(1)}'`);
    if (typeof v === "object" && !Array.isArray(v) && v.stairs) return v;
    if (typeof v !== "string") throw new Error(`palette entry '${base0}' must be a plain material name to derive stairs/slabs (got ${JSON.stringify(v)})`);
    base = v;
  }
  const db = assets();
  const b = base.replace(/^minecraft:/, "").replace(/_(stairs|slab|wall)$/, "");
  const stem = b.replace(/s$/, "");
  const pick = (cands: string[]) => cands.find((c) => db.has(c));
  const block = pick([`${b}_planks`, b, `${b}s`, `${stem}s`, stem]);
  const stairs = pick([`${b}_stairs`, `${stem}_stairs`, `${b.replace(/_block$/, "")}_stairs`]);
  const slab = pick([`${b}_slab`, `${stem}_slab`, `${b.replace(/_block$/, "")}_slab`]);
  const wall = pick([`${b}_wall`, `${stem}_wall`]);
  const fence = pick([`${b}_fence`]);
  if (!block || !stairs || !slab) throw new Error(`cannot derive block/stairs/slab from material '${base}' (block=${block}, stairs=${stairs}, slab=${slab}). Pass {block, stairs, slab} explicitly.`);
  return { block, stairs, slab, wall, fence };
}

export { formatState };
