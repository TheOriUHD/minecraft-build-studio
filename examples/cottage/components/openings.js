const W = 15, D = 11;
// ground floor: small shuttered windows in stone
b.around([0,0,0],[W-1,4,D-1], (f,{side,width}) => {
  const xs = side === "south" ? [1,12] : side === "north" ? [2,6,11] : [4,6];
  for (const x of xs) lib.window(f, x, 1, {w: side==="south"||side==="north"?2:1, h:2, sill:"spruce", shutters: side==="north"?null:"spruce_trapdoor"});
});
// wing ground floor: door
b.around([4,0,D],[10,4,D+2], (f,{side,width}) => {
  if (side === "south") lib.door(f, 2, 0, {wood:"dark_oak", width:2, step:"stone_brick", awning:null});
  if (side !== "south") lib.window(f, 1, 1, {w:1, h:2, sill:"spruce"});
}, ["south","east","west"]);
// lantern beside the door
b.set([3,3,D+3], "lantern[hanging=false]");
b.set([3,2,D+3], "stone_brick_wall");
// upper floor: 2x2 windows between studs
b.around([0,5,-1],[W-1,9,D], (f,{side,width}) => {
  const slots = [];
  for (let x = 1; x + 1 < width - 1; x += 3) slots.push(x);
  for (const x of slots) {
    if (side === "south" && x >= 4 && x <= 9) continue; // wing covers this
    lib.window(f, x, 1, {w:2, h:2, glass:"glass_pane", sill:"dark_oak"});
  }
});
b.around([4,5,D+1],[10,9,D+3], (f,{side,width}) => {
  if (side === "south") lib.window(f, 1, 1, {w:5, h:2, sill:"dark_oak"});
  else lib.window(f, 0, 1, {w:2, h:2, sill:"dark_oak"});
}, ["south","east","west"]);
