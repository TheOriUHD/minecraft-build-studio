// SPAWN CORE: plaza r21 at (0,8,22), spawn pad (0,9,26), fountain on the axis (0,9,9), statue (0,9,40). Strict symmetry about x=0.
const M = shared.cmix;
const C = [0, 8, 22];
lib.plaza(b, C, 21, {floor: M([["polished_andesite", 5], ["stone_bricks", 2], ["andesite", 2]], 2, 61), ring: "smooth_quartz", accent: "gold_block", pattern: "compass", spokes: 8, border: "polished_deepslate"});
// second ring band + dark outline
for (let dz = -22; dz <= 22; dz++) for (let dx = -22; dx <= 22; dx++) {
  const d = Math.hypot(dx, dz);
  if (d > 12.5 && d < 13.5) b.set([dx, 8, 22 + dz], "polished_deepslate");
  if (d > 21.5 && d < 22.6) b.set([dx, 8, 22 + dz], "polished_deepslate_slab[type=top]");
}
// hedge ring with gaps for the 4 axes + paths
for (let dz = -24; dz <= 24; dz++) for (let dx = -24; dx <= 24; dx++) {
  const d = Math.hypot(dx, dz);
  if (d < 22.6 || d > 23.6) continue;
  if (Math.abs(dx) <= 3 || Math.abs(dz - 4) <= 3) continue; // gaps: N/S axis, E/W paths at z=26
  b.set([dx, 9, 22 + dz], hash(dx, 0, dz, 5) < 0.75 ? "azalea_leaves[persistent=true]" : "flowering_azalea_leaves[persistent=true]");
  b.set([dx, 8, 22 + dz], "moss_block");
}
// spawn pad
lib.spawnPad(b, [0, 9, 26], {size: 5, height: 2, material: "polished_deepslate", top: M([["smooth_quartz", 4], ["calcite", 1]], 2, 62), trim: "polished_deepslate"});
b.set([0, 10, 26], "gold_block");
b.set([0, 11, 26], "light_weighted_pressure_plate");
b.anchor("spawn", [0, 11, 26]);
// fountain on the axis toward the temple
lib.fountain(b, [0, 9, 8], {r: 5, rim: "smooth_quartz", tiers: 1});
// statue/obelisk on the south axis
lib.statue(b, [0, 9, 41], {h: 9, material: "polished_deepslate", accent: "chiseled_quartz_block", cap: "gold_block"});
// lamp posts on the axis, mirrored
for (const sx of [-1, 1]) for (const z of [4, 14, 38]) {
  const x = sx * 5;
  b.set([x, 9, z], "polished_deepslate"); b.fill([x, 10, z], [x, 12, z], "polished_deepslate_wall");
  b.set([x, 13, z], "gold_block"); b.set([x, 14, z], "lantern[hanging=false]");
  b.set([x + sx, 13, z], "iron_chain[axis=x]"); b.set([x + sx, 12, z], "lantern[hanging=true]");
}
log("spawn core ok");
