// PATHS & BRIDGES: organic paths on the heightmap, main-axis bridge + grand stair to the temple, satellite bridge.
const hm = shared.hm, P = shared.PAL;
const inPlaza = (x, z) => Math.hypot(x, z - 22) < 21.6;
const isWater = (x, z) => hm.at(x, z) < 4 && ((z > -30 && z < 12) || Math.hypot(x - 48, z + 8) < 16);
function stroke(pts, w, mat) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [cx, cz] = pts[i + 1];
    const n = Math.ceil(Math.hypot(cx - ax, cz - az) * 2);
    for (let s = 0; s <= n; s++) {
      const x0 = ax + (cx - ax) * s / n, z0 = az + (cz - az) * s / n;
      for (let dz = -w; dz <= w; dz++) for (let dx = -w; dx <= w; dx++) {
        const x = Math.round(x0 + dx), z = Math.round(z0 + dz);
        const d = Math.hypot(x - x0, z - z0);
        if (d > w + 0.3 - hash(x, 1, z, 9) * 0.8) continue;
        if (!hm.isLand(x, z) || inPlaza(x, z) || isWater(x, z) || hm.slope(x, z) > 2) continue;
        b.set([x, hm.at(x, z), z], mat);
      }
    }
  }
}
// smooth the polylines a little with Catmull-like midpoints
const smoothPts = pts => { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [a, c] = [pts[i], pts[i + 1]]; o.push([a[0] * 0.75 + c[0] * 0.25, a[1] * 0.75 + c[1] * 0.25], [a[0] * 0.25 + c[0] * 0.75, a[1] * 0.25 + c[1] * 0.75]); } o.push(pts[pts.length - 1]); return o; };
const MAIN = shared.cmix([["polished_andesite", 3], ["stone_bricks", 2], ["andesite", 1]], 2, 71);
for (const [k, p] of shared.paths.entries()) stroke(k === 0 ? p : smoothPts(smoothPts(p)), k === 0 ? 2.5 : 1.6, k === 0 ? MAIN : P.path);
// --- main axis: find the river crossing at x=0
let zs = null, zn = null;
for (let z = 0; z > -40; z--) { if (isWater(0, z) && zs === null) zs = z; if (zs !== null && !isWater(0, z) && zn === null) zn = z; }
const BY = Math.max(hm.at(0, zs + 2), hm.at(0, zn - 2)) + 1;
log("river at x=0 from z", zs, "to", zn, "bridge y", BY, "heights", hm.at(0, zs + 3), hm.at(0, zn - 3), "temple foot", hm.at(0, -31));
lib.bridge(b, [0, BY, zs + 2], [0, BY, zn - 2], {width: 5, deck: shared.cmix([["polished_andesite", 3], ["stone_bricks", 2]], 2, 72), rail: "polished_deepslate_wall", arch: 3, support: "stone_bricks", lamps: 4});
// south approach: stairs down from the bridge deck to the bank
{ let yy = BY, zz = zs + 3;
  while (zz < 6) {
    const g = Math.max(...[-3,-2,-1,0,1,2,3].map(x => hm.at(x, zz)));
    if (g >= yy) break;
    for (let x = -2; x <= 2; x++) { b.fill([x, g, zz], [x, yy - 1, zz], "stone_bricks"); b.set([x, yy, zz], yy - 1 > g ? "stone_brick_stairs[facing=north]" : MAIN); }
    for (const x of [-3, 3]) { b.fill([x, g, zz], [x, yy, zz], "stone_bricks"); b.set([x, yy + 1, zz], "polished_deepslate_wall"); }
    yy--; zz++;
  } }
// grand stair from the bridge end up to the temple pad (y20 at z=-32)
let y = BY, z = zn - 3;
while (y < 20 && z > -40) {
  for (let x = -3; x <= 3; x++) { b.set([x, y + 1, z], "quartz_stairs[facing=south]"); b.fill([x, Math.min(y, hm.at(x, z)), z], [x, y, z], "polished_deepslate"); }
  for (const x of [-4, 4]) { b.fill([x, Math.min(y, hm.at(x, z)) , z], [x, y + 1, z], "deepslate_bricks"); b.set([x, y + 2, z], "polished_deepslate_wall"); }
  y++; z--;
}
for (; z >= -33; z--) for (let x = -3; x <= 3; x++) b.fill([x, 19, z], [x, 20, z], "polished_deepslate");
log("stair top at z", z + 1, "y", y);
// satellite bridge (straight along z at x=-30)
const sy = 11;
let mz = 40; while (hm.isLand(-30, mz + 1) && hm.at(-30, mz + 1) >= 5) mz++;
let sz = 75; while (!(shared.hs.isLand(-30, sz) && shared.hs.at(-30, sz) >= 8) && sz < 100) sz++;
log("satellite bridge main end z", mz, "h", hm.at(-30, mz), "sat end z", sz);
lib.bridge(b, [-30, sy, mz - 3], [-30, sy, sz + 1], {width: 3, rail: "spruce_fence", arch: 0, lamps: 5});
b.fill([-31, sy - 1, mz - 3], [-29, sy - 1, sz + 1], "spruce_slab[type=top]", {mask: "empty"});
for (let zz = mz - 3; zz <= sz + 1; zz += 6) for (const x of [-32, -28]) b.fill([x, sy - 12, zz], [x, sy, zz], "stripped_spruce_log");
// ramp from main path down/up to the bridge deck
for (let k = 0; k < 8; k++) { const zz = mz - 4 - k, g = hm.at(-30, zz); if (g >= sy) break; for (let x = -31; x <= -29; x++) b.fill([x, g + 1, zz], [x, Math.min(sy, g + 1 + Math.max(0, sy - g - 1 - k)), zz], "spruce_planks"); }
