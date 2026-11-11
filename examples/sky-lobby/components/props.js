// PROPS: lanterns along paths, benches, barrels near the shop, lily pads + reeds at the river
const hm = shared.hm;
const inPlaza = (x, z) => Math.hypot(x, z - 22) < 24;
let n = 0;
for (const [k, p] of shared.paths.entries()) {
  if (k === 0) continue;
  let acc = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [cx, cz] = p[i + 1], L = Math.hypot(cx - ax, cz - az);
    for (let t = 0; t < L; t += 1) {
      acc += 1; if (acc % 9 !== 4) continue;
      const nx = -(cz - az) / L, nz = (cx - ax) / L, side = (Math.floor(acc / 9) % 2) ? 1 : -1;
      const x = Math.round(ax + (cx - ax) * t / L + nx * 3 * side), z = Math.round(az + (cz - az) * t / L + nz * 3 * side);
      if (!hm.isLand(x, z) || inPlaza(x, z) || hm.at(x, z) < 5 || hm.slope(x, z) > 1) continue;
      lib.lampPost(b, [x, hm.at(x, z) + 1, z], {h: 3, post: "spruce_fence", lantern: "lantern"}); n++;
    }
  }
}
log("lamps", n);
// river decoration: lily pads and sugar cane at the banks
hm.each((x, z, h) => {
  if (z < -30 || z > 12) return;
  const t = Math.round(h);
  if (t >= 0 && t < 3 && hash(x, 0, z, 3) < 0.04) b.set([x, 5, z], "lily_pad", {mask: "empty"});
  if (t === 4 && hash(x, 1, z, 4) < 0.08 && hm.isLand(x, z)) { b.set([x, 5, z], "sugar_cane"); b.set([x, 6, z], "sugar_cane"); }
});
// benches facing the lake
for (const [x, z] of [[38, 4], [41, 6]]) b.set([x, hm.at(x, z) + 1, z], "spruce_stairs[facing=south]");
