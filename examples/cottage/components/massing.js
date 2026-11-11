// Main body 15x11, two storeys; upper floor jetties 1 block N and S; front cross-gable wing
const W=15, D=11;
b.fill([0,0,0],[W-1,4,D-1],'stone_bricks');          // ground floor
b.fill([0,5,-1],[W-1,9,D],'white_terracotta');        // jettied upper floor
b.fill([4,0,D],[10,9,D+3],'white_terracotta');        // front wing
b.roof({a:[0,-1],b:[W-1,D],y:10,type:'gable',axis:'x',material:'spruce',pitch:1,overhang:1});
b.roof({parts:[{a:[0,-1],b:[W-1,D],type:'gable',axis:'x'},{a:[4,D],b:[10,D+3],type:'gable',axis:'z'}],y:10,material:'spruce',pitch:1,overhang:1});
