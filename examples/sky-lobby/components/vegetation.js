// VEGETATION: zoned mixed forests, bushes, rocks, flowers. Avoids plazas, paths, pads and the spawn->temple sightline.
const hm = shared.hm;
const sight = (x, z) => Math.abs(x) < 9 + Math.max(0, (z - 0) * -0.15) && z < 24 && z > -36;
const avoid = (x, z) => shared.avoid(x, z, 2) || sight(x, z) || (Math.abs(x + 30) < 4 && z > 56) || hm.at(x, z) < 5 || hm.at(x, z) > 27 || noise(x, 7, z, 18, 21) < 0.33;
const zoneTree = (b, p, r) => {
  const [x, , z] = p; const dt = Math.hypot(x, z + 53);
  let type;
  if (dt < 42) type = r() < 0.6 ? "cherry" : "birch";
  else if (z < -25 || hm.at(x, z) > 18) type = r() < 0.75 ? "spruce" : "dark_oak";
  else if (x > 30) type = r() < 0.5 ? "birch" : "oak";
  else type = r() < 0.55 ? "oak" : r() < 0.5 ? "birch" : "dark_oak";
  lib.tree(b, p, {type, seed: Math.floor(r() * 1e6), height: type === "spruce" ? 10 + Math.floor(r() * 6) : undefined});
};
log("trees", JSON.stringify(lib.scatter(b, hm, [-85, -80], [90, 72], {kinds: [[zoneTree, 1]], minDist: 11, seed: 3, avoid, maxSlope: 2})));
// forest clusters: denser in a few noise patches
log("grove", JSON.stringify(lib.scatter(b, hm, [-85, -80], [90, 72], {kinds: [[zoneTree, 3], ["bush", 2]], minDist: 5, seed: 9, maxSlope: 2,
  avoid: (x, z) => avoid(x, z) || noise(x, 0, z, 22, 4) < 0.64})));
log("under", JSON.stringify(lib.scatter(b, hm, [-85, -80], [90, 72], {kinds: [["bush", 3], ["rock", 1], ["flowers", 4], ["grass", 5]], minDist: 3, seed: 5, avoid, maxSlope: 1})));
log("rocks", JSON.stringify(lib.scatter(b, hm, [-85, -80], [90, 72], {kinds: [["rock", 1]], minDist: 9, seed: 7, avoid: (x, z) => avoid(x, z) || hm.slope(x, z) < 1, maxSlope: 3})));
// satellite island: a few trees + flowers around the gazebo
const hs = shared.hs;
log("sat", JSON.stringify(lib.scatter(b, hs, [-48, 78], [-12, 114], {kinds: [["tree:birch", 1], ["bush", 2], ["flowers", 3]], minDist: 4, seed: 2, avoid: (x, z) => Math.hypot(x + 30, z - 96) < 8.5 || (Math.abs(x + 30) < 3 && z < 92)})));
