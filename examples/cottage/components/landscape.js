const W = 15, D = 11;
const door = anchors["walls.door"];
lib.path(b, [[door[0], door[2]+1],[door[0]+1, door[2]+5],[door[0]-2, door[2]+10],[door[0]-4, door[2]+16]], {width:3});
lib.tree(b, [-6, 0, D+6], {type:"oak", height:9, radius:4, seed:3});
lib.tree(b, [22, 0, -3], {type:"spruce", height:12, seed:5});
lib.bush(b, [1, 0, D+2], {r:1.4}); lib.bush(b, [13, 0, D+3], {r:1.6}); lib.bush(b,[-3,0,2],{r:1.3});
// flowers in clusters
for (const [x,z,f] of [[2,D+4,"poppy"],[3,D+4,"azure_bluet"],[2,D+5,"oxeye_daisy"],[12,D+5,"cornflower"],[13,D+6,"poppy"],[11,D+6,"tall_grass"],[-1,D+1,"tall_grass"],[0,D+3,"fern"]]) b.set([x,0,z], f);
// low fence around the front garden
b.path([[-2,0,D+4],[-2,0,D+9],[3,0,D+9]], "spruce_fence");
b.path([[11,0,D+9],[16,0,D+9],[16,0,D+4]], "spruce_fence");
