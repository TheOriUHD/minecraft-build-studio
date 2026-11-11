// VIEWPOINT GAZEBO on the satellite island (ground y11) at (-30,96)
const C = [-30, 11, 96];
b.circle(C, 6, "polished_andesite", {filled: true});
b.circle(C, 6, "stone_brick_slab[type=top]", {filled: false});
b.circle([C[0], 11, C[2]], 2, "cherry_planks", {filled: true});
b.polar([C[0], 12, C[2]], 4, 8, (f) => { f.fill([0, 0, 0], [0, 3, 0], "stripped_cherry_log"); f.set([0, 4, 0], "cherry_planks"); f.set([0, 3, 1], "cherry_trapdoor[facing=south,half=top,open=false]"); }, Math.PI / 8);
const R = [[16, 5.6, "cherry_slab[type=bottom]"], [16, 4.6, "cherry_planks"], [17, 4, "cherry_slab[type=bottom]"], [17, 3, "cherry_planks"], [18, 2.4, "cherry_slab[type=bottom]"], [18, 1.6, "cherry_planks"], [19, 1, "cherry_planks"]];
for (const [y, r, blk] of R) b.circle([C[0], y, C[2]], r, blk, {filled: y >= 19 || r < 2, thickness: 1});
b.circle([C[0], 16, C[2]], 5.6, "dark_oak_slab[type=bottom]", {filled: false});
b.fill([C[0], 20, C[2]], [C[0], 21, C[2]], "cherry_fence"); b.set([C[0], 22, C[2]], "lantern[hanging=false]");
b.set([C[0], 15, C[2]], "lantern[hanging=true]");
// benches looking south over the void, telescope (spyglass stand) on the axis
for (const x of [-2, 2]) b.set([C[0] + x, 12, C[2] + 2], "cherry_stairs[facing=north]");
b.set([C[0], 12, C[2] + 3], "andesite_wall"); b.set([C[0], 13, C[2] + 3], "lightning_rod[facing=south]");
// low railing around the gazebo plaza except the bridge side
for (let a = 0; a < Math.PI * 2; a += 0.12) {
  const x = Math.round(C[0] + Math.sin(a) * 7), z = Math.round(C[2] + Math.cos(a) * 7);
  if (z < C[2] - 4 && Math.abs(x - C[0]) < 3) continue;
  b.set([x, 12, z], "stone_brick_wall");
  b.set([x, 11, z], "stone_bricks");
}
for (let z = 86; z < 90; z++) for (let x = -31; x <= -29; x++) b.set([x, shared.hs.at(x, z), z], "polished_andesite");
