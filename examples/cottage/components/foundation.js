// Plinth: 1 block wider than the ground floor, sunk into the ground, mossy toward the bottom.
const W = 15, D = 11;
b.fill([-1,-2,-1],[W,-1,D], {gradient:["mossy_cobblestone","cobblestone","stone_bricks"], axis:"y", from:-2, to:-1, noise:0.5});
b.fill([3,-2,D],[11,-1,D+3], {gradient:["mossy_cobblestone","cobblestone","stone_bricks"], axis:"y", from:-2, to:-1, noise:0.5});
// floor
b.fill([0,-1,0],[W-1,-1,D-1], "spruce_planks");
b.fill([4,-1,D],[10,-1,D+2], "spruce_planks");
