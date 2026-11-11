// SHOP / INFO PAVILION east (ground y9). Main body x47..57 z24..32, entrance porch to the west (toward the plaza path).
const M = shared.cmix;
const G = 9, X0 = 47, X1 = 57, Z0 = 24, Z1 = 32, H = 16;
b.fill([X0 - 1, G - 2, Z0 - 1], [X1 + 1, G, Z1 + 1], M([["cobblestone", 2], ["stone_bricks", 3], ["mossy_stone_bricks", 1]], 2, 81));
b.fill([X0, G, Z0], [X1, G, Z1], M([["spruce_planks", 4], ["stripped_spruce_wood", 1]], 2, 82));
b.walls([X0, G + 1, Z0], [X1, H, Z1], p => p.y <= G + 1 ? "stone_bricks" : M([["calcite", 5], ["white_terracotta", 1]], 3, 83)(p));
b.fill([X0, G + 5, Z0], [X1, G + 5, Z1], "stripped_dark_oak_log[axis=x]", {mask: s => s !== undefined && s !== "air"});
b.edges([X0, G + 1, Z0], [X1, H, Z1], "dark_oak_log");
b.around([X0, G + 1, Z0], [X1, H, Z1], (f, {side, width}) => {
  for (let x = 2; x < width - 2; x += 3) {
    if (side === "west" && x >= 3 && x <= 5) continue;
    lib.window(f, x, 1, {w: 1, h: 2, glass: "glass_pane", sill: "spruce", shutters: "spruce_trapdoor"});
    lib.window(f, x, 6, {w: 1, h: 1, glass: "glass_pane"});
  }
  f.fill([0, 4, 1], [width - 1, 4, 1], "spruce_slab[type=top]", {mask: "empty"});
  if (side === "west") { lib.door(f, 4, 0, {wood: "spruce", width: 2, frame: "dark_oak_log", step: "spruce"}); f.set([3, 3, 1], "oak_hanging_sign[rotation=4]"); }
});
// porch with cross gable facing west
for (const z of [26, 30]) { b.fill([43, G, z], [43, G + 4, z], "dark_oak_log"); b.set([43, G + 5, z], "dark_oak_planks"); }
b.fill([43, G, 26], [46, G, 30], "spruce_planks");
b.fill([43, G + 5, 26], [46, G + 5, 30], "dark_oak_planks", {hollow: false, mask: (s, p) => p.z === 26 || p.z === 30 || p.x === 43});
b.roof({parts: [{a: [X0, Z0], b: [X1, Z1], type: "gable", axis: "z"}, {a: [43, 26], b: [X0, 30], type: "gable", axis: "x"}], y: H + 1, pitch: 1, overhang: 1,
  material: "cut_copper", trim: "dark_oak", ridgeTrim: "dark_oak", gable: "spruce_planks", texture: {material: "exposed_cut_copper", amount: 0.3, scale: 2.5}});
lib.chimney(b, [55, H + 1, 30], 6, {material: "bricks", smoke: true});
// interior: shop counters
log("shop:", lib.furnish(b, [X0 + 1, G + 1, Z0 + 1], [X1 - 1, H - 1, Z1 - 1], {type: "storage", style: "rustic", seed: 8}).join("; "));
// market stalls outside along the path (wool awnings)
for (const [sx, sz, col] of [[45, 20, "orange"], [41, 34, "cyan"]]) {
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) b.fill([sx + dx, shared.hm.at(sx + dx, sz + dz) + 1, sz + dz], [sx + dx, G + 3, sz + dz], "spruce_fence");
  b.fill([sx - 1, G + 4, sz - 1], [sx + 3, G + 4, sz + 3], p => (p.x + p.z) % 2 ? `${col}_wool` : "white_wool");
  b.fill([sx, shared.hm.at(sx, sz) + 1, sz + 1], [sx + 2, shared.hm.at(sx, sz) + 1, sz + 1], "barrel[facing=up]");
  b.set([sx + 1, shared.hm.at(sx, sz) + 2, sz + 1], "melon"); b.set([sx + 2, shared.hm.at(sx, sz) + 2, sz + 1], "pumpkin");
}
