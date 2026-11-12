// little shrine with one chest on each satellite
b.polar([80, 10, 80], 34, 4, (f) => {
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.fill([x, 1, z], [x, 2, z], "mossy_stone_brick_wall");
  f.fill([-1, 3, -1], [1, 3, 1], "stone_brick_slab"); f.set([0, 3, 0], "chiseled_stone_bricks");
  f.fill([-1, 0, -1], [1, 0, 1], "stone_bricks");
  f.set([0, 1, 0], "chest[facing=north]");
  f.set([0, 2, 0], "lantern[hanging=true]");
  f.set([0, 0, 2], "stone_brick_stairs[facing=north]"); f.set([2, 1, -1], "mossy_cobblestone_slab"); f.set([-2, 1, 1], "poppy"); f.set([2, 1, 1], "fern");
  f.set([0, 4, 0], "stone_brick_wall"); f.set([0, 5, 0], "lantern");
}, Math.PI / 8);
