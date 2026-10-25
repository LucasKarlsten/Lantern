const selectors = new Map();
const dungeons = window.LANTERN_DUNGEONS || [];
const svgNS='http://www.w3.org/2000/svg';
function node(tag,attrs,parent){const n=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);parent.append(n);return n;}
const markers=document.querySelector('#markers'),steps=document.querySelector('#steps');
const map=document.querySelector('#map'),floorPicker=document.querySelector('#floor-select');
const routeArrows=document.querySelector('#route-arrows');
let selected=0,stops=[],activeMap,activeFloor,box=[0,0,1000,660],drag=null;
let routeDesign=false,drawingStroke=null,movingMarker=null;
const routeEdits=new Map(),routeUndo=new Map();
function floors(){return activeMap.floors || [{id:'main',name:activeMap.wing,image:activeMap.image,route:activeMap.route}]}
function stopFloor(stop){return stop[4] || floors()[0].id}
function routeKey(){return `${activeMap.id}::${activeFloor.id}`}
function currentStrokes(){return routeEdits.get(routeKey())}
function displayedRoute(){const strokes=currentStrokes();return strokes===undefined?activeFloor.route:strokes.map(points=>points.length?`M${points.map(p=>`${formatCoord(p[0])} ${formatCoord(p[1])}`).join(' L')}`:'').filter(Boolean).join(' ')}
function formatCoord(value){return String(Math.round(value*10)/10)}
function routeFor(floor){const edits=routeEdits.get(`${activeMap.id}::${floor.id}`);return edits===undefined?floor.route:edits.map(points=>points.length?`M${points.map(p=>`${formatCoord(p[0])} ${formatCoord(p[1])}`).join(' L')}`:'').filter(Boolean).join(' ')}
function exportMapEntry(){const entry=JSON.parse(JSON.stringify(activeMap));if(entry.floors)entry.floors=entry.floors.map(floor=>({...floor,route:routeFor(floor)}));else entry.route=routeFor(floors()[0]);return `window.LANTERN_DUNGEONS = window.LANTERN_DUNGEONS || [];\nwindow.LANTERN_DUNGEONS.push(${JSON.stringify(entry,null,2)});\n`}
function updateRouteDisplay(refreshCode=true){
  const route=displayedRoute();document.querySelectorAll('.route,.route-shadow').forEach(path=>path.setAttribute('d',route));renderRouteArrows(route);
  const code=document.querySelector('#route-code');
  if(code&&refreshCode&&!drawingStroke&&!movingMarker)code.textContent=exportMapEntry();document.querySelector('#route-export-file').textContent=`web/maps/${activeMap.id}.js`;
  const undo=routeUndo.get(routeKey())||[];
  document.querySelector('#route-undo').disabled=!undo.length;
  document.querySelector('#route-clear').disabled=currentStrokes()===undefined||currentStrokes().length===0;
  const count=currentStrokes()?.length||0;
  document.querySelector('#route-editor-status').textContent=drawingStroke?'Drawing… release to finish this stroke.':count?`${count} stroke${count===1?'':'s'} on ${activeFloor.name}. Drag a numbered stop, boss, or stair marker to move it; undo, clear, or copy the map entry to save.`:`Drag the map to sketch; drag a stop, boss, or stair marker to move it. Copy the map entry to save your edits.`;
}

function renderRouteArrows(route){
  routeArrows.replaceChildren();
  const commands=[...route.matchAll(/([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)];
  const paths=[];let points=[];
  for(const command of commands){const point=[Number(command[2]),Number(command[3])];if(command[1]==='M'){if(points.length>1)paths.push(points);points=[point]}else points.push(point)}
  if(points.length>1)paths.push(points);
  const avoid=stops.filter(stop=>stopFloor(stop)===activeFloor.id).map(stop=>stop)
    .concat((activeMap.bosses||[]).filter(boss=>(boss.floor||floors()[0].id)===activeFloor.id).map(boss=>[boss.x,boss.y]))
    .concat((activeMap.transitions||[]).filter(item=>item.floor===activeFloor.id).map(item=>[item.x,item.y]));
  for(const path of paths){
    let untilNext=88;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<1)continue;
      let travelled=0;
      while(length-travelled>=untilNext){travelled+=untilNext;const t=travelled/length,x=a[0]+dx*t,y=a[1]+dy*t;
        if(!avoid.some(([px,py])=>Math.hypot(px-x,py-y)<34)){
          const arrow=node('path',{d:'M-5 -4 L0 0 L-5 4',class:'route-arrow-shadow'},routeArrows);
          arrow.setAttribute('transform',`translate(${formatCoord(x)} ${formatCoord(y)}) rotate(${formatCoord(Math.atan2(dy,dx)*180/Math.PI)})`);
          const colored=node('path',{d:'M-5 -4 L0 0 L-5 4',class:'route-arrow'},routeArrows);
          colored.setAttribute('transform',arrow.getAttribute('transform'));
        }
        untilNext=88;
      }
      untilNext-=length-travelled;
    }
  }
}

function setRouteDesign(enabled){
  routeDesign=enabled;drawingStroke=null;map.classList.toggle('route-sketching',enabled);document.body.classList.toggle('route-design-active',enabled);
  const button=document.querySelector('#route-design-toggle');button.setAttribute('aria-pressed',String(enabled));button.textContent=enabled?'FINISH DRAWING':'DRAW ROUTE';
  document.querySelector('#route-editor').hidden=!enabled;
  if(enabled){const notes=document.querySelector('#notes');notes.checked=true;notes.dispatchEvent(new Event('change'));}
  updateRouteDisplay();
}
function svgPoint(event){const point=map.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const transformed=point.matrixTransform(map.getScreenCTM().inverse());return [Math.max(0,Math.min(activeMap.width,transformed.x)),Math.max(0,Math.min(activeMap.height,transformed.y))]}
function simplifyStroke(points,tolerance=2.6){
  if(points.length<=2)return points;
  const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;const sqTol=tolerance*tolerance,stack=[[0,points.length-1]];
  while(stack.length){const [first,last]=stack.pop(),a=points[first],b=points[last],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;let max=sqTol,index=-1;
    for(let i=first+1;i<last;i++){const p=points[i],t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0,x=a[0]+t*dx,y=a[1]+t*dy,d=(p[0]-x)**2+(p[1]-y)**2;if(d>max){max=d;index=i}}
    if(index>=0){keep[index]=1;stack.push([first,index],[index,last]);}
  }
  return points.filter((_,i)=>keep[i]);
}
function undoRoute(){const history=routeUndo.get(routeKey())||[];if(!history.length)return;const action=history.pop();routeUndo.set(routeKey(),history);if(action.type==='position')setMarkerPosition(action.record,[action.x,action.y]);else if(action.hadEdits)routeEdits.set(routeKey(),action.prior);else routeEdits.delete(routeKey());updateRouteDisplay()}
function clearRoute(){if(currentStrokes()===undefined)return;const history=routeUndo.get(routeKey())||[];history.push({type:'route',hadEdits:true,prior:currentStrokes().map(stroke=>stroke.map(point=>[...point]))});routeUndo.set(routeKey(),history);routeEdits.set(routeKey(),[]);updateRouteDisplay()}
async function copyRouteCode(){updateRouteDisplay();const code=document.querySelector('#route-code').textContent,button=document.querySelector('#route-copy');try{await navigator.clipboard.writeText(code);button.textContent='COPIED';}catch{const field=document.createElement('textarea');field.value=code;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();const copied=document.execCommand('copy');field.remove();button.textContent=copied?'COPIED — PASTE INTO MAP FILE':'SELECT THE CODE ABOVE';}setTimeout(()=>button.textContent='COPY MAP FILE',1800)}
function select(i){
  if(i<0||i>=stops.length)return;
  selected=i;
  if(activeFloor?.id!==stopFloor(stops[i]))showFloor(stopFloor(stops[i]));
  document.querySelectorAll('.marker').forEach(m=>{const on=Number(m.dataset.index)===i;m.classList.toggle('active',on);m.setAttribute('aria-pressed',String(on))});
  document.querySelectorAll('#steps button').forEach((b,j)=>{b.classList.toggle('active',i===j);b.setAttribute('aria-pressed',String(i===j))});
  document.querySelector('#position').textContent=`${i+1} / ${stops.length}`;
  document.querySelector('#previous').disabled=i===0;document.querySelector('#next').disabled=i===stops.length-1;
}
function render(){closeBossCard();map.setAttribute('viewBox',box.join(' '))}
function resetView(){drag=null;box=[0,0,activeMap.width,activeMap.height];render()}
function zoom(f){const w=Math.max(activeMap.width*.3,Math.min(activeMap.width*1.4,box[2]*f)),h=w*activeMap.height/activeMap.width;box=[box[0]+(box[2]-w)/2,box[1]+(box[3]-h)/2,w,h];render()}
function renderMarkers(){
  markers.replaceChildren();
  stops.forEach(([x,y,title],i)=>{
    if(stopFloor(stops[i])!==activeFloor.id)return;
    const g=node('g',{class:'marker',role:'button',tabindex:0,'data-index':i,'aria-label':`Stop ${i+1}: ${title}`,transform:`translate(${x} ${y})`},markers);
    node('circle',{r:12},g);node('text',{},g).textContent=i+1;
    g.addEventListener('click',event=>{if(routeDesign){event.preventDefault();return}select(i)});g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(i)}});
  });
}

function renderTransitions(){
  const layer=document.querySelector('#floor-transitions');layer.replaceChildren();
  for(const transition of activeMap.transitions||[]){
    if(transition.floor!==activeFloor.id)continue;
    const up=transition.direction==='up';
    const description=`${up?'Up':'Down'} to ${transition.label}`;
    const marker=node('g',{class:'floor-transition',role:'button',tabindex:0,'data-transition':transition.id,'aria-label':description,transform:`translate(${transition.x} ${transition.y})`},layer);
    node('title',{},marker).textContent=`${description} · Select to continue`;
    node('rect',{x:-20,y:-20,width:40,height:40,rx:8,class:'stairs-hit-area'},marker);
    const symbol=node('g',{transform:'scale(.8)',class:'stairs-symbol'},marker);
    node('rect',{x:-16,y:-16,width:32,height:32,rx:7,class:'stairs-badge'},symbol);
    node('path',{d:'M-10 9 H-4 V3 H2 V-3 H8 V-9',class:'stairs-icon'},symbol);
    node('path',{d:up?'M-9 -2 V-11 M-13 -7 L-9 -11 L-5 -7':'M-9 -11 V-2 M-13 -6 L-9 -2 L-5 -6',class:'stairs-arrow'},symbol);
    node('text',{x:0,y:26,class:'stairs-label'},marker).textContent=`${up?'↑':'↓'} ${transition.label}`;
    const travel=()=>{
      select(transition.toStep);
      const url=new URL(location.href);url.searchParams.set('map',activeMap.id);url.searchParams.set('floor',activeFloor.id);history.pushState(null,'',url);
      const counterpart=(activeMap.transitions||[]).find(t=>transition.pairId?t.id===transition.pairId:t.floor===activeFloor.id&&t.toFloor===transition.floor);
      const target=counterpart?document.querySelector(`[data-transition="${counterpart.id}"]`):document.querySelectorAll('#steps button')[transition.toStep];
      target?.focus({preventScroll:true});
    };
    marker.addEventListener('click',event=>{if(routeDesign){event.preventDefault();return}travel()});
    marker.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();travel()}});
  }
}

function showFloor(id){
  activeFloor=floors().find(f=>f.id===id)||floors()[0];floorPicker.value=activeFloor.id;selectors.get(floorPicker)?.sync();
  const artwork=document.querySelector('#map-artwork');artwork.setAttribute('href',activeFloor.image);artwork.setAttribute('width',activeMap.width);artwork.setAttribute('height',activeMap.height);
  updateRouteDisplay();
  document.querySelector('#floor-status').textContent=activeFloor.name;
  document.querySelector('#map-title').textContent=`${activeMap.name} — ${activeMap.wing} — ${activeFloor.name}`;
  map.setAttribute('aria-label',`${activeMap.name}, ${activeMap.wing}, ${activeFloor.name}. Select route stops or boss markers.`);
  resetView();renderMarkers();renderTransitions();renderBosses();
}
function loadMap(id,requestedFloor){
  activeMap=dungeons.find(entry=>entry.id===id)||dungeons[0];stops=activeMap.stops;activeFloor=null;selected=0;steps.replaceChildren();floorPicker.replaceChildren();
  document.querySelector('#dungeon-select').value=activeMap.id;
  document.querySelector('#dungeon-name').textContent=activeMap.name;
  document.querySelector('#dungeon-detail').textContent=`${activeMap.wing} · ${activeMap.region}`;
  document.querySelector('#breadcrumb-region').textContent=activeMap.continent.toUpperCase();
  document.querySelector('#breadcrumb-dungeon').textContent=`${activeMap.name} · ${activeMap.wing}`.toUpperCase();
  document.querySelector('#stop-count').textContent=`${stops.length} route stops`;
  document.querySelector('#route-summary').textContent=activeMap.summary||'Follow the numbered route. Preview pending in-game verification.';
  document.querySelector('#artwork-note').textContent=activeMap.mapNote||'';
  document.querySelector('#artwork-note').hidden=!activeMap.mapNote;
  document.title=`${activeMap.name} — ${activeMap.wing} | Lantern`;
  map.style.aspectRatio=`${activeMap.width} / ${activeMap.height}`;
  const source=document.querySelector('#map-source');source.href=activeMap.source;source.textContent=`Map source: ${activeMap.sourceName}`;
  for(const floor of floors()){const option=document.createElement('option');option.value=floor.id;option.textContent=floor.name;floorPicker.append(option)}
  document.querySelector('#floor-tools').hidden=floors().length===1;
  stops.forEach(([, , title,note],i)=>{
    const li=document.createElement('li'),button=document.createElement('button'),number=document.createElement('span'),body=document.createElement('span'),heading=document.createElement('strong'),detail=document.createElement('small');
    number.className='number';number.textContent=i+1;heading.textContent=title;
    const floor=floors().find(f=>f.id===stopFloor(stops[i]));
    detail.textContent=(floors().length>1?`${floor.name} · `:'')+note;
    body.append(heading,detail);
    const transition=(activeMap.transitions||[]).find(t=>t.afterStep===i);
    if(transition){const hint=document.createElement('span');hint.className='step-transition';hint.textContent=`${transition.direction==='up'?'↑':'↓'} ${transition.label}`;body.append(hint)}
    button.append(number,body);button.onclick=()=>select(i);li.append(button);steps.append(li);
  });
  const first=stops.findIndex(s=>stopFloor(s)===requestedFloor);select(first<0?0:first);selectors.get(document.querySelector('#dungeon-select'))?.sync();
}
document.querySelector('#previous').onclick=()=>select(selected-1);
document.querySelector('#next').onclick=()=>select(selected+1);
document.querySelector('#notes').onchange=e=>document.querySelector('#route-overlay').style.display=e.target.checked?'':'none';
document.querySelector('#zoom-in').onclick=()=>zoom(.8);document.querySelector('#zoom-out').onclick=()=>zoom(1.25);document.querySelector('#reset').onclick=resetView;
floorPicker.addEventListener('change',()=>{
  const first=stops.findIndex(stop=>stopFloor(stop)===floorPicker.value);
  if(first>=0)select(first);else showFloor(floorPicker.value);
  const url=new URL(location.href);url.searchParams.set('map',activeMap.id);url.searchParams.set('floor',activeFloor.id);history.pushState(null,'',url);
});
map.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.1:.9)},{passive:false});
function markerRecord(element){
  if(element.classList.contains('marker')){const index=Number(element.dataset.index);return{kind:'stop',item:stops[index],element}}
  if(element.classList.contains('boss-marker')){const item=(activeMap.bosses||[]).find(boss=>boss.id===element.dataset.boss);return item?{kind:'boss',item,element}:null}
  if(element.classList.contains('floor-transition')){const item=(activeMap.transitions||[]).find(transition=>transition.id===element.dataset.transition);return item?{kind:'transition',item,element}:null}
  return null;
}
function markerPosition(record){return record.kind==='stop'?[record.item[0],record.item[1]]:[record.item.x,record.item.y]}
function setMarkerPosition(record,point){if(record.kind==='stop'){record.item[0]=point[0];record.item[1]=point[1]}else{record.item.x=point[0];record.item.y=point[1]}record.element.setAttribute('transform',`translate(${formatCoord(point[0])} ${formatCoord(point[1])})`)}
function finishMarkerMove(){if(!movingMarker)return;const {record,start,last}=movingMarker;movingMarker=null;if(Math.hypot(last[0]-start[0],last[1]-start[1])>=.5){const history=routeUndo.get(routeKey())||[];history.push({type:'position',record,x:start[0],y:start[1]});routeUndo.set(routeKey(),history)}updateRouteDisplay()}
map.addEventListener('pointerdown',e=>{
  if(routeDesign&&e.button===0){
    const target=e.target.closest('.marker, .boss-marker, .floor-transition'),record=target&&markerRecord(target);e.preventDefault();
    if(record){const start=markerPosition(record);movingMarker={record,start,last:start}}
    else{const key=routeKey(),strokes=routeEdits.get(key)||[],history=routeUndo.get(key)||[];history.push({type:'route',hadEdits:routeEdits.has(key),prior:strokes.map(stroke=>stroke.map(point=>[...point]))});routeUndo.set(key,history);drawingStroke=[svgPoint(e)];strokes.push(drawingStroke);routeEdits.set(key,strokes)}
    map.setPointerCapture(e.pointerId);updateRouteDisplay(false);return;
  }
  if(e.target.closest('.marker, .boss-marker, .floor-transition'))return;
  drag={x:e.clientX,y:e.clientY,box:[...box]};map.setPointerCapture(e.pointerId)
});
map.addEventListener('pointermove',e=>{
  if(movingMarker){const point=svgPoint(e);movingMarker.last=point;setMarkerPosition(movingMarker.record,point);updateRouteDisplay(false);return}
  if(drawingStroke){const point=svgPoint(e),last=drawingStroke.at(-1);if(Math.hypot(point[0]-last[0],point[1]-last[1])>=1.4){drawingStroke.push(point);updateRouteDisplay(false)}return}
  if(!drag)return;const scale=Math.max(drag.box[2]/map.clientWidth,drag.box[3]/map.clientHeight);box=[drag.box[0]-(e.clientX-drag.x)*scale,drag.box[1]-(e.clientY-drag.y)*scale,...drag.box.slice(2)];render()
});
function finishRouteStroke(){if(!drawingStroke)return;const strokes=currentStrokes();strokes[strokes.length-1]=simplifyStroke(drawingStroke);drawingStroke=null;updateRouteDisplay()}
map.addEventListener('pointerup',()=>{finishRouteStroke();finishMarkerMove();drag=null});map.addEventListener('pointercancel',()=>{finishRouteStroke();finishMarkerMove();drag=null});
document.querySelector('#route-design-toggle').addEventListener('click',()=>setRouteDesign(!routeDesign));
document.querySelector('#route-undo').addEventListener('click',undoRoute);
document.querySelector('#route-clear').addEventListener('click',clearRoute);
document.querySelector('#route-copy').addEventListener('click',copyRouteCode);
document.addEventListener('keydown',event=>{if(routeDesign&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undoRoute()}});

const bossLayer = document.querySelector('#boss-markers');
const bossCard = document.querySelector('#boss-card');
let bossAnchor = null, bossPinned = false, bossCloseTimer = null, restoringBossFocus = false;

function closeBossCard(restoreFocus = false) {
  clearTimeout(bossCloseTimer);
  const previous = bossAnchor;
  if (previous) previous.setAttribute('aria-expanded', 'false');
  bossCard.hidden = true;
  bossAnchor = null;
  bossPinned = false;
  if (restoreFocus && previous?.isConnected) {
    restoringBossFocus = true;
    previous.focus();
    restoringBossFocus = false;
  }
}

function positionBossCard() {
  if (!bossAnchor) return;
  const anchor = bossAnchor.getBoundingClientRect();
  const card = bossCard.getBoundingClientRect();
  const gap = 10, edge = 12;
  let left = anchor.right + gap;
  if (left + card.width > window.innerWidth - edge) left = anchor.left - card.width - gap;
  bossCard.style.left = `${Math.max(edge, Math.min(left, window.innerWidth - card.width - edge))}px`;
  bossCard.style.top = `${Math.max(edge, Math.min(anchor.top, window.innerHeight - card.height - edge))}px`;
}

function showBossCard(boss, anchor, pin = false) {
  if (routeDesign || restoringBossFocus || (bossPinned && !pin)) return;
  clearTimeout(bossCloseTimer);
  if (bossAnchor) bossAnchor.setAttribute('aria-expanded', 'false');
  bossAnchor = anchor;
  bossPinned = pin;
  anchor.setAttribute('aria-expanded', 'true');
  document.querySelector('#boss-name').textContent = boss.name;
  document.querySelector('#boss-kind').textContent = `CLASSIC ERA · ${boss.kind}`;
  document.querySelector('#boss-mindset').textContent = boss.mindset;
  const abilities = document.querySelector('#boss-abilities');
  abilities.replaceChildren();
  for (const ability of boss.abilities) {
    const item = document.createElement('li');
    item.textContent = ability;
    abilities.append(item);
  }
  document.querySelector('#boss-source').href = activeMap.bossSource;
  document.querySelector('.boss-hint').textContent = pin ? 'Pinned · Tap outside or press Esc to close' : 'Click to keep open · Esc to close';
  bossCard.hidden = false;
  positionBossCard();
}

function scheduleBossClose() {
  clearTimeout(bossCloseTimer);
  if (bossPinned) return;
  bossCloseTimer = setTimeout(() => {
    if (!bossCard.matches(':hover') && !bossCard.contains(document.activeElement)
      && document.activeElement !== bossAnchor) closeBossCard();
  }, 220);
}

function renderBosses() {
  closeBossCard();
  bossLayer.replaceChildren();
  for (const boss of activeMap.bosses || []) {
    if ((boss.floor || floors()[0].id) !== activeFloor.id) continue;
    const marker = node('g', {
      class: 'boss-marker', role: 'button', tabindex: 0,
      'aria-label': `${boss.name}: show abilities and mindset`,
      'aria-controls': 'boss-card', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'data-boss': boss.id,
      transform: `translate(${boss.x} ${boss.y})`
    }, bossLayer);
    node('circle', {r: boss.mainBoss ? 20 : 16, class: 'boss-hit-area'}, marker);
    const symbol = node('g', {class: 'boss-symbol', transform: 'scale(.78)'}, marker);
    if (boss.mainBoss) {
      // Header-style four-point sparkle, rotated behind the upright skull.
      const lantern = node('g', {class: 'boss-lantern', transform: 'rotate(45)', 'aria-hidden': 'true'}, symbol);
      const frame = 'M0 -25 Q4 -4 25 0 Q4 4 0 25 Q-4 4 -25 0 Q-4 -4 0 -25Z';
      node('path', {d: frame, class: 'boss-lantern-shadow'}, lantern);
      node('path', {d: frame, class: 'boss-lantern-frame'}, lantern);
    }
    node('path', {d: 'M0 -13 L13 0 L0 13 L-13 0Z', class: 'boss-gem'}, symbol);
    // A small vector skull stays legible without an external font or icon asset.
    node('path', {d: 'M-6 1 V-4 Q-6 -9 0 -9 Q6 -9 6 -4 V1 L3 3 V7 H-3 V3Z', class: 'boss-skull'}, symbol);
    node('circle', {cx: -2.5, cy: -2, r: 1.4, class: 'boss-eye'}, symbol);
    node('circle', {cx: 2.5, cy: -2, r: 1.4, class: 'boss-eye'}, symbol);
    marker.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') showBossCard(boss, marker);
    });
    marker.addEventListener('pointerleave', scheduleBossClose);
    marker.addEventListener('focus', () => showBossCard(boss, marker));
    marker.addEventListener('blur', scheduleBossClose);
    const toggle = () => {
      if (bossPinned && bossAnchor === marker) closeBossCard();
      else showBossCard(boss, marker, true);
    };
    marker.addEventListener('click', toggle);
    marker.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showBossCard(boss, marker, true);
        document.querySelector('#boss-close').focus();
      }
    });
  }
}

bossCard.addEventListener('pointerenter', () => clearTimeout(bossCloseTimer));
bossCard.addEventListener('pointerleave', scheduleBossClose);
bossCard.addEventListener('focusin', () => clearTimeout(bossCloseTimer));
bossCard.addEventListener('focusout', scheduleBossClose);
document.querySelector('#boss-close').addEventListener('click', () => closeBossCard(true));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !bossCard.hidden) { event.preventDefault(); closeBossCard(true); }
});
document.addEventListener('pointerdown', event => {
  if (!bossCard.contains(event.target) && !event.target.closest('.boss-marker')) closeBossCard();
});
document.querySelector('#show-bosses').addEventListener('change', event => {
  closeBossCard();
  bossLayer.style.display = event.target.checked ? '' : 'none';
});
window.addEventListener('resize', positionBossCard);
window.addEventListener('scroll', event => {
  if (!bossCard.contains(event.target)) positionBossCard();
}, true);

// Keep the native selects as the data source; share one keyboard/touch UI.
function enhanceSelector(select) {
  const label = document.querySelector(`label[for="${select.id}"]`);
  const wrapper = document.createElement('div');
  wrapper.className = `route-picker ${select.id === 'floor-select' ? 'route-picker-floor' : ''}`;
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.id = `${select.id}-trigger`; trigger.className = 'picker-trigger';
  trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const value = document.createElement('span'); value.className = 'picker-value'; value.id = `${select.id}-value`;
  const chevron = document.createElement('span'); chevron.className = 'picker-chevron'; chevron.setAttribute('aria-hidden', 'true');
  trigger.append(value, chevron);
  const menu = document.createElement('div'); menu.id = `${select.id}-menu`; menu.className = 'picker-menu';
  menu.setAttribute('role', 'listbox'); menu.hidden = true;
  label.id = `${select.id}-label`; label.htmlFor = trigger.id;
  trigger.setAttribute('aria-labelledby', `${label.id} ${value.id}`);
  trigger.setAttribute('aria-controls', menu.id); menu.setAttribute('aria-labelledby', label.id);
  select.before(wrapper); wrapper.append(trigger, select); select.hidden = true;
  document.body.append(menu);
  let active = 0, search = '', searchTimer;
  const options = () => Array.from(select.options);
  function content(parent, option) {
    const [name, ...detail] = option.textContent.split(' — ');
    const title = document.createElement('span'); title.className = 'picker-title'; title.textContent = name;
    parent.append(title);
    if (detail.length) { const subtitle = document.createElement('span'); subtitle.className = 'picker-detail'; subtitle.textContent = detail.join(' — '); parent.append(subtitle); }
  }
  function position() {
    const box = trigger.getBoundingClientRect(), edge = 12, gap = 8;
    const width = Math.min(Math.max(box.width, 300), innerWidth - edge * 2);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(edge, Math.min(box.left, innerWidth - width - edge))}px`;
    const below = innerHeight - box.bottom - gap - edge, above = box.top - gap - edge;
    const up = below < Math.min(menu.scrollHeight, 260) && above > below;
    const height = Math.max(0, Math.min(390, up ? above : below));
    menu.style.maxHeight = `${height}px`;
    menu.style.top = `${up ? Math.max(edge, box.top - gap - Math.min(menu.scrollHeight, height)) : box.bottom + gap}px`;
  }
  function highlight(scroll = true) {
    Array.from(menu.children).forEach((row, i) => row.classList.toggle('is-highlighted', i === active));
    const row = menu.children[active];
    if (row) { trigger.setAttribute('aria-activedescendant', row.id); if (scroll) row.scrollIntoView({block: 'nearest'}); }
  }
  function close() {
    menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.removeAttribute('aria-activedescendant');
    search = ''; clearTimeout(searchTimer);
  }
  function sync() {
    close(); value.replaceChildren(); menu.replaceChildren();
    const selected = select.options[select.selectedIndex]; if (selected) content(value, selected);
    options().forEach((option, i) => {
      const row = document.createElement('div'); row.id = `${select.id}-option-${i}`; row.className = 'picker-option';
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(option.selected));
      const text = document.createElement('span'); text.className = 'picker-value'; content(text, option);
      const check = document.createElement('span'); check.className = 'picker-check'; check.textContent = '✓'; check.setAttribute('aria-hidden', 'true');
      row.append(text, check); row.addEventListener('click', () => commit(i));
      menu.append(row);
    });
  }
  function open() {
    document.querySelectorAll('.picker-trigger[aria-expanded="true"]').forEach(button => { if (button !== trigger) button.click(); });
    closeBossCard(); active = Math.max(0, select.selectedIndex); menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true'); position(); highlight();
  }
  function commit(i) {
    const option = select.options[i]; if (!option) return;
    select.value = option.value; close(); select.dispatchEvent(new Event('change', {bubbles: true})); sync(); trigger.focus();
  }
  trigger.addEventListener('click', () => menu.hidden ? open() : close());
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Escape') { if (!menu.hidden) { event.preventDefault(); event.stopPropagation(); close(); } return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (menu.hidden) { open(); if (event.key !== 'Home' && event.key !== 'End') return; }
      else if (event.key === 'Enter' || event.key === ' ') { commit(active); return; }
      if (event.key === 'Home') active = 0;
      if (event.key === 'End') active = options().length - 1;
      if (event.key === 'ArrowDown') active = Math.min(options().length - 1, active + 1);
      if (event.key === 'ArrowUp') active = Math.max(0, active - 1);
      highlight();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); if (menu.hidden) open();
      search += event.key.toLowerCase(); clearTimeout(searchTimer); searchTimer = setTimeout(() => search = '', 650);
      const found = options().findIndex(option => option.textContent.toLowerCase().startsWith(search));
      if (found >= 0) { active = found; highlight(); }
    }
  });
  document.addEventListener('pointerdown', event => { if (!wrapper.contains(event.target) && !menu.contains(event.target)) close(); });
  trigger.addEventListener('blur', close);
  // Keep focus on the combobox when a pointer chooses an option.
  menu.addEventListener('pointerdown', event => event.preventDefault());
  window.addEventListener('resize', () => { if (!menu.hidden) position(); });
  window.addEventListener('scroll', event => { if (!menu.hidden && !menu.contains(event.target)) position(); }, true);
  select.addEventListener('change', sync);
  return {sync};
}

const picker=document.querySelector('#dungeon-select');
for(const dungeon of dungeons){const option=document.createElement('option');option.value=dungeon.id;option.textContent=`${dungeon.name} — ${dungeon.wing}`;picker.append(option)}
picker.addEventListener('change',()=>{loadMap(picker.value);const url=new URL(location.href);url.searchParams.set('map',activeMap.id);url.searchParams.delete('floor');history.pushState(null,'',url)});
function restoreLocation(){const params=new URLSearchParams(location.search);loadMap(params.get('map'),params.get('floor'))}
window.addEventListener('popstate',restoreLocation);
for(const select of [picker,floorPicker])selectors.set(select,enhanceSelector(select));
restoreLocation();
