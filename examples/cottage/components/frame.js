// Dark timber frame: corner posts, floor beams, upper-floor studs and braces, jetty brackets.
const W = 15, D = 11;
const post = "dark_oak_log[axis=y]";
const beamX = "dark_oak_log[axis=x]", beamZ = "dark_oak_log[axis=z]";
// ground floor corner posts (stone floor gets oak quoins)
for (const [x,z] of [[0,0],[W-1,0],[0,D-1],[W-1,D-1],[4,D+2],[10,D+2]]) b.fill([x,0,z],[x,4,z], post);
// jetty beam (sill plate of upper floor) runs around at y=5
b.around([0,5,-1],[W-1,9,D], (f,{width,side}) => {
  f.fill([0,0,0],[width-1,0,0], "dark_oak_log[axis=x]");
  f.fill([0,4,0],[width-1,4,0], "dark_oak_log[axis=x]");
  // studs every 3 blocks, braces between some
  for (let x = 0; x < width; x += 3) f.fill([x,1,0],[x,3,0], post);
  f.fill([width-1,1,0],[width-1,3,0], post);
  // jetty brackets under the overhang on long sides
  if (side === "south" || side === "north") for (let x = 0; x < width; x += 3) f.set([x,-1,0], "spruce_stairs[facing=south,half=top]");
}, ["south","north","east","west"]);
// wing upper frame
b.around([4,5,D+1],[10,9,D+3], (f,{width}) => {
  f.fill([0,0,0],[width-1,0,0], "dark_oak_log[axis=x]");
  f.fill([0,4,0],[width-1,4,0], "dark_oak_log[axis=x]");
  for (const x of [0,3,width-1]) f.fill([x,1,0],[x,3,0], post);
}, ["south","east","west"]);
// wing jetty brackets
for (const x of [4,7,10]) b.set([x,4,D+3], "spruce_stairs[facing=north,half=top]");
