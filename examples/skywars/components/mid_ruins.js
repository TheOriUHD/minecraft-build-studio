// Ruins around the tower, 4-fold rotational symmetry (drawn in the south quadrant)
const stone = p => { const h = hash(p.x, p.y, p.z, 5); return h < 0.35 ? "mossy_stone_bricks" : h < 0.5 ? "cracked_stone_bricks" : "stone_bricks"; };
b.radial(4, 80, 80, (f) => {
  // ruined archway on the south approach
  for (const x of [77, 83]) { f.fill([x, 10, 92], [x, 16, 92], stone); f.set([x, 11, 93], "stone_brick_stairs[facing=north]"); f.set([x, 11, 91], "stone_brick_stairs[facing=south]"); }
  f.fill([78, 16, 92], [80, 16, 92], stone);
  f.set([81, 16, 92], "stone_brick_slab");
  f.set([78, 15, 92], "stone_brick_stairs[facing=east,half=top]");
  f.set([77, 17, 92], "stone_brick_slab");
  f.fill([78, 11, 92], [82, 11, 92], "air");
  // path from arch to tower door
  for (let z = 85; z <= 95; z++) for (let x = 79; x <= 81; x++) if (hash(x, 0, z, 9) < 0.8) f.set([x, 10, z], hash(x, 1, z, 9) < 0.5 ? "cobblestone" : hash(x, 2, z, 9) < 0.5 ? "gravel" : "mossy_cobblestone");
  // broken L-wall cover in the SE corner with a chest behind it
  for (let x = 87; x <= 91; x++) { const h = 1 + Math.floor(hash(x, 0, 87, 4) * 3); f.fill([x, 11, 87], [x, 10 + h, 87], stone); }
  for (let z = 88; z <= 91; z++) { const h = 1 + Math.floor(hash(87, 0, z, 4) * 3); f.fill([87, 11, z], [87, 10 + h, z], stone); }
  f.set([88, 11, 88], "chest[facing=south]");
  f.set([89, 11, 88], "mossy_cobblestone_slab");
  // broken column + rubble
  f.fill([72, 11, 87], [72, 14, 87], "stone_brick_wall"); f.set([72, 15, 87], "stone_brick_slab");
  f.set([73, 11, 88], "cobblestone_slab"); f.set([71, 11, 86], "mossy_cobblestone_slab"); f.set([74, 11, 86], "stone_button[face=floor]");
  f.set([86, 11, 83], "lantern");
  lib.bush(f, [90, 11, 84], { r: 1 });
});
