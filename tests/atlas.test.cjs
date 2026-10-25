const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const loadMaps=require('./map-data.cjs');
const root=path.join(__dirname,'..','web');
const maps=loadMaps(root);
const vm=require('node:vm');
const appSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
function routeArrowTransforms(route,stops=[]){
 const arrows=[];
 const context=vm.createContext({
  route,stops,activeFloor:{id:'main'},activeMap:{},
  stopFloor:()=> 'main',floors:()=>[{id:'main'}],
  routeArrows:{replaceChildren:()=>{arrows.length=0}},
  node:(_tag,attrs)=>{const attributes={...attrs};arrows.push(attributes);return{
   setAttribute:(key,value)=>{attributes[key]=value},getAttribute:key=>attributes[key]
  }}
 });
 const renderer=appSource.slice(appSource.indexOf('function renderRouteArrows('),appSource.indexOf('\nfunction setRouteDesign('));
 const formatter=appSource.match(/function formatCoord\(value\)\{[^\n]+\}/)[0];
 // A synchronous infinite loop must fail within the VM deadline, not hang the test runner.
 vm.runInContext(`${formatter}\n${renderer}\nrenderRouteArrows(route)`,context,{timeout:1000});
 assert.equal(arrows.length%2,0);
 for(let i=0;i<arrows.length;i+=2){
  assert.equal(arrows[i].class,'route-arrow-shadow');assert.equal(arrows[i+1].class,'route-arrow');
  assert.equal(arrows[i].transform,arrows[i+1].transform);
 }
 return arrows.filter(arrow=>arrow.class==='route-arrow').map(arrow=>arrow.transform);
}
test('route arrows terminate on long segments and include exact spacing boundaries',()=>{
 assert.deepEqual(routeArrowTransforms('M0 0 L264 0'),[
  'translate(88 0) rotate(0)','translate(176 0) rotate(0)','translate(264 0) rotate(0)'
 ]);
});
test('route arrows carry spacing across short segments and bends, resetting at new strokes',()=>{
 assert.deepEqual(routeArrowTransforms('M0 0 L50 0 L100 0 L100 200 M300 0 L350 0 L400 0'),[
  'translate(88 0) rotate(0)','translate(100 76) rotate(90)',
  'translate(100 164) rotate(90)','translate(388 0) rotate(0)'
 ]);
});
test('route arrow suppression preserves spacing and empty or degenerate routes terminate',()=>{
 assert.deepEqual(routeArrowTransforms('M0 0 L264 0',[[88,0]]),[
  'translate(176 0) rotate(0)','translate(264 0) rotate(0)'
 ]);
 for(const route of ['', 'M0 0', 'M0 0 L0 0 L40 0'])assert.deepEqual(routeArrowTransforms(route),[]);
});
test('nine distinct dungeon routes and valid local artwork',()=>{
 assert.equal(maps.length,9);assert.equal(new Set(maps.map(m=>m.id)).size,maps.length);
 for(const id of ['scholomance','dire-maul-east','dire-maul-north','dire-maul-west','lower-blackrock-spire','upper-blackrock-spire','blackrock-depths'])assert.ok(maps.some(m=>m.id===id));
 for(const map of maps){
  const floors=map.floors||[{id:'main',image:map.image,route:map.route}];
  const ids=new Set(floors.map(f=>f.id));assert.equal(ids.size,floors.length);
  for(const floor of floors){
   assert.ok(floor.route.startsWith('M'));assert.ok(map.stops.some(s=>(s[4]||floors[0].id)===floor.id));
   const image=fs.readFileSync(path.join(root,floor.image));
   assert.ok(image.subarray(0,4).equals(Buffer.from([137,80,78,71]))||image.subarray(0,2).equals(Buffer.from([255,216])));
  }
  for(const [x,y,title,note,floor] of map.stops){assert.ok(x>=0&&x<=map.width&&y>=0&&y<=map.height);assert.ok(title&&note);assert.ok(ids.has(floor||floors[0].id));}
  assert.equal(new Set(map.bosses.map(b=>b.id)).size,map.bosses.length);
  for(const boss of map.bosses){assert.ok(ids.has(boss.floor||floors[0].id));assert.ok(boss.x>=0&&boss.x<=map.width&&boss.y>=0&&boss.y<=map.height);assert.ok(boss.abilities.length&&boss.mindset);if(/optional|rare/i.test(boss.kind))assert.equal(boss.mainBoss,false);}
 }
});
test('North states boss-clear scope and West includes all five pylons',()=>{
 assert.match(maps.find(m=>m.id==='dire-maul-north').summary,/Boss-clear/);
 assert.match(maps.find(m=>m.id==='dire-maul-west').summary,/five pylons/);
 assert.equal(maps.find(m=>m.id==='scholomance').floors.length,4);
});

test('BRD declares its keyed route and keeps the rescue target optional',()=>{
 const brd=maps.find(m=>m.id==='blackrock-depths');
 assert.match(brd.summary,/Shadowforge Key/);
 assert.equal(brd.floors.length,2);
 assert.match(brd.stops.find(s=>s[2]==='The Lyceum')[3],/two Shadowforge Torches/);
 assert.match(brd.stops.at(-1)[3],/Moira/);
 assert.equal(brd.bosses.find(b=>b.id==='moira').mainBoss,false);
 assert.equal(brd.bosses.find(b=>b.id==='emperor').mainBoss,true);
});

test('multi-floor stair links have valid steps, elevations and reciprocal endpoints',()=>{
 for(const map of maps.filter(m=>m.floors?.length>1)){
  assert.ok(map.transitions?.length, map.id);
  const ids=new Set(map.transitions.map(t=>t.id));assert.equal(ids.size,map.transitions.length);
  for(const t of map.transitions){
   assert.ok(['up','down'].includes(t.direction));
   assert.ok(map.floors.some(f=>f.id===t.floor));
   assert.notEqual(t.floor,t.toFloor);
   assert.equal(map.stops[t.toStep][4],t.toFloor,t.id);
   assert.ok(t.x>=0&&t.x<=map.width&&t.y>=0&&t.y<=map.height);
   if(t.afterStep!==undefined)assert.equal(map.stops[t.afterStep][4],t.floor,t.id);
   if(t.pairId){const pair=map.transitions.find(p=>p.id===t.pairId);assert.ok(pair,t.id);assert.equal(pair.pairId,t.id);assert.equal(pair.floor,t.toFloor);assert.equal(pair.toFloor,t.floor);assert.notEqual(pair.direction,t.direction);}
  }
 }
});
