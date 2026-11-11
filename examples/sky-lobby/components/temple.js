// HERO: Sky Temple. Ground y=20 (pad), floor top y=23. Strict symmetry about x=0.
const M = shared.cmix;
const BASE = M([["deepslate_bricks", 5], ["cracked_deepslate_bricks", 1], ["polished_deepslate", 2]], 2, 41);
const WALL = p => p.y <= 25 ? BASE : p.y <= 27 ? M([["smooth_quartz", 3], ["calcite", 2], ["diorite", 1]], 2, 42)(p) : M([["smooth_quartz", 6], ["calcite", 1]], 3, 43)(p);
const X0 = -12, X1 = 12, Z0 = -64, Z1 = -44, F = 23, TOP = 34;
// --- plinth: 3 stepped tiers with stair edges
for (let t = 0; t < 3; t++) {
  const e = 22 - t, y = 21 + t, zn = -74 + t, zs = -33 - t;
  b.fill([-e, 20, zn], [e, y, zs], BASE);
  b.fill([-e, y, zn], [e, y, zn], `polished_deepslate_stairs[facing=south]`);
  b.fill([-e, y, zs], [e, y, zs], `polished_deepslate_stairs[facing=north]`);
  b.fill([-e, y, zn], [-e, y, zs], `polished_deepslate_stairs[facing=east]`);
  b.fill([e, y, zn], [e, y, zs], `polished_deepslate_stairs[facing=west]`);
}
const PT = M([["polished_deepslate", 3], ["deepslate_tiles", 2]], 2, 44);
b.fill([-19, F, -71], [19, F, -36], p => (Math.abs(p.x) === 19 || p.z === -71 || p.z === -36) ? "smooth_quartz" : (Math.abs(p.x) <= 2 && p.z > -44) ? (p.x === 0 ? "gold_block" : "smooth_quartz") : ((p.x + 100) % 6 === 0 && (p.z + 100) % 6 === 0) ? "chiseled_quartz_block" : PT(p));
// courtyard planters with cherry trees + lamp posts flanking the axis
for (const sx of [-1, 1]) {
  const x = sx * 15;
  b.fill([x - 1, F + 1, -38], [x + 1, F + 1, -36], "polished_deepslate"); b.fill([x - 1, F + 1, -37], [x + 1, F + 1, -37], "moss_block");
  b.set([x, F + 1, -37], "dirt"); lib.tree(b, [x, F + 2, -37], {type: "cherry", height: 7, radius: 3, seed: 5 + sx});
  for (const z of [-41, -47, -53, -59, -65]) { if (Math.abs(x) - 2 < 13 && z < -40) continue; }
  for (const z of [-38]) { b.set([sx * 9, F + 1, z + 1], "polished_deepslate"); b.fill([sx * 9, F + 2, z + 1], [sx * 9, F + 3, z + 1], "polished_deepslate_wall"); b.set([sx * 9, F + 4, z + 1], "gold_block"); b.set([sx * 9, F + 5, z + 1], "lantern[hanging=false]"); }
}
// grand stair on the axis (7 wide) through the plinth tiers
for (let s = 0; s < 3; s++) b.fill([-4, 21 + s, -33 - s], [4, 21 + s, -33 - s], "quartz_stairs[facing=south]");
b.fill([-5, 21, -36], [-5, 23, -33], "polished_deepslate_wall"); b.fill([5, 21, -36], [5, 23, -33], "polished_deepslate_wall");
// --- main hall walls (hollow)
b.walls([X0, F + 1, Z0], [X1, TOP, Z1], WALL);
b.fill([X0, TOP - 1, Z0], [X1, TOP - 1, Z1], "chiseled_quartz_block", {mask: (s) => s !== undefined && s !== "air"}); // frieze band
b.around([X0, F + 1, Z0], [X1, TOP, Z1], (f, {side, width}) => {
  // pilasters proud of the wall every 4 blocks, gold capital
  for (let x = 0; x < width; x += 4) {
    f.fill([x, 0, 1], [x, 9, 1], "quartz_pillar");
    f.set([x, 0, 1], "polished_deepslate"); f.set([x, 1, 1], "polished_deepslate_stairs[facing=north]");
    f.set([x, 10, 1], "smooth_quartz_stairs[facing=north,half=top]");
  }
  // cornice
  f.fill([-1, 11, 1], [width, 11, 1], "smooth_quartz_stairs[facing=north,half=top]");
  f.fill([-1, 2, 1], [width, 2, 1], "polished_deepslate_slab[type=bottom]", {mask: "empty"});
  for (let x = 2; x < width - 1; x += 4) {
    if (side === "south" && Math.abs(x + 1 - (width - 1) / 2) < 3) continue;
    lib.window(f, x, 4, {w: 2, h: 5, glass: "light_blue_stained_glass_pane", arch: "round", sill: "smooth_quartz", inset: 0});
  }
  if (side === "south") {
    const c = (width - 1) / 2;
    f.fill([c - 2, 0, 0], [c + 2, 5, 0], "air"); f.arch(c - 2, c + 2, 4, 3, "air", {style: "round"});
    f.fill([c - 3, 0, 1], [c - 3, 7, 1], "gold_block"); f.fill([c + 3, 0, 1], [c + 3, 7, 1], "gold_block");
  }
});
b.anchor("door", [0, F + 1, Z1 + 1]);
// --- main roof (hip) with line-work
b.roof({a: [X0, Z0], b: [X1, Z1], y: TOP + 1, type: "hip", axis: "z", pitch: 0.75, overhang: 2,
  material: "deepslate_tile", trim: "smooth_quartz", ridgeTrim: {block:"gold_block",stairs:"smooth_quartz_stairs",slab:"smooth_quartz_slab"}, texture: {material: "deepslate_brick", amount: 0.2, scale: 2.5}, underside: "dark_oak_planks"});
// --- portico: 6 columns + pediment
for (const x of [-7, -4, 4, 7]) for (const z of [-38]) {
  lib.column(b, [x, F + 1, z], 10, {shaft: "quartz_pillar", base: "polished_deepslate", capital: "chiseled_quartz_block"});
}
for (const x of [-7, 7]) lib.column(b, [x, F + 1, -41], 10, {shaft: "quartz_pillar", base: "polished_deepslate", capital: "chiseled_quartz_block"});
b.fill([-8, F + 11, -44], [8, F + 11, -37], "smooth_quartz");
b.fill([-8, F + 12, -37], [8, F + 12, -37], "gold_block");
b.roof({a: [-8, -44], b: [8, -37], y: F + 12, type: "gable", axis: "z", pitch: 0.5, overhang: 1, material: "deepslate_tile",
  trim: "smooth_quartz", ridgeTrim: "smooth_quartz", gable: "smooth_quartz"});
b.set([0, F + 15, -37], "chiseled_quartz_block"); b.set([-3, F + 13, -37], "gold_block"); b.set([3, F + 13, -37], "gold_block");
b.set([0, F + 15, -36], "gold_block"); b.set([0, F + 14, -36], "chiseled_quartz_block");
// --- front towers (7x7) with steep flared roofs
for (const sx of [-1, 1]) {
  const cx = sx * 16, a = [cx - 3, -47], c = [cx + 3, -41];
  b.walls([a[0], F + 1, a[1]], [c[0], 44, c[1]], WALL);
  b.fill([a[0] + 1, F + 1, a[1] + 1], [c[0] - 1, 44, c[1] - 1], "air");
  b.edges([a[0], F + 1, a[1]], [c[0], 44, c[1]], "quartz_pillar[axis=y]");
  b.around([a[0], F + 1, a[1]], [c[0], 44, c[1]], (f) => {
    lib.window(f, 3, 9, {h: 3, glass: "light_blue_stained_glass_pane", arch: "round", sill: "smooth_quartz"});
    lib.window(f, 3, 16, {h: 3, glass: "light_blue_stained_glass_pane", arch: "pointed", sill: "smooth_quartz"});
    f.fill([-1, 13, 1], [7, 13, 1], "smooth_quartz_slab[type=top]");
    f.fill([-1, 21, 1], [7, 21, 1], "smooth_quartz_stairs[facing=north,half=top]");
  });
  b.roof({a, b: c, y: 45, type: "hip", axis: "x", pitch: [0.5, 2, 2, 2, 3], overhang: 1, material: "deepslate_tile", trim: "smooth_quartz", ridgeTrim: {block:"gold_block",stairs:"smooth_quartz_stairs",slab:"smooth_quartz_slab"}});
  b.fill([cx, 52, -44], [cx, 55, -44], "gold_block"); b.set([cx, 56, -44], "lightning_rod");
}
// --- central lantern tower rising out of the roof
const T0 = -5, T1 = 5, TZ0 = -59, TZ1 = -49;
b.walls([T0, TOP, TZ0], [T1, 47, TZ1], WALL);
b.edges([T0, TOP, TZ0], [T1, 47, TZ1], "quartz_pillar[axis=y]");
b.around([T0, TOP, TZ0], [T1, 47, TZ1], (f) => {
  for (const x of [2, 5, 8]) lib.window(f, x, 7, {h: 4, glass: "yellow_stained_glass_pane", arch: "round"});
  f.fill([-1, 12, 1], [11, 12, 1], "smooth_quartz_stairs[facing=north,half=top]");
  f.fill([-1, 5, 1], [11, 5, 1], "gold_block", {mask: "empty"});
});
b.roof({a: [T0, TZ0], b: [T1, TZ1], y: 48, type: "hip", axis: "x", pitch: [0.5, 1.5, 2, 2, 2, 3], overhang: 1, material: "deepslate_tile", trim: "smooth_quartz", ridgeTrim: {block:"gold_block",stairs:"smooth_quartz_stairs",slab:"smooth_quartz_slab"}});
b.fill([0, 60, -54], [0, 64, -54], "gold_block"); b.set([0, 65, -54], "end_rod");
log("temple ok");
