// SATELLITE island SW for the viewpoint gazebo
const hs = lib.heightmap(-52, 76, 45, 42, 9)
  .noise({amp: 2, scale: 14, seed: 31})
  .island({center: [-30, 96], radius: [17, 15], sea: -8, falloff: 0.35, coast: 0.3, seed: 33})
  .hill([-30, 98], 10, 5)
  .flattenCircle([-30, 96], 6, 11, 4)
  .smooth(1);
hs.build(b, {palette: shared.PAL, water: null, floating: true, cutoff: -2, undersideDepth: 22, depth: 3});
shared.hs = hs;
log("sat h", hs.at(-30, 96), "edge h at z=80", hs.at(-30, 81), "main edge", shared.hm.at(-30, 66), shared.hm.at(-30, 70), shared.hm.at(-30, 72));
