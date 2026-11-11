// PORTALS: 4 themed game portals on the E/W edge of the spawn plaza, facing the centre (mirror-symmetric about x=0)
const DEFS = [
  {x: 15, z: 19, rot: 1, color: "red", frame: "red_nether_brick", inner: "red_stained_glass", theme: "fire"},
  {x: 15, z: 33, rot: 1, color: "blue", frame: "dark_prismarine", inner: "light_blue_stained_glass", theme: "frost"},
  {x: -15, z: 19, rot: 3, color: "green", frame: "mossy_stone_brick", inner: "lime_stained_glass", theme: "grove"},
  {x: -15, z: 33, rot: 3, color: "yellow", frame: "smooth_sandstone", inner: "yellow_stained_glass", theme: "gold"},
];
for (const d of DEFS) {
  // west-side portals use rotate 3 → their local x points north; flip so "left" decorations mirror the east side
  const f = b.at([d.x, 9, d.z], {rotate: d.rot, mirror: d.rot === 3 ? "x" : undefined});
  // raised base (3 deep) and back wall
  f.fill([-4, -1, -3], [4, -1, 3], "polished_deepslate");
  f.fill([-4, 0, -2], [4, 0, -1], `${d.color}_concrete`);
  lib.portal(f, 0, 1, {w: 3, h: 5, frame: d.frame, trim: "smooth_quartz", inner: d.inner, color: d.color, pad: lib.family(d.frame).block});
  f.fill([-1, 0, 4], [1, 0, 4], `${lib.family(d.frame).stairs}[facing=south]`);
  f.fill([-3, 0, 1], [3, 0, 1], `${d.color}_carpet`);
  // solid back panel (the portal is seen from the paths too) with a banner + lantern crest
  const fam = lib.family(d.frame);
  f.fill([-1, 1, -1], [1, 6, -1], "pearlescent_froglight");   // glow behind the tinted glass
  f.fill([-2, 1, -2], [2, 7, -2], fam.block);
  f.fill([-3, 1, -3], [3, 1, -3], `${fam.stairs}[facing=north]`);
  f.set([0, 5, -3], `${d.color}_wall_banner[facing=north]`);
  f.set([0, 8, 0], "sea_lantern"); f.set([0, 9, 0], `${d.color}_stained_glass`);
  // themed decoration on both flanks (x = ±4)
  for (const sx of [-1, 1]) {
    const x = sx * 4;
    if (d.theme === "fire") {
      f.fill([x, 0, 0], [x, 1, 0], "nether_bricks"); f.set([x, 2, 0], "magma_block"); f.set([x, 3, 0], "campfire[lit=true]");
      f.set([x, 0, 1], "nether_brick_stairs[facing=north]"); f.set([x, 0, -1], "magma_block");
    } else if (d.theme === "frost") {
      const h = sx < 0 ? 5 : 4; f.fill([x, 0, 0], [x, h, 0], "packed_ice"); f.fill([x, 0, -1], [x, h - 2, -1], "blue_ice");
      f.set([x, h + 1, 0], "ice"); f.set([x, 0, 1], "snow_block"); f.set([x, 1, 1], "snow[layers=2]");
    } else if (d.theme === "grove") {
      f.set([x, 0, 0], "moss_block"); lib.bush(f, [x, 1, 0], {leaves: "flowering_azalea_leaves[persistent=true]", r: 1.3});
      f.set([x, 0, 1], "moss_carpet"); f.set([x, 1, 1], "pink_petals[flower_amount=4]");
    } else {
      f.fill([x, 0, 0], [x, 1, 0], "hay_block"); f.set([x, 2, 0], "gold_block"); f.set([x, 0, 1], "barrel[facing=up]");
      f.set([x, 1, 1], "yellow_candle[candles=3,lit=true]"); f.set([x, 0, -1], "raw_gold_block");
    }
  }
}
log("portals ok");
