// island 0 (south) - separate component so qa/walkthrough can focus one island
b.polar([80,10,80],55,8,(f,i)=>{ if(i===0) lib.playerIsland(f); });
b.anchor('spawn0',[80,11,143]);
