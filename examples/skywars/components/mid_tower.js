// Ruined-village watchtower on the mid island: 9x9, 3 levels + open lookout, red hip roof
const c = 80, x0 = 76, x1 = 84, z0 = 76, z1 = 84, top = 24;
const stone = p => { const h = hash(p.x, p.y, p.z, 3); if (p.y < 14 && h < 0.45) return "mossy_stone_bricks"; if (h < 0.15) return "cracked_stone_bricks"; return "stone_bricks"; };
b.fill([x0 - 1, 6, z0 - 1], [x1 + 1, 10, z1 + 1], { mix: [["cobblestone", 3], ["mossy_cobblestone", 2], ["andesite", 1]], scale: 2 });
b.fill([x0 + 1, 10, z0 + 1], [x1 - 1, 10, z1 - 1], { checker: ["polished_andesite", "stone_bricks"], size: 1 });
b.walls([x0, 11, z0], [x1, top, z1], stone);
b.clear([x0 + 1, 11, z0 + 1], [x1 - 1, top + 4, z1 - 1]);
// floors
b.fill([x0 + 1, 17, z0 + 1], [x1 - 1, 17, z1 - 1], "spruce_planks");
b.fill([x0 + 1, 24, z0 + 1], [x1 - 1, 24, z1 - 1], "stone_bricks");
for (const z of [z0 + 2, z1 - 2]) { b.fill([x0 + 1, 16, z], [x1 - 1, 16, z], "spruce_log[axis=x]"); b.fill([x0 + 1, 23, z], [x1 - 1, 23, z], "spruce_log[axis=x]"); }
b.around([x0, 11, z0], [x1, top, z1], (f, { width }) => {
  // pilasters + plinth
  for (const x of [0, width - 1]) { f.fill([x, 0, 1], [x, 12, 1], "stone_bricks"); f.set([x, 13, 1], "stone_brick_stairs[facing=south,half=top]"); }
  f.fill([1, 0, 1], [width - 2, 0, 1], "stone_brick_stairs[facing=north]");
  // cornices at floor lines
  f.fill([1, 6, 1], [width - 2, 6, 1], "stone_brick_stairs[facing=north,half=top]");
  f.fill([0, 13, 1], [width - 1, 13, 1], "stone_brick_stairs[facing=north,half=top]");
  // ground arch 3 wide x 4 high
  f.arch(3, 5, 0, 4, "air", { style: "round" });
  f.set([3, 0, 1], "air"); f.set([4, 0, 1], "air"); f.set([5, 0, 1], "air");
  f.fill([2, 0, 1], [2, 3, 1], "polished_andesite"); f.fill([6, 0, 1], [6, 3, 1], "polished_andesite");
  f.fill([3, 4, 1], [5, 4, 1], "chiseled_stone_bricks");
  // red banner between the arrow windows + moss/vines at the base
  f.set([4, 10, 1], "red_wall_banner[facing=south]");
  f.set([1, 2, 1], "vine[south=false,north=true]"); f.set([1, 1, 1], "vine[south=false,north=true]");
  // level-2 arrow windows
  for (const x of [2, 6]) lib.window(f, x, 8, { h: 3, glass: "iron_bars", arch: "round" });
  // lookout arcade above the walls
  for (const x of [0, 4, 8]) f.fill([x, 14, 0], [x, 17, 0], x === 4 ? "stone_brick_wall" : "stone_bricks");
  f.fill([1, 14, 0], [3, 14, 0], "dark_oak_fence"); f.fill([5, 14, 0], [7, 14, 0], "dark_oak_fence");
  f.fill([0, 17, 0], [width - 1, 17, 0], "spruce_log[axis=x]");
  f.fill([1, 16, 0], [3, 16, 0], "spruce_trapdoor[half=top,facing=south]");
  f.fill([5, 16, 0], [7, 16, 0], "spruce_trapdoor[half=top,facing=south]");
});
// open timber ceiling: roof underside visible from the lookout, cross beams + chandelier
b.fill([x0 + 1, 28, c], [x1 - 1, 28, c], "spruce_log[axis=x]"); b.fill([c, 28, z0 + 1], [c, 28, z1 - 1], "spruce_log[axis=z]");
b.roof({ a: [x0, z0], b: [x1, z1], y: 29, type: "hip", pitch: [1, 2, 2, 2, 2], overhang: 1, material: "red_nether_brick", trim: "dark_oak", ridgeTrim: "dark_oak", texture: { material: "nether_brick", amount: 0.2, scale: 2 } });
// central spiral staircase around a pillar (two flights: ground->17, 17->24)
b.fill([c, 11, c], [c, 24, c], "polished_andesite");
const ring = [[79, 79], [80, 79], [81, 79], [81, 80], [81, 81], [80, 81], [79, 81], [79, 80]];
const dirs = ["east", "east", "east", "south", "south", "west", "north", "north"];
for (let k = 0; k < 6; k++) { const [x, z] = ring[k]; if (k > 0) b.set([x, 10 + k, z], "spruce_slab[type=top]"); b.set([x, 11 + k, z], `spruce_stairs[facing=${dirs[k]}]`); }
for (const k of [2, 3, 4, 5]) b.set([ring[k][0], 17, ring[k][1]], "air");
const flight2 = [7, 0, 1, 2, 3, 4];
flight2.forEach((k, n) => { const [x, z] = ring[k]; if (n > 0) b.set([x, 17 + n, z], "spruce_slab[type=top]"); b.set([x, 18 + n, z], `spruce_stairs[facing=${dirs[k]}]`); });
for (const k of [2, 3, 4]) b.set([ring[k][0], 24, ring[k][1]], "air");
// lights
b.set([x0 + 2, 15, z0 + 2], "lantern[hanging=true]"); b.set([x1 - 2, 15, z1 - 2], "lantern[hanging=true]");
b.set([x0 + 2, 22, z1 - 2], "lantern[hanging=true]"); b.set([x1 - 2, 22, z0 + 2], "lantern[hanging=true]");
b.set([c, 27, c], "lantern[hanging=true]"); b.set([c - 2, 27, c], "lantern[hanging=true]"); b.set([c + 2, 27, c], "lantern[hanging=true]");
// chests: 2 ground, 2 upper
b.set([x0 + 1, 11, z0 + 1], "chest[facing=south]"); b.set([x1 - 1, 11, z1 - 1], "chest[facing=north]");
b.set([x0 + 1, 18, z1 - 1], "chest[facing=north]"); b.set([x1 - 1, 18, z0 + 1], "chest[facing=south]");
// clutter: ground floor guard room, upper floor store
for (const [x, y, z, st] of [[x1 - 1, 11, z0 + 2, "barrel[facing=up]"], [x1 - 2, 11, z0 + 1, "smithing_table"], [x0 + 2, 11, z0 + 1, "cauldron"], [x0 + 1, 11, z0 + 2, "grindstone[face=floor,facing=east]"],
  [x1 - 1, 12, z0 + 1, "potted_dead_bush"], [x0 + 1, 18, z0 + 2, "barrel[facing=up]"], [x0 + 2, 18, z0 + 1, "hay_block"], [x1 - 1, 18, z1 - 2, "barrel[facing=up]"],
  [x1 - 2, 18, z1 - 1, "fletching_table"], [x0 + 1, 22, z0 + 1, "cobweb"], [x1 - 1, 15, z1 - 1, "cobweb"], [x0 + 1, 25, z0 + 1, "lantern"], [x1 - 1, 25, z1 - 1, "lantern"]]) b.set([x, y, z], st);
// clutter
for (const [x, y, z, s] of [[x1 - 1, 11, z0 + 1, "barrel[facing=up]"], [x0 + 1, 18, z0 + 1, "barrel[facing=up]"], [x1 - 1, 18, z1 - 1, "cobweb"], [x0 + 1, 12, z0 + 1, "cobweb"], [x0 + 1, 11, z1 - 2, "mossy_cobblestone_slab"]]) b.set([x, y, z], s);
b.anchor("top", [c, 25, c]);
