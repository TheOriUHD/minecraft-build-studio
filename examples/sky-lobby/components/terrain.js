// WORKAROUND: built-in {mix, scale} / weighted arrays hash with a large component seed -> z/y ignored -> stripes.
shared.cmix = (list, scale = 3, seed = 1) => {
  const tot = list.reduce((s, [, w]) => s + w, 0);
  return p => { const r = scale > 1 ? noise(p.x, p.y, p.z, scale, seed) : hash(p.x, p.y, p.z, seed); let acc = 0;
    for (const [blk, w] of list) { acc += w / tot; if (r < acc) return blk; } return list[list.length - 1][0]; };
};
const M = shared.cmix;
const PAL = {
  grass: M([["grass_block", 12], ["moss_block", 3], ["green_concrete_powder", 1]], 4, 11),
  dirt: M([["dirt", 3], ["coarse_dirt", 1]], 3, 12),
  cliff: M([["cyan_terracotta", 6], ["light_gray_concrete", 2], ["andesite", 3], ["clay", 2], ["gray_concrete", 1]], 4, 13),
  stone: "cyan_terracotta",
  sand: M([["smooth_sandstone", 3], ["sand", 3]], 3, 14),
  seabed: M([["clay", 2], ["gravel", 2], ["sand", 2]], 3, 15),
  snow: M([["snow_block", 5], ["white_concrete_powder", 1]], 3, 16),
  underside: M([["cyan_terracotta", 4], ["gray_concrete", 2], ["andesite", 2], ["light_gray_terracotta", 2], ["tuff", 1]], 4, 17),
  path: M([["dirt_path", 4], ["coarse_dirt", 2], ["packed_mud", 1], ["gravel", 1]], 2, 18),
};
shared.PAL = PAL;
// TERRAIN — main floating island. Publishes shared.hm, shared.zones, shared.paths, shared.avoid
const hm = lib.heightmap(-95, -90, 191, 181, 7)
  .noise({amp: 3, scale: 36, seed: 4})
  .noise({amp: 7, scale: 26, ridged: true, seed: 12})
  .hill([-50, -48], 30, 34, {sharp: 2.2})
  .hill([-36, -64], 16, 14, {sharp: 1.5})      // NW mountain framing the temple
  .hill([46, -54], 24, 26, {sharp: 2})       // NE peak
  .hill([0, -52], 40, 12)                       // temple hill
  .hill([-62, 0], 20, 6)
  .island({radius: [82, 74], sea: -8, falloff: 0.28, coast: 0.45, seed: 5})
  .hill([0, -56], 30, 8, {sharp: 1})
  .flatten([-23, -73], [23, -32], 20, 12)       // temple pad
  .flattenCircle([0, 22], 22, 8, 6)            // spawn plaza
  .flattenCircle([52, 28], 10, 9, 5)           // shop
  .flattenCircle([-52, 26], 9, 9, 5)           // parkour
  .carve([[-96, 2], [-60, -6], [-30, -14], [-8, -16], [14, -12], [34, -10]], {width: 6, level: 2, blend: 4})
  .flattenCircle([48, -8], 8, 1, 5)        // lake basin
  .smooth(1);
hm.build(b, {palette: PAL, water: null, floating: true, cutoff: -2, undersideDepth: 30, depth: 3, snowLine: 40});
shared.hm = hm;
// water only in the river channel + lake (build's water option floods the floating coast)
const WATER = 4;
hm.each((x, z, h) => {
  const t = Math.round(h);
  if (t >= WATER || t < 0) return;
  const nearRiver = (x > -90 && z > -30 && z < 12) || Math.hypot(x - 48, z + 8) < 16;
  if (!nearRiver || !hm.isLand(x, z)) return;
  b.set([x, t, z], PAL.seabed);
  b.fill([x, t + 1, z], [x, WATER, z], "water");
});
shared.zones = [ // [x, z, r]
  [0, 22, 23], [0, -53, 32], [52, 28, 12], [-52, 26, 11], [0, -14, 5],
];
shared.paths = [
  [[0, 0], [0, -10], [0, -18], [0, -30]],                       // main axis (bridge + temple stairs)
  [[18, 26], [28, 22], [36, 30], [44, 28]],                    // to shop
  [[-18, 26], [-28, 32], [-36, 24], [-44, 26]],                // to parkour
  [[-8, 42], [-14, 52], [-24, 58], [-30, 64]],                 // to satellite bridge
  [[44, 20], [46, 8], [42, 0]],                                // shop to lakeside
];
function segD(px, pz, a, c) { const vx=c[0]-a[0], vz=c[1]-a[1]; const L=vx*vx+vz*vz||1; const t=Math.max(0,Math.min(1,((px-a[0])*vx+(pz-a[1])*vz)/L)); return Math.hypot(px-(a[0]+t*vx), pz-(a[1]+t*vz)); }
shared.pathDist = (x, z) => { let d = 1e9; for (const p of shared.paths) for (let i = 0; i < p.length - 1; i++) d = Math.min(d, segD(x, z, p[i], p[i+1])); return d; };
shared.avoid = (x, z, pad = 0) => shared.pathDist(x, z) < 3 + pad || shared.zones.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + pad);
log("spawn h", hm.at(0, 26), "temple h", hm.at(0, -53), "lake h", hm.at(48, -8), "shop", hm.at(52, 28));
