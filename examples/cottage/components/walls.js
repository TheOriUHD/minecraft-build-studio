const W = 15, D = 11;
const stone = {gradient:[[["cobblestone",3],["mossy_stone_bricks",2],["stone_bricks",2]], "$stone"], axis:"y", from:0, to:3, noise:0.4};
// ground floor: stone, hollow
b.walls([0,0,0],[W-1,4,D-1], stone);
b.fill([1,0,1],[W-2,4,D-2], "air");
// front wing ground floor (opens into the house)
b.walls([4,0,D],[10,4,D+2], stone);
b.fill([5,0,D-1],[9,4,D+1], "air");
// upper floor: plaster, jettied 1 block north and south
b.walls([0,5,-1],[W-1,9,D], "$plaster");
b.fill([1,5,0],[W-2,9,D-1], "air");
b.fill([0,5,-1],[W-1,5,D], "spruce_planks", {mask:"air"}); // floor of upper storey
b.fill([1,5,0],[W-2,5,D-1], "spruce_planks");
// wing upper floor, jettied to z=D+3
b.walls([4,5,D],[10,9,D+3], "$plaster");
b.fill([5,5,D],[9,9,D+2], "air");
b.fill([5,5,D],[9,5,D+2], "spruce_planks");
b.anchor("door", [7, 0, D+3]);
