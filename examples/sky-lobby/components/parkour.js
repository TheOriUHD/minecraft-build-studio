// PARKOUR SPIRE west (ground y9) at (-52,26): slim tower r4 with a rainbow spiral of jump blocks, finish platform on top.
const M = shared.cmix;
const CX = -52, CZ = 26, G = 9, TOP = 44;
b.cylinder([CX, G - 2, CZ], 4.5, TOP - G + 2, p => p.y < G + 3 ? "polished_deepslate" : M([["calcite", 4], ["diorite", 1], ["smooth_quartz", 2]], 3, 91)(p), {hollow: true, thickness: 1});
for (let y = G + 4; y < TOP; y += 6) b.circle([CX, y, CZ], 5, "polished_deepslate", {filled: false}); // bands
for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) { b.fill([CX + dx, G + 1, CZ + dz], [CX + dx, TOP, CZ + dz], "light_blue_stained_glass"); }
b.set([CX, G + 1, CZ + 4], "air"); b.set([CX, G + 2, CZ + 4], "air"); b.set([CX, G + 1, CZ + 5], "polished_deepslate_slab[type=bottom]");
// crown + finish platform
b.circle([CX, TOP + 1, CZ], 6, "polished_deepslate", {filled: true});
b.circle([CX, TOP + 1, CZ], 6.3, "polished_deepslate_stairs[facing=south,half=top]", {filled: false});
b.circle([CX, TOP + 2, CZ], 6, "polished_deepslate_wall", {filled: false});
b.set([CX, TOP + 2, CZ], "gold_block"); b.set([CX, TOP + 3, CZ], "light_weighted_pressure_plate");
for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) { b.fill([CX + dx, TOP + 2, CZ + dz], [CX + dx, TOP + 6, CZ + dz], "iron_chain[axis=y]"); b.set([CX + dx, TOP + 7, CZ + dz], "lime_banner[rotation=0]"); }
// rainbow spiral of jumps (each step 2-3 blocks apart, +1 every second jump)
const COLS = ["red", "orange", "yellow", "lime", "light_blue", "blue", "purple", "magenta"];
let y = G + 1;
for (let i = 0; y < TOP; i++) {
  const a = i * 0.36, r = 7.5 + (i % 3 === 1 ? 0.8 : 0);
  const x = Math.round(CX + Math.cos(a) * r), z = Math.round(CZ + Math.sin(a) * r);
  const c = COLS[Math.floor(i / 4) % COLS.length];
  b.set([x, y, z], i % 5 === 4 ? `${c}_stained_glass` : `${c}_concrete`);
  if (i % 7 === 3) b.set([x, y + 1, z], "lantern[hanging=false]");
  if (i % 2 === 1) y++;
}
b.fill([CX + 6, G, CZ - 1], [CX + 8, G, CZ + 1], "polished_deepslate"); b.set([CX + 7, G + 1, CZ], "heavy_weighted_pressure_plate");
