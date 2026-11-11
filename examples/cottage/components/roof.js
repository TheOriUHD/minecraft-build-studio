const W = 15, D = 11;
// Steeper medieval roof: 45° at the eaves, steepening toward the ridge.
const pitch = [1, 1, 1, 2, 2, 2, 2];
b.roof({ parts: [
    {a:[0,-1], b:[W-1,D], type:"gable", axis:"x"},
    {a:[4,D], b:[10,D+3], type:"gable", axis:"z"},
  ], y:10, material:"spruce", pitch, overhang:1, gable:"$plaster", trim:"dark_oak", ridgeTrim:"stone_brick", texture:{material:"dark_oak", amount:0.15} });
// eave trim: dark oak slabs tucked under the lowest roof course
for (let x = -1; x <= W; x++) { b.set([x,9,-2], "dark_oak_slab[type=top]", {mask:"empty"}); b.set([x,9,D+1], "dark_oak_slab[type=top]", {mask:"empty"}); }
// timber pattern on the main gable triangles
for (const x of [0, W-1]) {
  b.fill([x,10,5],[x,17,5], "dark_oak_log[axis=y]", {mask:"!spruce_stairs|spruce_slab|spruce_planks"});
  b.fill([x,12,1],[x,12,9], "dark_oak_log[axis=z]", {mask:"!spruce_stairs|spruce_slab|spruce_planks"});
  b.fill([x,15,3],[x,15,7], "dark_oak_log[axis=z]", {mask:"!spruce_stairs|spruce_slab|spruce_planks"});
  b.set([x,13,5], "glass_pane"); b.set([x,14,5], "glass_pane");
}
// wing gable: king post + collar
b.fill([7,10,D+3],[7,13,D+3], "dark_oak_log[axis=y]", {mask:"!spruce_stairs|spruce_slab"});
b.fill([5,11,D+3],[9,11,D+3], "dark_oak_log[axis=x]", {mask:"!spruce_stairs|spruce_slab"});
// two dormers on the north slope to break the long roof plane
for (const x0 of [2, 9]) {
  const f = b.at([x0, 0, -1]); // dormer front at the north wall line (local z = -1)
  f.fill([0,10,0],[3,12,2], "$plaster");
  f.fill([0,10,0],[0,12,0], "dark_oak_log[axis=y]"); f.fill([3,10,0],[3,12,0], "dark_oak_log[axis=y]");
  f.fill([1,10,0],[2,11,0], "glass_pane");
  f.fill([1,10,1],[2,11,2], "air");
  b.roof({a:[x0,-1], b:[x0+3,2], y:13, type:"gable", axis:"z", material:"spruce", pitch:1, overhang:1, gableOverhang:1});
}
