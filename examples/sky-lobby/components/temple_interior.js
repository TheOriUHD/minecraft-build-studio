// INTERIOR: great hall of the Sky Temple. Air box x -11..11, y 24..32, z -63..-45 (door at z=-44, x -2..2)
const M = shared.cmix;
const AX0 = -11, AX1 = 11, AZ0 = -63, AZ1 = -45, Y0 = 24, Y1 = 32;
// floor: polished deepslate with calcite grid, quartz border
const FL = M([["polished_deepslate", 4], ["deepslate_tiles", 1]], 2, 51);
b.fill([AX0, 23, AZ0], [AX1, 23, AZ1], p => (p.x % 4 === 0 || p.z % 4 === 0) ? "calcite" : FL(p));
// ceiling: coffered dark oak with beams
b.fill([AX0, 34, AZ0], [AX1, 34, AZ1], "dark_oak_planks");
for (let z = AZ0 + 1; z <= AZ1; z += 4) b.fill([AX0, 33, z], [AX1, 33, z], "stripped_dark_oak_log[axis=x]");
b.fill([AX0, 33, AZ0], [AX0, 33, AZ1], "stripped_dark_oak_log[axis=z]"); b.fill([AX1, 33, AZ0], [AX1, 33, AZ1], "stripped_dark_oak_log[axis=z]");
// colonnades x = ±7
for (const x of [-7, 7]) for (const z of [-48, -52, -56, -60]) {
  b.set([x, 24, z], "polished_deepslate"); b.fill([x, 25, z], [x, 31, z], "quartz_pillar"); b.set([x, 32, z], "chiseled_quartz_block");
  b.set([x + Math.sign(-x), 32, z], `smooth_quartz_stairs[facing=${x < 0 ? "west" : "east"},half=top]`);
}
// red carpet runner door -> dais
b.fill([-1, 24, -59], [1, 24, -45], "red_carpet"); b.fill([0, 24, -59], [0, 24, -45], "yellow_carpet");
// dais + throne/altar at the north end
b.fill([-5, 24, -63], [5, 24, -61], "polished_blackstone_bricks");
b.fill([-5, 24, -60], [5, 24, -60], "polished_blackstone_brick_stairs[facing=south]");
b.fill([-1, 24, -60], [1, 24, -60], "quartz_stairs[facing=south]");
b.set([0, 25, -62], "quartz_stairs[facing=south]");
b.set([-1, 25, -62], "smooth_quartz_slab[type=top]"); b.set([1, 25, -62], "smooth_quartz_slab[type=top]");
b.fill([-1, 26, -63], [1, 28, -63], "gold_block"); b.set([0, 29, -63], "chiseled_quartz_block");
for (const x of [-4, 4]) { b.set([x, 25, -62], "gold_block"); b.set([x, 26, -62], "soul_lantern"); b.set([x, 25, -61], "candle[candles=3,lit=true]"); }
for (const x of [-3, 3]) b.set([x, 28, -63], `${x < 0 ? "blue" : "light_blue"}_wall_banner[facing=south]`);
// chandeliers on the axis
for (const z of [-48, -54, -60]) {
  b.fill([0, 30, z], [0, 32, z], "iron_chain[axis=y]"); b.set([0, 29, z], "gold_block");
  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) { b.set([dx, 29, z + dz], "smooth_quartz_slab[type=top]"); b.set([dx * 2, 28, z + dz * 2], "lantern[hanging=true]"); b.set([dx * 2, 29, z + dz * 2], "iron_chain[axis=y]"); }
  b.set([0, 28, z], "lantern[hanging=true]");
}
// furnish the side aisles (between colonnade and outer wall)
log("W aisle:", lib.furnish(b, [-11, 24, -59], [-8, 32, -46], {type: "hall", style: "noble", seed: 3}).join("; "));
log("E aisle:", lib.furnish(b, [8, 24, -59], [11, 32, -46], {type: "hall", style: "noble", seed: 4}).join("; "));
// hand-placed: bookshelves + lecterns + plants in the aisles, benches facing the axis
for (const sx of [-1, 1]) {
  for (const z of [-50, -54, -58]) { b.set([sx * 5, 24, z], `dark_oak_stairs[facing=${sx < 0 ? "east" : "west"}]`); b.set([sx * 4, 24, z], `dark_oak_stairs[facing=${sx < 0 ? "east" : "west"}]`); }
  b.set([sx * 9, 24, -62], "potted_flowering_azalea_bush"); b.set([sx * 10, 24, -62], "lectern[facing=south]");
}
for (const sx of [-1, 1]) for (const z of [-62, -58, -54, -50, -46]) { b.fill([sx * 9, 29, z], [sx * 9, 32, z], "iron_chain[axis=y]"); b.set([sx * 9, 28, z], "lantern[hanging=true]"); }
for (const x of [-6, 6, -8, 8]) b.set([x, 25, -63], "candle[candles=4,lit=true]", {mask: "air"});
for (const x of [-6, 6]) { b.set([x, 24, -63], "chiseled_quartz_block"); }
