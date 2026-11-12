// Sky Village SkyWars kit. Island frame: centre [0,0,0], top surface y=0, +z = outward, mid island at -z.
module.exports = {
  playerIslandTerrain(f) {
    return lib.floatingIsland(f, [0, 0, 0], 12, { flat: 9, seed: 11, depth: 20, relief: 1.5 });
  },
  playerIsland(f) {
    const x0 = -9, x1 = -3, z0 = -3, z1 = 3;
    const stone = { mix: [["cobblestone", 5], ["mossy_cobblestone", 3], ["andesite", 2]], scale: 2 };
    // plinth / apron
    f.fill([x0 - 1, -3, z0 - 1], [x1 + 1, 0, z1 + 1], stone);
    f.fill([x0 + 1, 0, z0 + 1], [x1 - 1, 0, z1 - 1], "spruce_planks");
    f.fill([x0 + 2, 0, z0 + 2], [x1 - 2, 0, z1 - 2], "dark_oak_planks");
    // walls: stone course, calcite, log top plate
    f.walls([x0, 1, z0], [x1, 5, z1], "calcite");
    f.walls([x0, 1, z0], [x1, 1, z1], stone);
    f.fill([x0, 5, z0], [x1, 5, z0], "spruce_log[axis=x]");
    f.fill([x0, 5, z1], [x1, 5, z1], "spruce_log[axis=x]");
    f.fill([x0, 5, z0], [x0, 5, z1], "spruce_log[axis=z]");
    f.fill([x1, 5, z0], [x1, 5, z1], "spruce_log[axis=z]");
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) f.fill([x, 1, z], [x, 5, z], "spruce_log[axis=y]");
    f.clear([x0 + 1, 1, z0 + 1], [x1 - 1, 5, z1 - 1]);
    // facades
    f.around([x0, 1, z0], [x1, 5, z1], (g, { side, width }) => {
      g.fill([0, 0, 1], [0, 3, 1], "stripped_spruce_log");
      g.fill([width - 1, 0, 1], [width - 1, 3, 1], "stripped_spruce_log");
      if (side === "east") {
        lib.door(g, 3, 0, { wood: "spruce", frame: "spruce_log", awning: "dark_oak" });
        g.set([1, 0, 1], "spruce_fence"); g.set([1, 1, 1], "lantern");
        g.set([5, 0, 1], "barrel[facing=up]"); g.set([5, 1, 1], "potted_red_tulip");
      } else {
        g.fill([1, 0, 1], [width - 2, 0, 1], "cobblestone_stairs[facing=north]");
        if (side === "west") lib.window(g, 3, 1, { h: 2, sill: "spruce", shutters: "spruce_trapdoor" });
        else lib.window(g, 2, 1, { w: 3, h: 2, sill: "spruce", shutters: "spruce_trapdoor" });
      }
    });
    // roof
    f.roof({ a: [x0, z0], b: [x1, z1], y: 6, type: "gable", axis: "x", pitch: 1, overhang: 1, gableOverhang: 1,
      material: "red_nether_brick", trim: "dark_oak", ridgeTrim: "dark_oak", gable: "$wall" });
    f.set([x1, 7, 0], "glass_pane"); f.set([x0, 7, 0], "glass_pane");
    // chimney on the west gable
    f.fill([x0 - 1, 0, 2], [x0 - 1, 9, 2], { mix: [["cobblestone", 3], ["stone_bricks", 2], ["mossy_cobblestone", 1]], scale: 1.5 });
    f.set([x0 - 1, 10, 2], "campfire");
    f.set([x0 - 1, 11, 2], "stone_brick_slab");
    // woodpile against the west wall
    f.fill([x0 - 1, 1, z0], [x0 - 1, 2, z0 + 1], "spruce_log[axis=x]");
    f.set([x0 - 1, 3, z0], "spruce_slab");
    // interior
    f.fill([x0 + 1, 5, 0], [x1 - 1, 5, 0], "spruce_log[axis=x]");
    f.set([-6, 4, 0], "lantern[hanging=true]");
    lib.bed(f, [-8, 1, -2], { color: "red", facing: "west" });
    f.set([-6, 1, -2], "barrel[facing=up]"); f.set([-6, 2, -2], "candle[candles=3,lit=true]");
    f.set([-8, 1, 0], "chest[facing=east]");
    f.set([-8, 1, 1], "crafting_table");
    f.set([-8, 1, 2], "barrel[facing=east]");
    f.set([-7, 1, 2], "furnace[facing=north]");
    f.set([-6, 1, 2], "spruce_stairs[facing=south]");
    f.fill([-8, 3, 0], [-8, 3, 1], "spruce_trapdoor[facing=east,half=top]");
    f.set([-8, 4, 0], "potted_fern"); f.set([-8, 4, 1], "candle[candles=2,lit=true]");
    f.fill([-7, 1, -1], [-5, 1, 1], "red_carpet"); f.set([-6, 1, 0], "white_carpet");
    // spawn pad (player stands at [0,1,8], looking -z to mid)
    f.fill([-2, -1, 7], [2, 0, 10], "stone_bricks");
    f.fill([-1, 0, 7], [1, 0, 9], "polished_andesite");
    f.set([0, 0, 8], "chiseled_stone_bricks");
    f.fill([-2, 1, 10], [2, 1, 10], "mossy_stone_brick_wall");
    f.fill([-2, 1, 8], [-2, 1, 9], "mossy_stone_brick_wall");
    f.fill([2, 1, 8], [2, 1, 9], "mossy_stone_brick_wall");
    f.set([-2, 2, 10], "lantern"); f.set([2, 2, 10], "lantern");
    f.set([1, 1, 9], "chest[facing=north]");
    // path spawn -> door
    f.curve([[0, 0, 6], [-1, 0, 3], [-2, 0, 0]], { mix: [["dirt_path", 5], ["coarse_dirt", 2], ["gravel", 1]], scale: 2 }, { width: 2, mask: "grass_block|dirt" });
    // tree + third chest + props
    lib.tree(f, [6, 1, -3], { type: "oak", height: 7, radius: 3, seed: 5 });
    f.set([4, 1, -1], "chest[facing=west]");
    f.set([-2, 1, -3], "hay_block"); f.set([-2, 1, -4], "hay_block"); f.set([-2, 2, -4], "hay_block");
    f.set([-1, 1, -4], "barrel[facing=up]");
    lib.rock(f, [7, 0, 4], { r: 1 });
    lib.rock(f, [-6, 0, 7], { r: 1 });
    const flowers = ["poppy", "dandelion", "cornflower", "oxeye_daisy", "short_grass", "short_grass", "short_grass"];
    for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) {
      if (!String(f.peek([x, 0, z])).includes("grass_block") || f.peek([x, 1, z]) !== undefined) continue;
      const h = hash(x, 0, z, 77);
      if (h < 0.18) f.set([x, 1, z], flowers[Math.floor(hash(x, 1, z, 78) * flowers.length)]);
    }
  },
};
