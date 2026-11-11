const W = 15, D = 11;
// chimney on the east gable, stone, rising past the ridge
b.fill([W,-1,3],[W+1,15,4], [["stone_bricks",4],["cobblestone",2],["andesite",1]]);
b.fill([W,16,3],[W+1,17,4], "bricks");
b.set([W,17,3], "campfire[lit=true,signal_fire=true]");
// flower boxes under upper south windows
for (const x of [1,2,12,13]) { b.set([x,5,D+1], "spruce_trapdoor[facing=south,half=top,open=false]"); }
// barrels and crates by the wing
b.set([11,0,D+1], "barrel[facing=up]"); b.set([11,1,D+1], "barrel[facing=up]"); b.set([12,0,D+1], "composter");
