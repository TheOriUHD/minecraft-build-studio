// Interior: partitions, staircase, attic ceiling, then furnish each room with lib.furnish (reads walls/doors/windows).
const style = "medieval";
// ground floor partition with door
b.fill([7,0,1],[7,4,8], "spruce_planks");
b.fill([7,0,1],[7,4,1], "dark_oak_log[axis=y]"); b.fill([7,0,8],[7,4,8], "dark_oak_log[axis=y]");
b.set([7,0,4], "spruce_door[facing=east,half=lower,hinge=left]"); b.set([7,1,4], "spruce_door[facing=east,half=upper,hinge=left]");
// upper floor partition with door
b.fill([7,6,0],[7,9,10], "spruce_planks");
b.set([7,6,5], "spruce_door[facing=east,half=lower,hinge=left]"); b.set([7,7,5], "spruce_door[facing=east,half=upper,hinge=left]");
// attic ceiling (inside the roof) with exposed beams below it
b.fill([1,10,0],[13,10,10], "spruce_planks", {mask:"empty"});
for (const z of [1,4,7,10]) b.fill([1,9,z],[13,9,z], "dark_oak_log[axis=x]", {mask:"air"});
// ground floor ceiling beams
for (const x of [3,10]) b.fill([x,4,1],[x,4,9], "dark_oak_log[axis=z]", {mask:"air"});
// staircase in the living room along the east wall, rising north; opening in the upper floor
for (let y = 0; y <= 5; y++) {
  b.set([13, y, 9 - y], "spruce_stairs[facing=north,half=bottom]");
  if (y > 0) b.fill([13, 0, 9 - y], [13, y - 1, 9 - y], "spruce_planks");
}
b.fill([13,5,5],[13,5,8], "air");
b.fill([12,6,5],[12,6,8], "spruce_fence"); b.set([12,6,4], "spruce_fence");
b.anchor("stairs_top", [13, 6, 3]);

log("kitchen:", lib.furnish(b, [1,0,1], [6,4,9], {type:"kitchen", style}).join("; "));
log("living:",  lib.furnish(b, [8,0,1], [12,4,9], {type:"living", style}).join("; "));
log("bedroom west:", lib.furnish(b, [1,6,0], [6,9,10], {type:"bedroom", style}).join("; "));
log("bedroom east:", lib.furnish(b, [8,6,0], [11,9,10], {type:"study", style}).join("; "));
