import './style.css';

type Point = { x: number; y: number };
type Road = { points: Point[]; progress: number; connectsVillageToHighway: boolean; width: number; direction: 'both'|'forward' };
type RoadGraphNode = { id: number; x: number; y: number; edgeIds: string[] };
type RoadGraphEdge = { id: string; from: number; to: number; width: number; kind: 'highway' | 'local'; source: string; forward: boolean; reverse: boolean; active: boolean };
type RoadGraph = { nodes: RoadGraphNode[]; edges: RoadGraphEdge[] };
type Vehicle = { path: Point[]; lengths: number[]; routeLength: number; distance: number; speed: number; cruiseSpeed: number; direction: number; color: string; originId: string; destinationId: string; fuel: number; fuelCapacity: number; stalled: boolean };

const mount = document.querySelector<HTMLDivElement>('#world');
if (!mount) throw new Error('World mount not found');
const canvas = document.createElement('canvas');
canvas.setAttribute('aria-label', 'Игровое поле, вид сверху');
mount.appendChild(canvas);
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context is not available');

const WORLD = { minX: -23, maxX: 23, minY: -19, maxY: 17 };
const roadGrid = 1.5;
const roadHalfWidth = 0.95;
let width = 1, height = 1, dpr = 1;
let camera = { x: 0, y: -1, zoom: 20 };
let cameraInitialized=false;
let selectedTool = 'inspect';
let drawing = false;
let panning = false;
let lastPointer: Point | null = null;
let draft: Point[] = [];
let pointerId: number | null = null;
const activePointers = new Map<number, Point>();
let pinchStart: { distance: number; zoom: number; center: Point } | null = null;

const staticRoads: { a: Point; b: Point; points?: Point[]; width: number; direction?: 'both'|'forward' }[] = [
  // A single village spine branches from the federal highway and serves every building.
  {a:{x:-18,y:-13},b:{x:18,y:-13},width:1.55},
  {a:{x:-1,y:-10.5},b:{x:-.1,y:7.2},points:[
    {x:-1,y:-10.5},{x:-.8,y:-9.6},{x:-.7,y:-8.5},{x:-.7,y:-7.1},
    {x:-.7,y:-5.2},{x:-.7,y:-3.2},{x:-.4,y:-1.2},{x:-.1,y:1},
    {x:-.1,y:3.2},{x:-.1,y:5.2},{x:-.1,y:7.2}
  ],width:1.48},
  // West branch: farm and two residential plots.
  {a:{x:-.1,y:3.2},b:{x:-10.4,y:7.45},points:[
    {x:-.1,y:3.2},{x:-2.2,y:3.7},{x:-4.3,y:4.2},{x:-6.4,y:4.7},
    {x:-8.4,y:5.5},{x:-10.4,y:7.45}
  ],width:1.18},
  {a:{x:-4.3,y:4.2},b:{x:-10.55,y:-4},points:[
    {x:-4.3,y:4.2},{x:-6.1,y:2.6},{x:-7.7,y:.5},{x:-9.1,y:-1.7},{x:-10.55,y:-4}
  ],width:1.12},
  {a:{x:-.7,y:-5.2},b:{x:-6.5,y:-1.65},points:[
    {x:-.7,y:-5.2},{x:-2.1,y:-4.35},{x:-3.8,y:-3.15},{x:-5.1,y:-2.15},{x:-6.5,y:-1.65}
  ],width:1.02},
  {a:{x:-.7,y:-7.1},b:{x:-5,y:-7.35},points:[
    {x:-.7,y:-7.1},{x:-2.1,y:-6.65},{x:-3.5,y:-6.85},{x:-5,y:-7.35}
  ],width:.98},
  // East branch: village home and market access.
  {a:{x:-.1,y:5.2},b:{x:7.7,y:3.15},points:[
    {x:-.1,y:5.2},{x:2.1,y:5.35},{x:4.1,y:4.95},{x:5.8,y:4.1},{x:7.7,y:3.15}
  ],width:1.12},
  {a:{x:-.1,y:7.2},b:{x:2.8,y:9.65},points:[
    {x:-.1,y:7.2},{x:1.15,y:8.1},{x:1.95,y:8.95},{x:2.8,y:9.65}
  ],width:.98},
  {a:{x:18,y:-13},b:{x:11,y:-7.25},points:[
    {x:18,y:-13},{x:15.8,y:-12.4},{x:13.8,y:-11.1},{x:12.2,y:-9.25},{x:11,y:-7.25}
  ],width:1.16},
  // The fuel station is connected directly to the highway via its forecourt.
  {a:{x:-8,y:-13},b:{x:-8,y:-14.65},points:[
    {x:-8,y:-13},{x:-8.35,y:-13.55},{x:-8.25,y:-14.1},{x:-8,y:-14.65}
  ],width:1.05}
];
function staticRoadPath(road:{a:Point;b:Point;points?:Point[]}):Point[]{return road.points??[road.a,road.b];}
const obstacles = [
  {x:-6.5,y:-3.2,r:2.15,type:'house'},{x:7.7,y:1.7,r:1.95,type:'house'},{x:-10.4,y:5.8,r:1.85,type:'house'},{x:2.8,y:8.3,r:1.75,type:'house'},{x:-5,y:-9,r:1.55,type:'house'},
  {x:11,y:-5,r:2.25,type:'shop'},{x:-13,y:-4,r:2.35,type:'barn'},
  {x:-14,y:-10,r:1.25,type:'tree'},{x:-17,y:-4,r:1.05,type:'tree'},{x:-16,y:1,r:1.15,type:'tree'},{x:-12,y:10,r:1.1,type:'tree'},{x:-4,y:12,r:1.05,type:'tree'},{x:4,y:12,r:1.05,type:'tree'},{x:12,y:9,r:1.05,type:'tree'},{x:15,y:4,r:1.05,type:'tree'},{x:14,y:-9,r:1.05,type:'tree'},{x:6,y:-5,r:1.05,type:'tree'},{x:-9,y:-1,r:1.05,type:'tree'},{x:17,y:0,r:1.05,type:'tree'},{x:16,y:7,r:4,type:'pond'}
];
const builtRoads: Road[] = [];
const constructionJobs: Road[] = [];
const vehicles: Vehicle[] = [];
const missionCount = document.querySelector<HTMLElement>('.mission-count');
const missionProgress = document.querySelector<HTMLElement>('.progress span');
const buildMessage = document.querySelector<HTMLElement>('#build-message');
const trafficCount = document.querySelector<HTMLElement>('#traffic-count');
const jamCount = document.querySelector<HTMLElement>('#jam-count');
const fuelCount = document.querySelector<HTMLElement>('#fuel-count');
const activeRoadCount = document.querySelector<HTMLElement>('#active-road-count');


function distance(a: Point,b: Point) { return Math.hypot(a.x-b.x,a.y-b.y); }
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}
function lerp(a:number,b:number,t:number){return a+(b-a)*t;}
function worldToScreen(p:Point):Point{return{x:width/2+(p.x-camera.x)*camera.zoom,y:height/2+(p.y-camera.y)*camera.zoom};}
function screenToWorld(p:Point):Point{return{x:(p.x-width/2)/camera.zoom+camera.x,y:(p.y-height/2)/camera.zoom+camera.y};}
function getFitCameraZoom(){
  const portraitMobile=width<800&&height>width;
  return portraitMobile
    ?Math.min(height/(WORLD.maxY-WORLD.minY)*.88,width/19)
    :Math.min(width/(WORLD.maxX-WORLD.minX),height/(WORLD.maxY-WORLD.minY))*.92;
}
function resize(){
  const rect=mount!.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  width=rect.width;height=rect.height;dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  canvas.style.width=width+'px';canvas.style.height=height+'px';
  ctx!.setTransform(dpr,0,0,dpr,0,0);
  const fitZoom=getFitCameraZoom();
  if(!cameraInitialized){camera.zoom=fitZoom;cameraInitialized=true;}
  else camera.zoom=clamp(camera.zoom,Math.min(width/52,height/42),Math.min(width,height)/10);
}
const observer=new ResizeObserver(resize);observer.observe(mount);resize();

function roundedRect(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  c.beginPath();c.roundRect(x,y,w,h,r);
}
function pathOnCanvas(points:Point[], progress=1){
  if(points.length<2)return;
  const sampled=smoothPoints(points);
  const lengths:number[]=[];let total=0;
  for(let i=1;i<sampled.length;i++){const len=distance(sampled[i-1]!,sampled[i]!);lengths.push(len);total+=len;}
  const target=total*clamp(progress,0,1);
  let walked=0;
  const first=worldToScreen(sampled[0]!);ctx!.beginPath();ctx!.moveTo(first.x,first.y);
  for(let i=1;i<sampled.length;i++){
    const a=sampled[i-1]!,b=sampled[i]!,len=lengths[i-1]!;
    if(walked+len<=target){const p=worldToScreen(b);ctx!.lineTo(p.x,p.y);walked+=len;continue;}
    const t=len>0?(target-walked)/len:0;
    if(t>0){const p=worldToScreen({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});ctx!.lineTo(p.x,p.y);}
    break;
  }
}
function smoothPoints(points:Point[]){
  if(points.length<3)return points;
  const out:Point[]=[points[0]!];
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1]!,b=points[i]!,c=points[i+1]!;
    const ab=distance(a,b),bc=distance(b,c);
    if(ab<.001||bc<.001)continue;
    // Long tangent transitions suppress sharp corners while respecting short links.
    const radius=Math.min(1.55,ab*.44,bc*.44);
    const from={x:b.x+(a.x-b.x)/ab*radius,y:b.y+(a.y-b.y)/ab*radius};
    const to={x:b.x+(c.x-b.x)/bc*radius,y:b.y+(c.y-b.y)/bc*radius};
    out.push(from);
    for(let sample=1;sample<=14;sample++){
      const t=sample/14,u=1-t;
      out.push({x:u*u*from.x+2*u*t*b.x+t*t*to.x,y:u*u*from.y+2*u*t*b.y+t*t*to.y});
    }
  }
  out.push(points[points.length-1]!);return out;
}
function strokeRoad(points:Point[],progress=1,color='#68777d',alpha=1,roadWidth=1.9){
  if(points.length<2||progress<=0)return;
  const preview=color!=='#69777d'&&color!=='#59666a';
  ctx!.save();ctx!.globalAlpha=alpha;ctx!.lineCap='round';ctx!.lineJoin='round';
  // Every road is one continuous ribbon. Drafts keep their own amber/red route cue.
  pathOnCanvas(points,progress);ctx!.strokeStyle=preview?'#fff4d9':'#d7dfd0';ctx!.lineWidth=roadWidth*.82*camera.zoom;ctx!.stroke();
  pathOnCanvas(points,progress);ctx!.strokeStyle=preview?color:'#69777d';ctx!.lineWidth=roadWidth*.70*camera.zoom;ctx!.stroke();
  if(preview){
    pathOnCanvas(points,progress);ctx!.strokeStyle='#fff7e8';ctx!.globalAlpha=alpha*.72;
    ctx!.lineWidth=Math.max(1,.045*camera.zoom);ctx!.setLineDash([.28*camera.zoom,.2*camera.zoom]);ctx!.stroke();
  }
  ctx!.restore();
}
function ribbonOffsets(points:Point[],halfWidth:number):{left:Point[];right:Point[]}{
  const sampled=smoothPoints(points);
  if(sampled.length<2)return{left:[],right:[]};
  const directions=sampled.slice(1).map((point,index)=>{
    const previous=sampled[index]!,dx=point.x-previous.x,dy=point.y-previous.y,length=Math.hypot(dx,dy)||1;
    return{x:dx/length,y:dy/length};
  });
  const normals=directions.map(direction=>({x:-direction.y,y:direction.x}));
  const left:Point[]=[],right:Point[]=[];
  for(let i=0;i<sampled.length;i++){
    let nx:number,ny:number,miter=halfWidth;
    if(i===0){nx=normals[0]!.x;ny=normals[0]!.y;}
    else if(i===sampled.length-1){nx=normals[normals.length-1]!.x;ny=normals[normals.length-1]!.y;}
    else{
      const before=normals[i-1]!,after=normals[i]!,mx=before.x+after.x,my=before.y+after.y,length=Math.hypot(mx,my);
      if(length<.001){nx=after.x;ny=after.y;}
      else{
        nx=mx/length;ny=my/length;
        miter=clamp(halfWidth/Math.max(nx*after.x+ny*after.y,.42),halfWidth,halfWidth*2.25);
      }
    }
    const point=sampled[i]!;
    left.push({x:point.x+nx*miter,y:point.y+ny*miter});
    right.push({x:point.x-nx*miter,y:point.y-ny*miter});
  }
  return{left,right};
}
function appendRoadRibbon(points:Point[],halfWidth:number){
  if(points.length<2)return;
  const ribbon=ribbonOffsets(points,halfWidth);
  if(ribbon.left.length<2)return;
  const first=worldToScreen(ribbon.left[0]!);ctx!.moveTo(first.x,first.y);
  for(let i=1;i<ribbon.left.length;i++){const p=worldToScreen(ribbon.left[i]!);ctx!.lineTo(p.x,p.y);}
  for(let i=ribbon.right.length-1;i>=0;i--){const p=worldToScreen(ribbon.right[i]!);ctx!.lineTo(p.x,p.y);}
  ctx!.closePath();
}
function convexHullPoints(points:Point[]):Point[]{
  const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
  if(sorted.length<4)return sorted;
  const cross=(o:Point,a:Point,b:Point)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower:Point[]=[],upper:Point[]=[];
  for(const point of sorted){while(lower.length>=2&&cross(lower[lower.length-2]!,lower[lower.length-1]!,point)<=0)lower.pop();lower.push(point);}
  for(let i=sorted.length-1;i>=0;i--){const point=sorted[i]!;while(upper.length>=2&&cross(upper[upper.length-2]!,upper[upper.length-1]!,point)<=0)upper.pop();upper.push(point);}
  lower.pop();upper.pop();return lower.concat(upper);
}
function appendJunctionSurface(junction:{center:Point;arms:JunctionArm[]},extra:number){
  const points:Point[]=[];
  for(const arm of junction.arms){
    const length=Math.hypot(arm.direction.x,arm.direction.y)||1;
    const dx=arm.direction.x/length,dy=arm.direction.y/length,nx=-dy,ny=dx;
    const half=arm.width*.35+extra,reach=Math.max(.2,arm.width*.5+extra*.7);
    const tip={x:junction.center.x+dx*reach,y:junction.center.y+dy*reach};
    points.push({x:tip.x+nx*half,y:tip.y+ny*half},{x:tip.x-nx*half,y:tip.y-ny*half});
  }
  const hull=convexHullPoints(points);
  if(hull.length<3)return;
  const first=worldToScreen(hull[0]!);ctx!.moveTo(first.x,first.y);
  for(let i=1;i<hull.length;i++){const p=worldToScreen(hull[i]!);ctx!.lineTo(p.x,p.y);}
  ctx!.closePath();
}
function strokeRoadNetworkGroup(roads:{points:Point[];progress:number;width:number}[],color:string,outerColor:string,junctions:{center:Point;arms:JunctionArm[]}[]=[]){
  if(!roads.length)return;
  // Filled offset ribbons replace thick strokes: both edges are calculated from
  // the same centreline, so width changes and bends no longer look like stickers.
  ctx!.save();ctx!.fillStyle=outerColor;ctx!.beginPath();
  for(const road of roads)appendRoadRibbon(road.points,road.width*.41+.12);
  for(const junction of junctions)appendJunctionSurface(junction,.22);
  ctx!.fill();
  ctx!.fillStyle=color;ctx!.beginPath();
  for(const road of roads)appendRoadRibbon(road.points,road.width*.35);
  for(const junction of junctions)appendJunctionSurface(junction,.08);
  ctx!.fill();ctx!.restore();
}
function drawRoadCentreLinePath(points:Point[],subtle:boolean,junctions:{center:Point;arms:JunctionArm[]}[],progress=1){
  if(points.length<2||progress<=0)return;
  const sampled=smoothPoints(points);
  const lengths=sampled.slice(1).map((point,index)=>distance(sampled[index]!,point));
  const total=lengths.reduce((sum,len)=>sum+len,0),target=total*clamp(progress,0,1);
  let walked=0;
  const fragments:{a:Point;b:Point}[]=[];
  for(let i=0;i<lengths.length;i++){
    const a=sampled[i]!,b=sampled[i+1]!,len=lengths[i]!;
    if(len<.001)continue;
    const allowedEnd=clamp((target-walked)/len,0,1);
    walked+=len;if(allowedEnd<=0)continue;
    let intervals:[number,number][]=[[0,allowedEnd]];
    for(const junction of junctions){
      if(junction.arms.length<3)continue;
      const radius=Math.max(...junction.arms.map(arm=>arm.width/2))+.24;
      const fx=a.x-junction.center.x,fy=a.y-junction.center.y,dx=b.x-a.x,dy=b.y-a.y;
      const A=dx*dx+dy*dy,B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-radius*radius;
      const discriminant=B*B-4*A*C;if(discriminant<0)continue;
      const root=Math.sqrt(discriminant),insideStart=clamp((-B-root)/(2*A),0,allowedEnd),insideEnd=clamp((-B+root)/(2*A),0,allowedEnd);
      if(insideEnd<=insideStart)continue;
      const next:[number,number][]=[];
      for(const [lo,hi] of intervals){
        if(insideEnd<=lo||insideStart>=hi){next.push([lo,hi]);continue;}
        if(insideStart>lo)next.push([lo,insideStart]);
        if(insideEnd<hi)next.push([insideEnd,hi]);
      }
      intervals=next;
      if(!intervals.length)break;
    }
    for(const [lo,hi] of intervals){
      if(hi-lo<.012)continue;
      fragments.push({
        a:{x:lerp(a.x,b.x,lo),y:lerp(a.y,b.y,lo)},
        b:{x:lerp(a.x,b.x,hi),y:lerp(a.y,b.y,hi)}
      });
    }
  }
  ctx!.save();
  ctx!.setLineDash(subtle?[.42*camera.zoom,.56*camera.zoom]:[1.2*camera.zoom,1.45*camera.zoom]);
  ctx!.lineCap='butt';ctx!.strokeStyle=subtle?'#d9d3b5':'#f4e8bd';
  ctx!.globalAlpha=subtle?.68:.88;ctx!.lineWidth=(subtle?.035:.065)*camera.zoom;
  ctx!.beginPath();
  for(const fragment of fragments){
    const p=worldToScreen(fragment.a),q=worldToScreen(fragment.b);
    ctx!.moveTo(p.x,p.y);ctx!.lineTo(q.x,q.y);
  }
  ctx!.stroke();ctx!.restore();
}
type JunctionArm = { direction:Point; width:number };
type RoadSegment = { a:Point; b:Point; width:number; source:string };
type JunctionGroup = { center:Point; arms:JunctionArm[]; samples:number };
function collectRoadJunctions():{center:Point;arms:JunctionArm[]}[]{
  // Keep each road as a separate source: neighbouring samples of one curved
  // road must never be interpreted as a junction with itself.
  const sources:{id:string;points:Point[];width:number}[]=[
    ...staticRoads.map((road,index)=>({id:'static-'+index,points:smoothPoints(staticRoadPath(road)),width:road.width})),
    ...builtRoads.filter(road=>road.progress>=.999).map((road,index)=>({id:'built-'+index,points:smoothPoints(road.points),width:road.width}))
  ];
  const segments:RoadSegment[]=sources.flatMap(source=>source.points.slice(1).map((point,index)=>({
    a:source.points[index]!,b:point,width:source.width,source:source.id
  })));
  const junctions:JunctionGroup[]=[];
  const getJunction=(point:Point)=>{
    let junction=junctions.find(item=>distance(item.center,point)<.2);
    if(!junction){junction={center:{...point},arms:[],samples:1};junctions.push(junction);}
    else{
      junction.center.x+=(point.x-junction.center.x)/(junction.samples+1);
      junction.center.y+=(point.y-junction.center.y)/(junction.samples+1);
      junction.samples++;
    }
    return junction;
  };
  const addArm=(junction:JunctionGroup,from:Point,to:Point,width:number)=>{
    const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy);if(len<.12)return;
    const direction={x:dx/len,y:dy/len};
    const existing=junction.arms.find(arm=>arm.direction.x*direction.x+arm.direction.y*direction.y>.985);
    if(existing){existing.width=Math.max(existing.width,width);return;}
    junction.arms.push({direction,width});
  };
  for(let i=0;i<segments.length;i++){
    const first=segments[i]!;
    for(let j=i+1;j<segments.length;j++){
      const second=segments[j]!;
      if(first.source===second.source)continue;
      const crossing=segmentIntersection(first.a,first.b,second.a,second.b);
      const shared=distance(first.a,second.a)<.06||distance(first.a,second.b)<.06||distance(first.b,second.a)<.06||distance(first.b,second.b)<.06;
      const point=crossing??(shared?[first.a,first.b].find(p=>distance(p,second.a)<.06||distance(p,second.b)<.06):null);
      if(!point)continue;
      const junction=getJunction(point);
      for(const segment of [first,second]){
        if(distance(segment.a,point)>.06)addArm(junction,point,segment.a,segment.width);
        if(distance(segment.b,point)>.06)addArm(junction,point,segment.b,segment.width);
      }
    }
  }
  return junctions.filter(junction=>junction.arms.length>=3).map(({center,arms})=>({center,arms}));
}
function drawRoadNetwork(){
  const junctions=collectRoadJunctions();
  const base=staticRoads.map(road=>({points:staticRoadPath(road),progress:1,width:road.width}));
  const complete=builtRoads.filter(road=>road.progress>=.999).map(road=>({points:road.points,progress:1,width:road.width}));
  const constructing=builtRoads.filter(road=>road.progress<.999).map(road=>({points:road.points,progress:road.progress,width:road.width}));
  // All finished streets share one pair of filled surface layers. Junction
  // patches are calculated from their arms, so the asphalt is one connected shape.
  strokeRoadNetworkGroup([...base,...complete],'#69777d','#d7dfd0',junctions);
  for(const road of constructing)strokeRoad(road.points,road.progress,'#69777d',1,road.width);
  if(staticRoads[0])drawRoadCentreLinePath(staticRoadPath(staticRoads[0]),true,junctions);
}
function drawTerrain(){
  ctx!.fillStyle='#e9eddf';ctx!.fillRect(0,0,width,height);
  const s=camera.zoom;
  const meadows=[
    {x:-18,y:-7,w:13,h:9,c:'#dce8cf',r:-.16},{x:-3,y:-13,w:13,h:7,c:'#e2e9d4',r:.08},
    {x:9,y:-11,w:12,h:9,c:'#dce8d0',r:-.2},{x:-17,y:13,w:12,h:7,c:'#e1e9d6',r:.1},
    {x:3,y:14,w:15,h:7,c:'#dce7d0',r:-.12},{x:20,y:3,w:7,h:11,c:'#e2ead8',r:.2}
  ];
  for(const a of meadows){const p=worldToScreen({x:a.x,y:a.y});ctx!.save();ctx!.translate(p.x,p.y);ctx!.rotate(a.r);ctx!.fillStyle=a.c;roundedRect(ctx!,-a.w*s/2,-a.h*s/2,a.w*s,a.h*s,1.5*s);ctx!.fill();ctx!.restore();}
  // Gentle parcel contours and cultivated furrows give the valley visual depth.
  ctx!.save();ctx!.strokeStyle='#cbd8bf';ctx!.globalAlpha=.58;ctx!.lineWidth=Math.max(.7,.035*s);
  for(let i=0;i<7;i++){const p=worldToScreen({x:-21+i*6.4,y:-18});ctx!.beginPath();ctx!.moveTo(p.x,p.y);ctx!.quadraticCurveTo(p.x+2.5*s,p.y+1.1*s,p.x+4.7*s,p.y+4.2*s);ctx!.stroke();}
  ctx!.restore();
  const field=worldToScreen({x:-15,y:6.1});
  ctx!.fillStyle='#d3dfb7';roundedRect(ctx!,field.x-2.65*s,field.y-1.9*s,5.3*s,3.8*s,.35*s);ctx!.fill();
  ctx!.save();
  for(let row=0;row<8;row++){
    const y=field.y+(-1.48+row*.42)*s;
    ctx!.strokeStyle=row%2?'#c0d19f':'#b4c58f';ctx!.globalAlpha=.78;ctx!.lineWidth=Math.max(1,.085*s);
    ctx!.beginPath();ctx!.moveTo(field.x-2.25*s,y);ctx!.quadraticCurveTo(field.x,y-.18*s,field.x+2.25*s,y);ctx!.stroke();
    ctx!.strokeStyle='#e8edcf';ctx!.globalAlpha=.68;ctx!.lineWidth=Math.max(.7,.025*s);
    ctx!.beginPath();ctx!.moveTo(field.x-2.2*s,y-.07*s);ctx!.quadraticCurveTo(field.x,y-.25*s,field.x+2.2*s,y-.07*s);ctx!.stroke();
    for(let col=0;col<13;col++){const x=field.x+(-2.08+col*.345)*s+(row%2)*.06*s,yy=y+Math.sin(col*1.7+row)*.045*s;ctx!.fillStyle=col%3?'#91ad72':'#a8bd7e';ctx!.beginPath();ctx!.ellipse(x,yy,.045*s,.09*s,-.25,0,Math.PI*2);ctx!.fill();}
  }
  ctx!.restore();
  const orchard=worldToScreen({x:16.8,y:-4.8});
  ctx!.fillStyle='#d9e5c7';roundedRect(ctx!,orchard.x-2.6*s,orchard.y-2.15*s,5.2*s,4.3*s,.35*s);ctx!.fill();
  ctx!.save();ctx!.strokeStyle='#c0d3a9';ctx!.lineWidth=Math.max(1,.04*s);
  for(let row=0;row<4;row++){ctx!.beginPath();ctx!.moveTo(orchard.x-2.25*s,orchard.y+(-1.45+row*.96)*s);ctx!.lineTo(orchard.x+2.25*s,orchard.y+(-1.45+row*.96)*s);ctx!.stroke();}
  ctx!.restore();
  // Irregular pond shoreline, shallow shelf, reflections and lily pads.
  const pond=worldToScreen({x:16,y:7});
  ctx!.fillStyle='#c6d5bc';ctx!.beginPath();ctx!.ellipse(pond.x,pond.y,4.62*s,3.28*s,-.18,0,Math.PI*2);ctx!.fill();
  ctx!.fillStyle='#b7d2c6';ctx!.beginPath();ctx!.ellipse(pond.x-.08*s,pond.y-.04*s,4.34*s,3.02*s,-.18,0,Math.PI*2);ctx!.fill();
  ctx!.fillStyle='#a9d1d0';ctx!.beginPath();ctx!.moveTo(pond.x-4.1*s,pond.y-.2*s);ctx!.bezierCurveTo(pond.x-3.5*s,pond.y-3.1*s,pond.x+.9*s,pond.y-3.3*s,pond.x+3.8*s,pond.y-1.3*s);ctx!.bezierCurveTo(pond.x+4.6*s,pond.y+.8*s,pond.x+2*s,pond.y+2.8*s,pond.x-.8*s,pond.y+2.6*s);ctx!.bezierCurveTo(pond.x-3.4*s,pond.y+2.4*s,pond.x-4.7*s,pond.y+1.1*s,pond.x-4.1*s,pond.y-.2*s);ctx!.fill();
  ctx!.save();ctx!.strokeStyle='#d9ece2';ctx!.lineWidth=Math.max(1,.075*s);ctx!.globalAlpha=.72;
  for(let i=0;i<4;i++){const yy=(-.72+i*.42)+Math.sin(ambientClock*.65+i)*.05;ctx!.beginPath();ctx!.moveTo(pond.x+(-1.8+i*.12)*s,pond.y+yy*s);ctx!.quadraticCurveTo(pond.x+(-.1+i*.12)*s,pond.y+(yy-.18)*s,pond.x+(1.45-i*.12)*s,pond.y+yy*s);ctx!.stroke();}
  for(const [dx,dy] of [[-2.1,-1.1],[1.85,.85],[.65,-1.8]] as const){ctx!.fillStyle='#83b49b';ctx!.beginPath();ctx!.arc(pond.x+dx*s,pond.y+dy*s,.2*s,.25,Math.PI*1.82);ctx!.lineTo(pond.x+dx*s,pond.y+dy*s);ctx!.fill();ctx!.fillStyle='#f4ead1';ctx!.beginPath();ctx!.arc(pond.x+(dx+.04)*s,pond.y+(dy-.02)*s,.045*s,0,Math.PI*2);ctx!.fill();}
  ctx!.restore();
  for(let i=0;i<18;i++){const angle=i/18*Math.PI*2,rx=4.42+Math.sin(i*3.1)*.12,ry=3.1+Math.cos(i*2.2)*.1,x=pond.x+Math.cos(angle)*rx*s,y=pond.y+Math.sin(angle)*ry*s;if(i%2===0){ctx!.strokeStyle='#849f77';ctx!.lineWidth=Math.max(1,.045*s);ctx!.beginPath();ctx!.moveTo(x,y);ctx!.lineTo(x+Math.sin(i)*.11*s,y-.23*s);ctx!.stroke();}else{ctx!.fillStyle='#d7cba9';ctx!.beginPath();ctx!.ellipse(x,y,.1*s,.065*s,.2,0,Math.PI*2);ctx!.fill();}}
  // Stable, sparse grass tufts and meadow flowers.
  for(let i=0;i<116;i++){
    const x=((i*37)%45)-22,y=((i*61)%35)-18;if(Math.hypot((x-16)/4.8,(y-7)/3.5)<1.08)continue;
    const p=worldToScreen({x,y}),size=Math.max(.7,.04*s)*(i%4===0?1.5:1);
    ctx!.save();ctx!.translate(p.x,p.y);ctx!.rotate((i%7)*.42);ctx!.strokeStyle=i%3===0?'#a4bb8f':'#b6c99e';ctx!.globalAlpha=.42;ctx!.lineWidth=Math.max(.65,.025*s);
    ctx!.beginPath();ctx!.moveTo(0,size);ctx!.quadraticCurveTo(-size*.3,0,-size*.55,-size);ctx!.moveTo(0,size);ctx!.quadraticCurveTo(size*.2,0,size*.62,-size*.75);ctx!.stroke();
    if(i%9===0){ctx!.fillStyle='#f4e8c9';ctx!.beginPath();ctx!.arc(size*.5,-size*.7,Math.max(.7,.045*s),0,Math.PI*2);ctx!.fill();}
    ctx!.restore();
  }
}

function drawDecor(){
  const s=camera.zoom;
  // Hedges and orchard dots use the same quiet palette as the terrain.
  const fences=[[-8.8,-5.4,4.1,0],[-11.1,7.5,4.4,Math.PI/2],[5.8,3.5,3.5,0],[4.2,9.7,5,0],[-18.4,4.2,3.2,0]];
  for(const [x,y,len,angle] of fences){const p=worldToScreen({x,y});ctx!.save();ctx!.translate(p.x,p.y);ctx!.rotate(angle);ctx!.strokeStyle='#b6c9a5';ctx!.lineWidth=Math.max(1,.07*s);ctx!.beginPath();ctx!.moveTo(-len*s/2,0);ctx!.lineTo(len*s/2,0);ctx!.stroke();ctx!.restore();}
  for(let row=0;row<3;row++)for(let col=0;col<4;col++){const p=worldToScreen({x:15.45+col*.9,y:-6.05+row*.95});ctx!.fillStyle='#83a98a';ctx!.beginPath();ctx!.arc(p.x,p.y,.19*s,0,Math.PI*2);ctx!.fill();}
  const gardens=[{x:-6.7,y:-5.35,w:2.1,h:.6},{x:7.7,y:3.15,w:2.2,h:.55},{x:2.8,y:9.65,w:2.3,h:.55}];
  for(const g of gardens){const p=worldToScreen({x:g.x,y:g.y});ctx!.fillStyle='#c7d9b7';roundedRect(ctx!,p.x-g.w*s/2,p.y-g.h*s/2,g.w*s,g.h*s,.12*s);ctx!.fill();}
  for(const [x,y] of [[-3,-9.8],[7,-1.4],[9,5.8],[-7,1.5],[-3,-15],[8,-15]] as const){const p=worldToScreen({x,y});ctx!.fillStyle='#8a9f85';ctx!.beginPath();ctx!.arc(p.x,p.y,.09*s,0,Math.PI*2);ctx!.fill();}
}
// Shared route sampler for drawing, following distance, junction priority and congestion.
function vehiclePose(vehicle:Vehicle):{x:number;y:number;angle:number;heading:Point}{
  const target=clamp(vehicle.distance,0,vehicle.routeLength);
  let travelled=0;
  for(let i=0;i<vehicle.lengths.length;i++){
    const length=vehicle.lengths[i]!;
    const a=vehicle.path[i]!,b=vehicle.path[i+1]!;
    if(length<.0001)continue;
    if(target<=travelled+length||i===vehicle.lengths.length-1){
      const t=clamp((target-travelled)/length,0,1);
      const heading={x:(b.x-a.x)/length,y:(b.y-a.y)/length};
      return{x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),angle:Math.atan2(heading.y,heading.x),heading};
    }
    travelled+=length;
  }
  const end=vehicle.path[vehicle.path.length-1]??{x:0,y:0};
  const previous=vehicle.path[vehicle.path.length-2]??end;
  const length=distance(previous,end)||1;
  const heading={x:(end.x-previous.x)/length,y:(end.y-previous.y)/length};
  return{x:end.x,y:end.y,angle:Math.atan2(heading.y,heading.x),heading};
}
function drawCar(vehicle:Vehicle){
  const pose=vehiclePose(vehicle),p=worldToScreen({x:pose.x,y:pose.y}),s=camera.zoom;
  const seed=vehicle.destinationId.split('').reduce((sum,char)=>sum+char.charCodeAt(0),0);
  const length=seed%4===0?1.38:seed%3===0?1.2:1.29;
  const bodyWidth=seed%5===0?.43:.46;
  const roofTone=seed%2===0?'#f4ead7':'#e9f0e8';
  const glass=seed%3===0?'#8fb8bd':'#a8c9ca';
  ctx!.save();ctx!.translate(p.x,p.y);ctx!.rotate(pose.angle);
  // Soft contact shadow and a dark underbody create a grounded miniature vehicle.
  ctx!.fillStyle='#53666a';ctx!.globalAlpha=.2;ctx!.beginPath();ctx!.ellipse(-.015*s,.085*s,(length*.57)*s,.31*s,0,0,Math.PI*2);ctx!.fill();ctx!.globalAlpha=1;
  ctx!.fillStyle='#38494d';roundedRect(ctx!,-length*.53*s,-.255*s,length*1.06*s,.51*s,.16*s);ctx!.fill();
  // Four compact tyres, all kept inside the lane envelope.
  for(const x of [-length*.32,length*.32]){
    for(const y of [-.225,.225]){
      ctx!.fillStyle='#29383b';roundedRect(ctx!,(x-.105)*s,(y-.058)*s,.21*s,.116*s,.045*s);ctx!.fill();
      ctx!.fillStyle='#84918c';roundedRect(ctx!,(x-.045)*s,(y-.035)*s,.09*s,.07*s,.025*s);ctx!.fill();
    }
  }
  // Body shell with a subtle painted-metal gradient.
  const paint=ctx!.createLinearGradient(0,-.25*s,0,.25*s);
  paint.addColorStop(0,'#ffffff');paint.addColorStop(.16,vehicle.color);paint.addColorStop(.72,vehicle.color);paint.addColorStop(1,'#53666a');
  ctx!.fillStyle=paint;roundedRect(ctx!,-length*.5*s,-bodyWidth*.5*s,length*s,bodyWidth*s,.14*s);ctx!.fill();
  ctx!.strokeStyle='rgba(48,65,65,.55)';ctx!.lineWidth=Math.max(.7,.025*s);ctx!.stroke();
  // Front and rear glass are separate, with a narrow painted roof between them.
  const cabinLength=length*.54;
  ctx!.fillStyle='#536d70';roundedRect(ctx!,-cabinLength*.5*s,-.19*s,cabinLength*s,.38*s,.095*s);ctx!.fill();
  ctx!.fillStyle=glass;roundedRect(ctx!,.035*s,-.155*s,cabinLength*.39*s,.31*s,.065*s);ctx!.fill();
  ctx!.fillStyle=roofTone;ctx!.globalAlpha=.88;roundedRect(ctx!,-cabinLength*.39*s,-.155*s,cabinLength*.34*s,.31*s,.06*s);ctx!.fill();ctx!.globalAlpha=1;
  // Windshield reflections and roof panel.
  ctx!.strokeStyle='rgba(255,255,255,.62)';ctx!.lineWidth=Math.max(.8,.035*s);ctx!.beginPath();ctx!.moveTo(.1*s,-.12*s);ctx!.lineTo(.29*s,-.12*s);ctx!.stroke();
  ctx!.fillStyle='rgba(255,255,255,.22)';roundedRect(ctx!,-.13*s,-.12*s,.14*s,.24*s,.035*s);ctx!.fill();
  // Door seam, handles and bumpers add scale cues without visual clutter.
  ctx!.strokeStyle='rgba(55,70,67,.52)';ctx!.lineWidth=Math.max(.7,.022*s);ctx!.beginPath();ctx!.moveTo(-.02*s,-bodyWidth*.49*s);ctx!.lineTo(-.02*s,bodyWidth*.49*s);ctx!.stroke();
  ctx!.fillStyle='#f0e7d3';roundedRect(ctx!,-length*.5*s,-.12*s,.045*s,.24*s,.02*s);ctx!.fill();
  ctx!.fillStyle='#fff1c9';roundedRect(ctx!,(length*.5-.09)*s,-.145*s,.07*s,.095*s,.025*s);ctx!.fill();roundedRect(ctx!,(length*.5-.09)*s,.05*s,.07*s,.095*s,.025*s);ctx!.fill();
  ctx!.fillStyle='#c96f61';roundedRect(ctx!,-length*.5*s,-.14*s,.055*s,.1*s,.02*s);ctx!.fill();roundedRect(ctx!,-length*.5*s,.04*s,.055*s,.1*s,.02*s);ctx!.fill();
  // A tiny specular strip gives each car a readable silhouette at normal zoom.
  ctx!.strokeStyle='rgba(255,255,255,.55)';ctx!.lineWidth=Math.max(.8,.035*s);ctx!.beginPath();ctx!.moveTo(-length*.34*s,-bodyWidth*.38*s);ctx!.quadraticCurveTo(0,-bodyWidth*.52*s,length*.34*s,-bodyWidth*.38*s);ctx!.stroke();
  ctx!.restore();
}
let ambientClock=0;
const walkers=[
  {path:[{x:-7.15,y:-5.2},{x:-6.5,y:-5.65},{x:-5.85,y:-5.2},{x:-6.5,y:-4.75}],phase:0,color:'#d77c65'},
  {path:[{x:7.05,y:3.8},{x:7.7,y:4.15},{x:8.35,y:3.8},{x:7.7,y:3.45}],phase:2.1,color:'#5e8fa0'},
  {path:[{x:10.25,y:-2.9},{x:11.1,y:-2.65},{x:11.85,y:-2.9},{x:11.1,y:-3.2}],phase:4.2,color:'#d5a84f'}
];
function drawTree(x:number,y:number,size=1){
  const p=worldToScreen({x,y}),s=camera.zoom*size,seed=Math.abs(Math.floor(x*7+y*13));
  const greens=['#6f9878','#789f80','#83a989','#71977a'];
  ctx!.save();
  // Soft contact shadow and a small trunk anchor keep the canopy grounded.
  ctx!.fillStyle='#718b70';ctx!.globalAlpha=.22;ctx!.beginPath();ctx!.ellipse(p.x+.12*s,p.y+.28*s,.68*s,.43*s,-.18,0,Math.PI*2);ctx!.fill();
  ctx!.globalAlpha=1;ctx!.fillStyle='#947b5e';ctx!.beginPath();ctx!.arc(p.x,p.y+.05*s,.16*s,0,Math.PI*2);ctx!.fill();
  const lobes=[[-.22,-.12,.36],[.2,-.2,.35],[-.32,.19,.32],[.18,.2,.39],[0,0,.43],[.02,-.36,.25]];
  for(let i=0;i<lobes.length;i++){
    const [dx,dy,r]=lobes[i]!;
    ctx!.fillStyle=greens[(seed+i)%greens.length]!;
    ctx!.beginPath();ctx!.arc(p.x+dx*s,p.y+dy*s,r*s,0,Math.PI*2);ctx!.fill();
  }
  ctx!.fillStyle='#a9c49b';ctx!.globalAlpha=.72;ctx!.beginPath();ctx!.arc(p.x-.13*s,p.y-.24*s,.18*s,0,Math.PI*2);ctx!.fill();
  ctx!.globalAlpha=.25;ctx!.fillStyle='#496f58';ctx!.beginPath();ctx!.arc(p.x+.16*s,p.y+.13*s,.27*s,.1,Math.PI*.9);ctx!.fill();
  ctx!.restore();
}

function drawHouse(x:number,y:number,scale=1,wall='#f4e7c9',roof='#d98c73'){
  const p=worldToScreen({x,y}),s=camera.zoom*scale;ctx!.save();ctx!.translate(p.x,p.y);
  // Garden plot, soft building shadow and a real roof silhouette.
  ctx!.fillStyle='#d5e2c5';roundedRect(ctx!,-1.58*s,-1.32*s,3.16*s,2.64*s,.34*s);ctx!.fill();
  ctx!.strokeStyle='#b9cda9';ctx!.lineWidth=Math.max(1,.035*s);ctx!.setLineDash([.12*s,.13*s]);roundedRect(ctx!,-1.48*s,-1.22*s,2.96*s,2.44*s,.28*s);ctx!.stroke();ctx!.setLineDash([]);
  ctx!.fillStyle='#9ba98d';ctx!.globalAlpha=.2;roundedRect(ctx!,-1.12*s,-.77*s+.17*s,2.24*s,1.78*s,.18*s);ctx!.fill();ctx!.globalAlpha=1;
  ctx!.fillStyle='#e9dfc7';roundedRect(ctx!,-1.13*s,-.83*s,2.26*s,1.76*s,.18*s);ctx!.fill();
  ctx!.fillStyle=wall;roundedRect(ctx!,-1.02*s,-.75*s,2.04*s,1.58*s,.13*s);ctx!.fill();
  ctx!.fillStyle=roof;
  ctx!.beginPath();ctx!.moveTo(-1.13*s,-.78*s);ctx!.lineTo(-.72*s,-1.02*s);ctx!.lineTo(.73*s,-1.02*s);ctx!.lineTo(1.13*s,-.78*s);ctx!.lineTo(1.13*s,.77*s);ctx!.lineTo(.72*s,1.02*s);ctx!.lineTo(-.73*s,1.02*s);ctx!.lineTo(-1.13*s,.77*s);ctx!.closePath();ctx!.fill();
  ctx!.strokeStyle='#a85f57';ctx!.lineWidth=Math.max(1,.045*s);ctx!.stroke();
  // Roof panels, ridge cap and warm reflected light.
  ctx!.strokeStyle='#ffffff';ctx!.globalAlpha=.19;ctx!.lineWidth=Math.max(1,.07*s);
  for(const yy of [-.56,-.28,0,.28,.56]){ctx!.beginPath();ctx!.moveTo(-.91*s,yy*s);ctx!.lineTo(.91*s,yy*s);ctx!.stroke();}
  ctx!.globalAlpha=.42;ctx!.strokeStyle='#784f4a';ctx!.lineWidth=Math.max(1,.07*s);ctx!.beginPath();ctx!.moveTo(0,-.9*s);ctx!.lineTo(0,.9*s);ctx!.stroke();ctx!.globalAlpha=1;
  ctx!.fillStyle='#f4d8b2';roundedRect(ctx!,-.83*s,-.69*s,.32*s,.27*s,.05*s);ctx!.fill();
  ctx!.fillStyle='#f4d8b2';roundedRect(ctx!,.51*s,-.69*s,.32*s,.27*s,.05*s);ctx!.fill();
  ctx!.fillStyle='#b6d8d2';roundedRect(ctx!,-.77*s,-.62*s,.2*s,.17*s,.025*s);ctx!.fill();
  ctx!.fillStyle='#b6d8d2';roundedRect(ctx!,.57*s,-.62*s,.2*s,.17*s,.025*s);ctx!.fill();
  // Front porch, steps and a path through the garden.
  ctx!.fillStyle='#c9b99b';roundedRect(ctx!,-.34*s,.72*s,.68*s,.36*s,.07*s);ctx!.fill();
  ctx!.fillStyle='#ead9b8';roundedRect(ctx!,-.19*s,.31*s,.38*s,.48*s,.06*s);ctx!.fill();
  ctx!.fillStyle='#f6e7c9';roundedRect(ctx!,-.25*s,.78*s,.5*s,.11*s,.04*s);ctx!.fill();
  ctx!.fillStyle='#c7d6b4';ctx!.beginPath();ctx!.moveTo(-.2*s,1.05*s);ctx!.lineTo(.2*s,1.05*s);ctx!.lineTo(.34*s,1.31*s);ctx!.lineTo(-.34*s,1.31*s);ctx!.closePath();ctx!.fill();
  // Small shrubs and a chimney cap add readable scale at normal zoom.
  for(const [sx,sy] of [[-1.28,.72],[1.27,-.62],[-1.23,-.82]] as const){ctx!.fillStyle='#77a17e';ctx!.beginPath();ctx!.arc(sx*s,sy*s,.16*s,0,Math.PI*2);ctx!.fill();ctx!.fillStyle='#a8c69a';ctx!.beginPath();ctx!.arc((sx-.04)*s,(sy-.05)*s,.07*s,0,Math.PI*2);ctx!.fill();}
  ctx!.fillStyle='#a9a18c';roundedRect(ctx!,.61*s,-1.03*s,.23*s,.31*s,.035*s);ctx!.fill();
  ctx!.restore();
}

function drawShop(x:number,y:number){
  const p=worldToScreen({x,y}),s=camera.zoom;ctx!.save();ctx!.translate(p.x,p.y);
  // A paved forecourt is part of the site, not a separate road tile.
  ctx!.fillStyle='#d7e2c9';roundedRect(ctx!,-2.35*s,-1.85*s,4.7*s,3.7*s,.3*s);ctx!.fill();
  ctx!.fillStyle='#c8d1c2';roundedRect(ctx!,-2.18*s,.95*s,4.36*s,.62*s,.12*s);ctx!.fill();
  ctx!.strokeStyle='#f2ead4';ctx!.lineWidth=Math.max(1,.045*s);
  for(let i=0;i<3;i++){const x=-1.72+i*1.55;ctx!.beginPath();ctx!.moveTo(x*s,1.02*s);ctx!.lineTo((x+.92)*s,1.02*s);ctx!.stroke();}
  ctx!.fillStyle='#a3b39a';ctx!.globalAlpha=.2;roundedRect(ctx!,-1.72*s,-1.12*s,3.44*s,2.52*s,.2*s);ctx!.fill();ctx!.globalAlpha=1;
  ctx!.fillStyle='#e8dfc8';roundedRect(ctx!,-1.78*s,-1.36*s,3.56*s,2.62*s,.18*s);ctx!.fill();
  ctx!.fillStyle='#648c86';ctx!.beginPath();ctx!.moveTo(-1.62*s,-1.1*s);ctx!.lineTo(-1.22*s,-1.48*s);ctx!.lineTo(1.22*s,-1.48*s);ctx!.lineTo(1.62*s,-1.1*s);ctx!.lineTo(1.62*s,1.08*s);ctx!.lineTo(-1.62*s,1.08*s);ctx!.closePath();ctx!.fill();
  ctx!.strokeStyle='#416e6c';ctx!.lineWidth=Math.max(1,.05*s);ctx!.stroke();
  // Roof seams and a bright shop canopy.
  ctx!.strokeStyle='#a9c7b9';ctx!.globalAlpha=.55;ctx!.lineWidth=Math.max(1,.055*s);
  for(let i=-2;i<=2;i++){ctx!.beginPath();ctx!.moveTo(i*.48*s,-1.18*s);ctx!.lineTo(i*.48*s,.88*s);ctx!.stroke();}
  ctx!.globalAlpha=1;
  ctx!.fillStyle='#f4e8cb';roundedRect(ctx!,-1.42*s,-.62*s,2.84*s,.48*s,.08*s);ctx!.fill();
  for(let i=0;i<7;i++){ctx!.fillStyle=i%2?'#e4b86f':'#f8e9c7';roundedRect(ctx!,(-1.34+i*.45)*s,-.58*s,.4*s,.4*s,.035*s);ctx!.fill();}
  ctx!.fillStyle='#d8e9df';roundedRect(ctx!,-.78*s,.03*s,1.56*s,.65*s,.07*s);ctx!.fill();
  ctx!.strokeStyle='#f7ecd5';ctx!.lineWidth=Math.max(1,.05*s);ctx!.beginPath();ctx!.moveTo(0,.05*s);ctx!.lineTo(0,.65*s);ctx!.stroke();
  ctx!.fillStyle='#e5d4b4';roundedRect(ctx!,-.2*s,.65*s,.4*s,.36*s,.04*s);ctx!.fill();
  ctx!.fillStyle='#f2e6ca';roundedRect(ctx!,-.68*s,-1.67*s,1.36*s,.18*s,.06*s);ctx!.fill();
  ctx!.fillStyle='#648c86';ctx!.font='700 '+Math.max(6,.22*s)+'px Arial';ctx!.textAlign='center';ctx!.textBaseline='middle';ctx!.fillText('MARKET',0,-1.58*s);
  ctx!.restore();
}

function drawBarn(x:number,y:number){
  const p=worldToScreen({x,y}),s=camera.zoom;ctx!.save();ctx!.translate(p.x,p.y);
  ctx!.fillStyle='#d4e0c2';roundedRect(ctx!,-2.42*s,-1.86*s,4.84*s,3.72*s,.28*s);ctx!.fill();
  // Loading yard faces the access road on the east side.
  ctx!.fillStyle='#c8d0bd';roundedRect(ctx!,1.78*s,-.88*s,.52*s,1.76*s,.08*s);ctx!.fill();
  ctx!.strokeStyle='#eee6d2';ctx!.lineWidth=Math.max(1,.045*s);ctx!.beginPath();ctx!.moveTo(1.9*s,-.65*s);ctx!.lineTo(2.18*s,-.65*s);ctx!.moveTo(1.9*s,.65*s);ctx!.lineTo(2.18*s,.65*s);ctx!.stroke();
  ctx!.fillStyle='#9d8673';ctx!.globalAlpha=.2;roundedRect(ctx!,-1.92*s,-1.25*s+.16*s,3.82*s,2.5*s,.16*s);ctx!.fill();ctx!.globalAlpha=1;
  ctx!.fillStyle='#d7a08a';roundedRect(ctx!,-1.96*s,-1.28*s,3.92*s,2.56*s,.14*s);ctx!.fill();
  ctx!.fillStyle='#bd7567';ctx!.beginPath();ctx!.moveTo(-1.83*s,-1.12*s);ctx!.lineTo(-1.45*s,-1.42*s);ctx!.lineTo(1.45*s,-1.42*s);ctx!.lineTo(1.83*s,-1.12*s);ctx!.lineTo(1.83*s,1.12*s);ctx!.lineTo(-1.83*s,1.12*s);ctx!.closePath();ctx!.fill();
  ctx!.strokeStyle='#9e5e55';ctx!.lineWidth=Math.max(1,.055*s);ctx!.stroke();
  ctx!.strokeStyle='#e9b79d';ctx!.globalAlpha=.55;ctx!.lineWidth=Math.max(1,.045*s);
  for(let i=-3;i<=3;i++){ctx!.beginPath();ctx!.moveTo(i*.43*s,-1.1*s);ctx!.lineTo(i*.43*s,1.1*s);ctx!.stroke();}
  ctx!.globalAlpha=1;
  // Broad sliding doors and a clear east-facing service entrance.
  ctx!.fillStyle='#edc6a5';roundedRect(ctx!,-.72*s,.28*s,1.44*s,.72*s,.08*s);ctx!.fill();
  ctx!.strokeStyle='#ad685c';ctx!.lineWidth=Math.max(1,.06*s);ctx!.beginPath();ctx!.moveTo(0,.31*s);ctx!.lineTo(0,.97*s);ctx!.stroke();
  ctx!.fillStyle='#f1d8b8';roundedRect(ctx!,1.62*s,-.34*s,.2*s,.68*s,.04*s);ctx!.fill();
  ctx!.fillStyle='#e8dfc7';roundedRect(ctx!,-1.62*s,-1.04*s,.42*s,.34*s,.04*s);ctx!.fill();
  ctx!.fillStyle='#e8dfc7';roundedRect(ctx!,1.2*s,-1.04*s,.42*s,.34*s,.04*s);ctx!.fill();
  ctx!.fillStyle='#d7b66f';ctx!.beginPath();ctx!.arc(-2.05*s,1.36*s,.23*s,0,Math.PI*2);ctx!.fill();
  ctx!.restore();
}

function drawFuelStation(x:number,y:number){
  const p=worldToScreen({x,y}),s=camera.zoom;ctx!.save();ctx!.translate(p.x,p.y);
  ctx!.fillStyle='#d7e2c8';roundedRect(ctx!,-2.38*s,-1.78*s,4.76*s,3.56*s,.28*s);ctx!.fill();
  // Compact service building at the back of the forecourt.
  ctx!.fillStyle='#9eaa91';ctx!.globalAlpha=.2;roundedRect(ctx!,-.9*s,-1.46*s,1.8*s,.98*s,.12*s);ctx!.fill();ctx!.globalAlpha=1;
  ctx!.fillStyle='#eee5d0';roundedRect(ctx!,-.94*s,-1.56*s,1.88*s,.94*s,.12*s);ctx!.fill();
  ctx!.fillStyle='#77a79b';roundedRect(ctx!,-.78*s,-1.42*s,1.56*s,.64*s,.08*s);ctx!.fill();
  ctx!.fillStyle='#d7e8df';roundedRect(ctx!,-.55*s,-1.28*s,1.1*s,.28*s,.05*s);ctx!.fill();
  // One broad canopy with a soft cast shadow and four visible supports.
  ctx!.fillStyle='#91a28f';ctx!.globalAlpha=.22;roundedRect(ctx!,-2.02*s,-.18*s,4.04*s,1.55*s,.18*s);ctx!.fill();ctx!.globalAlpha=1;
  ctx!.fillStyle='#f3e7ca';roundedRect(ctx!,-2.02*s,-.32*s,4.04*s,1.48*s,.18*s);ctx!.fill();
  ctx!.fillStyle='#6f9d91';roundedRect(ctx!,-1.9*s,-.25*s,3.8*s,1.32*s,.14*s);ctx!.fill();
  ctx!.fillStyle='#f5e8c9';roundedRect(ctx!,-1.86*s,-.2*s,3.72*s,.17*s,.06*s);ctx!.fill();
  ctx!.fillStyle='#f5f0df';
  for(const dx of [-1.18,0,1.18]){
    roundedRect(ctx!,(dx-.25)*s,.14*s,.5*s,.76*s,.08*s);ctx!.fill();
    ctx!.fillStyle='#b9d8d2';roundedRect(ctx!,(dx-.16)*s,.23*s,.32*s,.2*s,.035*s);ctx!.fill();
    ctx!.fillStyle='#c17d63';ctx!.lineWidth=Math.max(1,.045*s);ctx!.beginPath();ctx!.moveTo((dx+.2)*s,.3*s);ctx!.quadraticCurveTo((dx+.39)*s,.44*s,(dx+.27)*s,.73*s);ctx!.stroke();
    ctx!.fillStyle='#f5f0df';
  }
  for(const [dx,dy] of [[-1.86,-.18],[1.86,-.18],[-1.86,.98],[1.86,.98]] as const){ctx!.fillStyle='#e8e0c8';roundedRect(ctx!,(dx-.045)*s,(dy-.045)*s,.09*s,.09*s,.025*s);ctx!.fill();}
  ctx!.fillStyle='#d7a65f';roundedRect(ctx!,-.42*s,1.23*s,.84*s,.18*s,.06*s);ctx!.fill();
  ctx!.fillStyle='#6f9d91';ctx!.font='700 '+Math.max(6,.2*s)+'px Arial';ctx!.textAlign='center';ctx!.textBaseline='middle';ctx!.fillText('FUEL',0,1.32*s);
  ctx!.restore();
}


function drawFarmDetails(){
  const s=camera.zoom,p=worldToScreen({x:-18.1,y:8.4});
  // A soft paddock with a broken timber fence and a clear gate.
  ctx!.fillStyle='#cddbb8';roundedRect(ctx!,p.x-1.98*s,p.y-1.28*s,3.96*s,2.56*s,.24*s);ctx!.fill();
  ctx!.fillStyle='#d8dfbd';roundedRect(ctx!,p.x-1.78*s,p.y-1.08*s,3.56*s,2.16*s,.18*s);ctx!.fill();
  ctx!.strokeStyle='#a9bd91';ctx!.lineWidth=Math.max(1,.055*s);ctx!.setLineDash([.2*s,.12*s]);ctx!.strokeRect(p.x-1.7*s,p.y-1.02*s,3.4*s,2.04*s);ctx!.setLineDash([]);
  ctx!.fillStyle='#a88d68';roundedRect(ctx!,p.x-.3*s,p.y+.62*s,.92*s,.18*s,.06*s);ctx!.fill();
  for(const [dx,dy] of [[-.8,-.3],[.55,.35],[.1,-.65]] as const){ctx!.fillStyle='#e6c77f';ctx!.beginPath();ctx!.ellipse(p.x+dx*s,p.y+dy*s,.25*s,.17*s,-.18,0,Math.PI*2);ctx!.fill();ctx!.strokeStyle='#c8a75f';ctx!.lineWidth=Math.max(1,.035*s);ctx!.beginPath();ctx!.arc(p.x+dx*s,p.y+dy*s,.16*s,-1.1,1.1);ctx!.stroke();}
  // Cattle silhouettes with visible heads, patches and legs.
  const cattle=[[-1.03,-.35,.94],[.72,-.25,1.18],[-.12,.15,.82]] as const;
  for(const [dx,dy,scale] of cattle){const x=p.x+dx*s,y=p.y+dy*s,q=scale*s;ctx!.fillStyle='#f4eee0';ctx!.beginPath();ctx!.ellipse(x,y,.3*q,.19*q,-.12,0,Math.PI*2);ctx!.fill();ctx!.fillStyle='#7b8177';ctx!.beginPath();ctx!.ellipse(x+.1*q,y-.02*q,.12*q,.13*q,.4,0,Math.PI*2);ctx!.fill();ctx!.fillStyle='#f4eee0';ctx!.beginPath();ctx!.arc(x+.27*q,y-.07*q,.095*q,0,Math.PI*2);ctx!.fill();ctx!.fillStyle='#8a7562';ctx!.beginPath();ctx!.arc(x+.34*q,y-.08*q,.055*q,0,Math.PI*2);ctx!.fill();ctx!.strokeStyle='#887a67';ctx!.lineWidth=Math.max(1,.035*q);for(const leg of [-.17,.13]){ctx!.beginPath();ctx!.moveTo(x+leg*q,y+.11*q);ctx!.lineTo(x+(leg-.015)*q,y+.25*q);ctx!.stroke();}}
  // Parked tractor and a small patch of churned soil.
  const t=worldToScreen({x:-17.4,y:5.9});ctx!.fillStyle='#b8bd9a';ctx!.beginPath();ctx!.ellipse(t.x,t.y+.16*s,.68*s,.3*s,-.2,0,Math.PI*2);ctx!.fill();
  ctx!.save();ctx!.translate(t.x,t.y);ctx!.rotate(-.22);ctx!.fillStyle='#c69b54';ctx!.beginPath();ctx!.arc(-.22*s,.14*s,.17*s,0,Math.PI*2);ctx!.arc(.34*s,.14*s,.13*s,0,Math.PI*2);ctx!.fill();ctx!.fillStyle='#d9ad58';roundedRect(ctx!,-.48*s,-.22*s,.96*s,.44*s,.12*s);ctx!.fill();ctx!.fillStyle='#7fa39a';roundedRect(ctx!,-.12*s,-.4*s,.36*s,.28*s,.05*s);ctx!.fill();ctx!.fillStyle='#e9e3d2';roundedRect(ctx!,-.04*s,-.35*s,.18*s,.16*s,.025*s);ctx!.fill();ctx!.restore();
}

function drawWorldLabel(text:string,point:Point,color='#53675a'){
  const p=worldToScreen(point),font=Math.max(7,Math.min(10,camera.zoom*.31));ctx!.save();ctx!.font='700 '+font+'px Arial,sans-serif';ctx!.textAlign='center';ctx!.textBaseline='middle';
  ctx!.fillStyle='#f4f5ebd9';const w=ctx!.measureText(text).width+12,h=font+7;roundedRect(ctx!,p.x-w/2,p.y-h/2,w,h,h/2);ctx!.fill();ctx!.fillStyle=color;ctx!.fillText(text,p.x,p.y+.4);ctx!.restore();
}
function drawMapLabels(){
  drawWorldLabel('ФЕДЕРАЛЬНАЯ ТРАССА',{x:0,y:-15.25});
  drawWorldLabel('АЗС',{x:-8,y:-18.25});
  drawWorldLabel('ФЕРМА',{x:-15.1,y:3.2});
  drawWorldLabel('ЖИЛОЙ РАЙОН',{x:4.2,y:10.9});
  drawWorldLabel('МАГАЗИН',{x:11,y:-7.45});
  drawWorldLabel('САД',{x:16.8,y:-7.9});
}
function drawVillageLife(){
  // Tiny residents walk slowly around their yards with a visible gait and shadow.
  for(const walker of walkers){
    const travel=(ambientClock*.19+walker.phase)%4,segment=Math.floor(travel),t=travel-segment;
    const a=walker.path[segment]!,b=walker.path[(segment+1)%walker.path.length]!;
    const world={x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)},p=worldToScreen(world),s=camera.zoom;
    const angle=Math.atan2(b.y-a.y,b.x-a.x),step=Math.sin(ambientClock*7+walker.phase);
    ctx!.save();ctx!.translate(p.x,p.y);ctx!.rotate(angle);
    ctx!.fillStyle='#62725f';ctx!.globalAlpha=.18;ctx!.beginPath();ctx!.ellipse(0,.13*s,.13*s,.065*s,0,0,Math.PI*2);ctx!.fill();ctx!.globalAlpha=1;
    ctx!.strokeStyle='#5b6258';ctx!.lineWidth=Math.max(1,.035*s);ctx!.lineCap='round';ctx!.beginPath();ctx!.moveTo(-.035*s,.02*s);ctx!.lineTo(-.07*s+step*.045*s,.15*s);ctx!.moveTo(.035*s,.02*s);ctx!.lineTo(.07*s-step*.045*s,.15*s);ctx!.stroke();
    ctx!.fillStyle=walker.color;roundedRect(ctx!,-.075*s,-.08*s,.15*s,.19*s,.055*s);ctx!.fill();
    ctx!.strokeStyle=walker.color;ctx!.lineWidth=Math.max(1,.045*s);ctx!.beginPath();ctx!.moveTo(-.06*s,-.015*s);ctx!.lineTo(-.12*s+step*.025*s,.075*s);ctx!.moveTo(.06*s,-.015*s);ctx!.lineTo(.12*s-step*.025*s,.075*s);ctx!.stroke();
    ctx!.fillStyle='#e8b997';ctx!.beginPath();ctx!.arc(0,-.145*s,.072*s,0,Math.PI*2);ctx!.fill();ctx!.fillStyle='#6c665b';ctx!.beginPath();ctx!.arc(0,-.18*s,.074*s,Math.PI,Math.PI*2);ctx!.fill();ctx!.restore();
  }
  // Soft chimney smoke rises and disperses above the houses.
  const chimneys=[{x:-6.5,y:-4.23},{x:7.7,y:.76},{x:-10.4,y:4.95},{x:2.8,y:7.55}];
  for(let i=0;i<chimneys.length;i++){const p=worldToScreen(chimneys[i]!),s=camera.zoom;for(let puff=0;puff<3;puff++){const phase=(ambientClock*.22+i*.37+puff*.34)%1,x=p.x+Math.sin(ambientClock*.5+i+puff)*.08*s+phase*.2*s,y=p.y-(phase*.72+puff*.08)*s;ctx!.fillStyle='#fff';ctx!.globalAlpha=(1-phase)*.16;ctx!.beginPath();ctx!.arc(x,y,(.035+phase*.055)*s,0,Math.PI*2);ctx!.fill();}}
  ctx!.globalAlpha=1;
}

function render(){
  ctx!.clearRect(0,0,width,height);
  drawTerrain();drawDecor();drawRoadNetwork();
  drawFarmDetails();
  drawBarn(-13,-4);
  drawHouse(-6.5,-3.2,1.05,'#f3e6c8','#d98d75');
  drawHouse(7.7,1.7,.92,'#e8e4d0','#78a9a5');
  drawHouse(-10.4,5.8,.88,'#f1e4c8','#e0b66f');
  drawHouse(2.8,8.3,.8,'#f2e9d5','#c98b76');
  drawHouse(-5,-9,.72,'#e8e4d0','#81a9a0');
  drawShop(11,-5);drawFuelStation(-8,-16.1);
  drawVillageLife();
  const trees=[[-14,-10,1.2],[-17,-4,.9],[-16,1,.9],[-12,10,1.2],[-4,12,.9],[4,12,.9],[12,9,.9],[15,4,1.2],[14,-9,.9],[6,-5,.9],[-9,-1,.9],[17,0,1.2],[-19,-12,.8],[-20,0,.9],[20,12,1.1],[19,-10,.9],[2,-17,.8],[4,-16,.7]] as const;
  for(const [x,y,size] of trees)drawTree(x,y,size);
  for(const [x,y] of [[15.2,-3.8],[17.6,-3.7],[15.2,-5.8],[17.6,-5.8],[19,-4.8]] as const)drawTree(x,y,.58);
  for(const vehicle of vehicles)drawCar(vehicle);
  drawMapLabels();
  if(draft.length>1){const validation=validateRoadPath(draft);const valid=validation.valid;strokeRoad(draft,1,valid?'#e6b95f':'#d77d70',.95);const first=worldToScreen(draft[0]!);ctx!.fillStyle=valid?'#fff4d3':'#f9d2c8';ctx!.beginPath();ctx!.arc(first.x,.0+first.y,.2*camera.zoom,0,Math.PI*2);ctx!.fill();}
}function segmentIntersection(a:Point,b:Point,c:Point,d:Point):Point|null{
  const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y;
  const denominator=rx*sy-ry*sx;
  if(Math.abs(denominator)<1e-8)return null;
  const qx=c.x-a.x,qy=c.y-a.y;
  const t=(qx*sy-qy*sx)/denominator,u=(qx*ry-qy*rx)/denominator;
  if(t<-.0001||t>1.0001||u<-.0001||u>1.0001)return null;
  return{x:a.x+clamp(t,0,1)*rx,y:a.y+clamp(t,0,1)*ry};
}
const roadGraph:RoadGraph={nodes:[],edges:[]};
const networkStatus=document.querySelector<HTMLElement>('#network-status');
function rebuildRoadGraph(){
  roadGraph.nodes.length=0;roadGraph.edges.length=0;
  const sources:{id:string;points:Point[];width:number;kind:'highway'|'local';direction:'both'|'forward'}[]=[
    ...staticRoads.map((r,i)=>({id:'base-'+i,points:smoothPoints(staticRoadPath(r)),width:r.width,kind:r.width>1.45?'highway' as const:'local' as const,direction:r.direction??'both'})),
    ...builtRoads.filter(r=>r.progress>=.999).map((r,i)=>({id:'built-'+i,points:smoothPoints(r.points),width:r.width,kind:r.width>1.45?'highway' as const:'local' as const,direction:r.direction}))
  ];
  const getNode=(p:Point)=>{
    let node=roadGraph.nodes.find(n=>Math.hypot(n.x-p.x,n.y-p.y)<.08);
    if(!node){node={id:roadGraph.nodes.length,x:p.x,y:p.y,edgeIds:[]};roadGraph.nodes.push(node);}
    return node;
  };
  for(const source of sources){
    for(let i=1;i<source.points.length;i++){
      const a=source.points[i-1]!,b=source.points[i]!;
      const splits:{t:number;p:Point}[]=[{t:0,p:a},{t:1,p:b}];
      for(const other of sources){
        for(let j=1;j<other.points.length;j++){
          const hit=segmentIntersection(a,b,other.points[j-1]!,other.points[j]!);
          if(hit){
            const dx=b.x-a.x,dy=b.y-a.y;
            const t=Math.abs(dx)>=Math.abs(dy)?(hit.x-a.x)/(dx||1):(hit.y-a.y)/(dy||1);
            if(t>.0001&&t<.9999)splits.push({t,p:hit});
          }
        }
      }
      splits.sort((x,y)=>x.t-y.t);
      const unique=splits.filter((s,k)=>k===0||Math.abs(s.t-splits[k-1]!.t)>.0001);
      for(let k=1;k<unique.length;k++){
        const from=getNode(unique[k-1]!.p),to=getNode(unique[k]!.p);
        if(from.id===to.id)continue;
        const id=source.id+'-'+i+'-'+k;
        const edge:RoadGraphEdge={id,from:from.id,to:to.id,width:source.width,kind:source.kind,source:source.id,forward:true,reverse:source.direction==='both',active:false};
        roadGraph.edges.push(edge);from.edgeIds.push(id);to.edgeIds.push(id);
      }
    }
  }
  classifyRoadActivity();
  const active=roadGraph.edges.filter(edge=>edge.active).length;
  if(networkStatus)networkStatus.textContent=active+' активных / '+roadGraph.edges.length+' участков';
  if(activeRoadCount)activeRoadCount.textContent=String(active);
}
// KT-011: graph-based shortest path for all demonstration vehicles.
function nearestGraphNode(point:Point):RoadGraphNode|null{
  let best:RoadGraphNode|null=null,bestDistance=Infinity;
  for(const node of roadGraph.nodes){const d=distance(point,node);if(d<bestDistance){bestDistance=d;best=node;}}
  return best;
}
// A road segment is useful when it belongs to a route between meaningful
// access points. Repeatedly peel unanchored leaf branches: this keeps loops
// and links between two existing roads, while closing blind spurs.
function classifyRoadActivity(){
  const anchorPoints=[demoStart,demoExit,...trafficDestinations.map(destination=>destination.access),...fuelStations.map(station=>station.access)];
  const anchors=new Set<number>();
  for(const point of anchorPoints){const node=nearestGraphNode(point);if(node)anchors.add(node.id);}
  const activeIds=new Set(roadGraph.edges.map(edge=>edge.id));
  let changed=true;
  while(changed){
    changed=false;
    const degree=new Map<number,number>(roadGraph.nodes.map(node=>[node.id,0]));
    for(const edge of roadGraph.edges){
      if(!activeIds.has(edge.id))continue;
      degree.set(edge.from,(degree.get(edge.from)??0)+1);
      degree.set(edge.to,(degree.get(edge.to)??0)+1);
    }
    const remove:string[]=[];
    for(const node of roadGraph.nodes){
      if(anchors.has(node.id)||(degree.get(node.id)??0)>1)continue;
      for(const edgeId of node.edgeIds)if(activeIds.has(edgeId))remove.push(edgeId);
    }
    for(const edgeId of remove){if(activeIds.delete(edgeId))changed=true;}
  }
  // A detached loop is not useful merely because it has no loose endpoint.
  const reached=new Set<number>(),queue=[...anchors];
  for(const id of queue)reached.add(id);
  while(queue.length){
    const current=queue.shift()!;
    const node=roadGraph.nodes[current];if(!node)continue;
    for(const edgeId of node.edgeIds){
      if(!activeIds.has(edgeId))continue;
      const edge=roadGraph.edges.find(item=>item.id===edgeId);if(!edge)continue;
      const next=edge.from===current?edge.to:edge.from;
      if(!reached.has(next)){reached.add(next);queue.push(next);}
    }
  }
  for(const edge of roadGraph.edges)edge.active=activeIds.has(edge.id)&&reached.has(edge.from)&&reached.has(edge.to);
}
type TrafficRouteSnapshot={x:number;y:number;heading:Point;speed:number;cruiseSpeed:number};
function estimatedRoadCost(edge:RoadGraphEdge,traffic:TrafficRouteSnapshot[]){
  const a=roadGraph.nodes[edge.from]!,b=roadGraph.nodes[edge.to]!;
  const length=distance(a,b),dx=(b.x-a.x)/(length||1),dy=(b.y-a.y)/(length||1);
  let movingTraffic=0,queuedTraffic=0;
  for(const vehicle of traffic){
    const lateral=distanceToSegment({x:vehicle.x,y:vehicle.y},a,b);
    const alignment=Math.abs(vehicle.heading.x*dx+vehicle.heading.y*dy);
    if(lateral<edge.width*.5+.72&&alignment>.68){
      if(vehicle.speed<vehicle.cruiseSpeed*.68)queuedTraffic++;
      else movingTraffic++;
    }
  }
  // A moving car adds a small delay; a stopped/slow queue adds a much
  // stronger penalty, but the cap prevents an extreme detour from winning.
  const congestionPenalty=Math.min(2.35,queuedTraffic*.58+movingTraffic*.075);
  const roadFactor=edge.kind==='highway'?.92:1;
  return length*roadFactor*(1+congestionPenalty);
}
function findRoadPath(start:Point,end:Point):Point[]|null{
  const source=nearestGraphNode(start),target=nearestGraphNode(end);
  if(!source||!target)return null;
  if(source.id===target.id)return[{x:source.x,y:source.y}];
  const traffic=vehicles.map(vehicle=>{
    const pose=vehiclePose(vehicle);
    return{x:pose.x,y:pose.y,heading:pose.heading,speed:vehicle.speed,cruiseSpeed:vehicle.cruiseSpeed};
  });
  const edgeById=new Map(roadGraph.edges.map(edge=>[edge.id,edge]));
  const costs=new Map<number,number>([[source.id,0]]);
  const previous=new Map<number,number|null>([[source.id,null]]);
  const remaining=new Set(roadGraph.nodes.map(node=>node.id));
  while(remaining.size){
    let current:number|null=null,best=Infinity;
    for(const id of remaining){const cost=costs.get(id)??Infinity;if(cost<best){best=cost;current=id;}}
    if(current===null||!Number.isFinite(best))break;
    remaining.delete(current);
    if(current===target.id)break;
    const node=roadGraph.nodes[current]!;
    for(const edgeId of node.edgeIds){
      const edge=edgeById.get(edgeId);
      if(!edge||!edge.active)continue;
      const movingForward=edge.from===current;
      if(movingForward?!edge.forward:!edge.reverse)continue;
      const next=movingForward?edge.to:edge.from;
      if(!remaining.has(next))continue;
      const candidate=best+estimatedRoadCost(edge,traffic);
      if(candidate<(costs.get(next)??Infinity)){costs.set(next,candidate);previous.set(next,current);}
    }
  }
  if(!previous.has(target.id))return null;
  const ids:number[]=[];let cursor:number|null=target.id;
  while(cursor!==null){ids.push(cursor);cursor=previous.get(cursor)??null;}
  ids.reverse();
  return ids.map(id=>({x:roadGraph.nodes[id]!.x,y:roadGraph.nodes[id]!.y}));
}
const demoStart={x:-18,y:-13},demoExit={x:18,y:-13};
type TrafficDestination={id:string;name:string;access:Point;color:string;weight:number};
type TrafficOrigin={id:string;name:string;access:Point;color:string;weight:number};
type TrafficTrip={id:string;origin:TrafficOrigin;destination:TrafficDestination;weight:number};
const fuelStations=[{id:'highway',name:'Заправка на трассе',access:{x:-8,y:-14.65}}];
const trafficDestinations:TrafficDestination[]=[
  {id:'farm',name:'Ферма',access:{x:-10.55,y:-4},color:'#e9c46a',weight:2},
  {id:'west-home',name:'Западный дом',access:{x:-10.4,y:7.45},color:'#78a9b6',weight:1},
  {id:'village-home',name:'Дом у центральной улицы',access:{x:-6.5,y:-1.65},color:'#d98c78',weight:2},
  {id:'south-home',name:'Южный дом',access:{x:-5,y:-7.35},color:'#9aa9d0',weight:1},
  {id:'east-home',name:'Восточный дом',access:{x:7.7,y:3.15},color:'#83a98b',weight:2},
  {id:'north-home',name:'Северный дом',access:{x:2.8,y:9.65},color:'#c28eae',weight:1},
  {id:'market',name:'Магазин у трассы',access:{x:11,y:-7.25},color:'#d7a45f',weight:2}
];
const homeLocations=trafficDestinations.filter(item=>item.id.endsWith('-home'));
const serviceLocations=trafficDestinations.filter(item=>item.id==='farm'||item.id==='market');
const trafficOrigins:TrafficOrigin[]=trafficDestinations.map(item=>({
  id:item.id,name:item.name,access:item.access,color:item.color,weight:item.weight
}));
const tripDestinations=trafficDestinations;
function isHomeLocation(id:string){return id.endsWith('-home');}
function isValidTripPair(originId:string,destinationId:string){
  return isHomeLocation(originId)!==isHomeLocation(destinationId);
}
function buildTrafficRoute(originId:string,destinationId:string):Point[]|null{
  const origin=trafficOrigins.find(item=>item.id===originId);
  const destination=tripDestinations.find(item=>item.id===destinationId);
  if(!origin||!destination||!isValidTripPair(originId,destinationId))return null;
  return findRoadPath(origin.access,destination.access);
}
function getReachableTrips():TrafficTrip[]{
  const trips:TrafficTrip[]=[];
  for(const origin of trafficOrigins){
    for(const destination of tripDestinations){
      if(!isValidTripPair(origin.id,destination.id))continue;
      if(buildTrafficRoute(origin.id,destination.id)){
        trips.push({id:origin.id+'-'+destination.id,origin,destination,weight:origin.weight*destination.weight});
      }
    }
  }
  return trips;
}
function updateDestinationBoard(){
  const board=document.querySelector<HTMLElement>('#destination-board');
  if(!board)return;
  const rows=trafficOrigins.flatMap(origin=>tripDestinations.filter(destination=>isValidTripPair(origin.id,destination.id)).map(destination=>{
    const id=origin.id+'-'+destination.id;
    const ready=reachableTrips.some(trip=>trip.id===id);
    const active=vehicles.filter(vehicle=>vehicle.originId===origin.id&&vehicle.destinationId===destination.id).length;
    const state=!ready?'НЕТ МАРШРУТА':active>=3?'ПЕРЕГРУЗКА':active>0?'В ПУТИ':'МАРШРУТ ОТКРЫТ';
    return '<div class="destination-row '+(ready?'is-connected':'is-disconnected')+(active>=3?' is-busy':'')+'">'+
      '<i style="--destination-color:'+destination.color+'"></i>'+
      '<span><b>'+origin.name+' → '+destination.name+'</b><small>'+(destination.weight>1?'Повышенный спрос':'Обычный спрос')+' · '+active+' '+(active===1?'машина':active>=2&&active<=4?'машины':'машин')+'</small></span>'+
      '<em>'+(ready?state:'НЕТ МАРШРУТА')+'</em></div>';
  }));
  board.innerHTML=rows.join('');
  const summary=document.querySelector<HTMLElement>('#destination-summary');
  if(summary)summary.textContent=reachableTrips.length+' из '+(homeLocations.length*serviceLocations.length*2)+' маршрутов доступны · оба направления';
}

function offsetRouteToRightSide(path:Point[],offset=.36):Point[]{
  if(path.length<2)return path.map(point=>({...point}));
  const directions=path.slice(1).map((point,index)=>{
    const previous=path[index]!,dx=point.x-previous.x,dy=point.y-previous.y,length=Math.hypot(dx,dy)||1;
    return{x:dx/length,y:dy/length};
  });
  const normals=directions.map(direction=>({x:-direction.y,y:direction.x}));
  const first=path[0]!,firstNormal=normals[0]!;
  const result:Point[]=[{x:first.x+firstNormal.x*offset,y:first.y+firstNormal.y*offset}];
  for(let index=1;index<path.length-1;index++){
    const point=path[index]!,before=directions[index-1]!,after=directions[index]!;
    const beforeNormal=normals[index-1]!,afterNormal=normals[index]!;
    const dot=before.x*after.x+before.y*after.y;
    if(dot<-.82){
      // A compact semicircle made the vehicle spin in place. Use a teardrop
      // turnaround: ease out beyond the street end, then return on the opposite
      // lane with tangent-aligned cubic Bezier handles.
      const p0={x:point.x+beforeNormal.x*offset,y:point.y+beforeNormal.y*offset};
      const p3={x:point.x+afterNormal.x*offset,y:point.y+afterNormal.y*offset};
      const turnRadius=1.35;
      const handle=turnRadius*1.72;
      const p1={x:p0.x+before.x*handle,y:p0.y+before.y*handle};
      // The final Bezier handle must point backwards from P3 so the
      // curve arrives with the outbound tangent (P3 - P2 = after).
      const p2={x:p3.x-after.x*handle,y:p3.y-after.y*handle};
      const samples=24;
      for(let sample=1;sample<=samples;sample++){
        const t=sample/samples,u=1-t;
        result.push({
          x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,
          y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y
        });
      }
      continue;
    }
    const mx=beforeNormal.x+afterNormal.x,my=beforeNormal.y+afterNormal.y,ml=Math.hypot(mx,my);
    if(ml<.001){result.push({x:point.x+afterNormal.x*offset,y:point.y+afterNormal.y*offset});continue;}
    const nx=mx/ml,ny=my/ml;
    const miter=clamp(offset/Math.max(nx*afterNormal.x+ny*afterNormal.y,.35),offset,offset*2.4);
    result.push({x:point.x+nx*miter,y:point.y+ny*miter});
  }
  const last=path[path.length-1]!,lastNormal=normals[normals.length-1]!;
  result.push({x:last.x+lastNormal.x*offset,y:last.y+lastNormal.y*offset});
  return result;
}
function createVehicle(path:Point[],speed:number,origin:TrafficOrigin,destination:TrafficDestination,offset:number):Vehicle{
  path=offsetRouteToRightSide(path);
  const lengths=path.slice(1).map((point,index)=>distance(path[index]!,point));
  const routeLength=lengths.reduce((sum,value)=>sum+value,0);
  return{path,lengths,routeLength,distance:Math.min(offset,routeLength),speed,cruiseSpeed:speed,direction:1,color:destination.color,originId:origin.id,destinationId:destination.id,fuel:72,fuelCapacity:72,stalled:false};
}
let reachableTrips:TrafficTrip[]=[];
let reachableDestinations:TrafficDestination[]=[];
function refreshVehicleRoutes(){
  reachableTrips=getReachableTrips();
  reachableDestinations=tripDestinations.filter(destination=>reachableTrips.some(trip=>trip.destination.id===destination.id));
  for(let i=vehicles.length-1;i>=0;i--){
    const vehicle=vehicles[i]!;
    const destination=tripDestinations.find(item=>item.id===vehicle.destinationId);
    if(!destination)continue;
    // Re-route from the car's actual position, not from its original home.
    // This prevents a newly completed road from teleporting vehicles back
    // to the start of a freshly calculated route.
    const currentPose=vehiclePose(vehicle);
    const currentPoint={x:currentPose.x,y:currentPose.y};
    const nextPath=findRoadPath(currentPoint,destination.access);
    if(!nextPath)continue;
    const lanePath=offsetRouteToRightSide(nextPath);
    const rebuiltPath=[currentPoint,...lanePath.filter((point,index)=>index>0||distance(point,currentPoint)>.08)];
    if(rebuiltPath.length<2)rebuiltPath.push({...destination.access});
    const lengths=rebuiltPath.slice(1).map((point,index)=>distance(rebuiltPath[index]!,point));
    const routeLength=lengths.reduce((sum,value)=>sum+value,0);
    if(routeLength<.15)continue;
    vehicle.path=rebuiltPath;
    vehicle.lengths=lengths;
    vehicle.routeLength=routeLength;
    vehicle.distance=0;
    vehicle.direction=1;
  }
  updateTrafficCounter();
  updateDestinationBoard();
}
// Only completed roads participate in traffic routing.
rebuildRoadGraph();
reachableTrips=getReachableTrips();
reachableDestinations=tripDestinations.filter(destination=>reachableTrips.some(trip=>trip.destination.id===destination.id));
updateDestinationBoard();
let trafficSpawnTimer=5.5;
function updateTrafficCounter(){
  if(trafficCount)trafficCount.textContent=String(vehicles.length);
  if(jamCount)jamCount.textContent=String(vehicles.filter(vehicle=>vehicle.speed<.32).length);
  if(fuelCount){const average=vehicles.length?vehicles.reduce((sum,vehicle)=>sum+vehicle.fuel/vehicle.fuelCapacity,0)/vehicles.length:1;fuelCount.textContent=vehicles.length?Math.round(average*100)+'%':'—';}
}
function chooseTrafficTrip(){
  if(!reachableTrips.length)return null;
  const candidates=reachableTrips.filter(item=>reachableTrips.length===1||item.id!==lastSpawnedTripId);
  const pool=candidates.length?candidates:reachableTrips;
  const weighted=pool.map(trip=>{
    const active=vehicles.filter(vehicle=>vehicle.originId===trip.origin.id&&vehicle.destinationId===trip.destination.id).length;
    return{trip,score:trip.weight/(1+active*1.8)};
  });
  const total=weighted.reduce((sum,entry)=>sum+entry.score,0);
  let roll=Math.random()*total;
  for(const entry of weighted){roll-=entry.score;if(roll<=0)return entry.trip;}
  return weighted[weighted.length-1]?.trip??null;
}
let lastSpawnedTripId:string|null=null;
function getTrafficSpawnInterval(){
  // More connected destinations create a busier, gradually accelerating town.
  return Math.max(4.8,9.5-reachableTrips.length*.48);
}
function spawnTrafficVehicle(){
  if(!reachableTrips.length)return false;
  const trip=chooseTrafficTrip();
  if(!trip)return false;
  const path=buildTrafficRoute(trip.origin.id,trip.destination.id);if(!path)return false;
  lastSpawnedTripId=trip.id;
  vehicles.push(createVehicle(path,2.05+Math.random()*.35,trip.origin,trip.destination,0));
  updateTrafficCounter();updateDestinationBoard();return true;
}
for(let i=0;i<Math.min(2,reachableTrips.length);i++){
  const trip=reachableTrips[i]!;
  const path=buildTrafficRoute(trip.origin.id,trip.destination.id);
  if(path)vehicles.push(createVehicle(path,i===0?2.25:1.85,trip.origin,trip.destination,i===0?2:8.5));
}
updateTrafficCounter();

function nearestNetworkPoint(p:Point):Point|null{
  let nearest=Infinity,best:Point|null=null;
  for(const edge of roadGraph.edges){
    const a=roadGraph.nodes[edge.from]!,b=roadGraph.nodes[edge.to]!;
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/Math.max(dx*dx+dy*dy,.0001),0,1);
    const projected={x:a.x+dx*t,y:a.y+dy*t},d=distance(p,projected);
    if(d<nearest){nearest=d;best=projected;}
  }
  return best;
}
function nearestNetworkDistance(p:Point){
  const nearest=nearestNetworkPoint(p);
  return nearest?distance(p,nearest):Infinity;
}
function distanceToSegment(p:Point,a:Point,b:Point){
  const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/Math.max(dx*dx+dy*dy,.0001),0,1);
  return distance(p,{x:a.x+dx*t,y:a.y+dy*t});
}
const roadOverlapDistance=roadHalfWidth*1.72;
const roadConnectionTolerance=roadHalfWidth+roadGrid*.75;
const endpointOverlapAllowance=roadOverlapDistance+roadGrid*.5;
function touchesRoadNetwork(p:Point){
  return nearestNetworkDistance(p)<=roadConnectionTolerance;
}
// Roads are connectors, not freehand paint: each end must dock to the
// existing network or to a real building/service entrance.
const buildingSnapDistance=2.45;
function nearestBuildingAccess(p:Point):Point|null{
  let best:Point|null=null,bestDistance=buildingSnapDistance;
  for(const destination of trafficDestinations){
    const d=distance(p,destination.access);
    if(d<bestDistance){bestDistance=d;best=destination.access;}
  }
  return best?{...best}:null;
}
function isBuildingAccess(p:Point){
  return trafficDestinations.some(destination=>distance(p,destination.access)<.08);
}
function snapRoadEndpoint(p:Point):Point|null{
  const network=nearestNetworkPoint(p);
  const networkDistance=network?distance(p,network):Infinity;
  if(network&&networkDistance<=roadConnectionTolerance)return network;
  const building=nearestBuildingAccess(p);
  if(building)return building;
  return null;
}
function isMeaningfulRoadEndpoint(p:Point){
  return touchesRoadNetwork(p)||nearestBuildingAccess(p)!==null;
}
type RoadValidation = { valid:boolean; reason:string };
function validateRoadPath(points:Point[]):RoadValidation{
  if(points.length<2)return{valid:false,reason:'Нужно провести линию хотя бы на один участок.'};
  const start=points[0]!,end=points[points.length-1]!;
  if(!isMeaningfulRoadEndpoint(start)||!isMeaningfulRoadEndpoint(end))return{valid:false,reason:'Дорога должна соединять существующую сеть с дорогой или въездом в здание. Свободные отрезки не строятся.'};
  if(!touchesRoadNetwork(start)&&!touchesRoadNetwork(end))return{valid:false,reason:'Нельзя создавать изолированную улицу: хотя бы один конец должен подключаться к дорожной сети.'};
  if(distance(start,end)<1.1)return{valid:false,reason:'Слишком короткое соединение. Выбери две разные точки сети или въезды.'};

  // A deliberate crossing of a road is a valid junction, not an illegal overlap.
  // Keep a small junction clearance around each true centreline intersection;
  // parallel travel along an existing road remains forbidden.
  const junctionContacts:{point:Point;radius:number}[]=[];
  const existingSegments:{a:Point;b:Point;width:number}[]=[
    ...staticRoads.flatMap(road=>staticRoadPath(road).slice(1).map((point,index)=>({a:staticRoadPath(road)[index]!,b:point,width:road.width}))),
    ...builtRoads.flatMap(road=>road.points.slice(1).map((point,index)=>({a:road.points[index]!,b:point,width:road.width})))
  ];
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!;
    for(const road of existingSegments){
      const crossing=segmentIntersection(a,b,road.a,road.b);
      if(crossing)junctionContacts.push({point:crossing,radius:roadHalfWidth+road.width/2+.24});
    }
  }

  const total=points.slice(1).reduce((sum,p,i)=>sum+distance(p,points[i]!),0);let travelled=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,len=distance(a,b),steps=Math.max(2,Math.ceil(len/.2));
    for(let step=0;step<=steps;step++){
      const t=step/steps,p={x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)};
      const along=travelled+len*t;
      const atBuildingDriveway=(along<1.05&&isBuildingAccess(points[0]!))||(total-along<1.05&&isBuildingAccess(points[points.length-1]!));
      if(!atBuildingDriveway&&obstacles.some(o=>Math.hypot(p.x-o.x,p.y-o.y)<o.r+roadHalfWidth))return{valid:false,reason:'На пути препятствие: здание, дерево или водоём. Обойди его.'};
      const atStart=along<endpointOverlapAllowance,atEnd=total-along<endpointOverlapAllowance;
      const overlapStatic=staticRoads.some(road=>staticRoadPath(road).some((point,index,path)=>index>0&&distanceToSegment(p,path[index-1]!,point)<roadOverlapDistance));
      const overlapBuilt=builtRoads.some(road=>road.points.some((q,index)=>index>0&&distanceToSegment(p,road.points[index-1]!,q)<roadOverlapDistance));
      const atJunction=junctionContacts.some(contact=>distance(p,contact.point)<=contact.radius);
      if((overlapStatic||overlapBuilt)&&!(atStart||atEnd||atJunction))return{valid:false,reason:'Линия слишком долго идёт поверх существующей дороги. Сделай отдельное ответвление.'};
    }
    travelled+=len;
  }
  return{valid:true,reason:''};
}
function updateDraftPath(destination:Point){
  const current=draft[draft.length-1];if(!current||distance(current,destination)<.1)return;
  for(let i=draft.length-2;i>=0;i--){if(distance(draft[i]!,destination)<.1){draft.splice(i+1);return;}}
  // Eight-direction planning: diagonal segments are first-class road geometry,
  // not a staircase of horizontal/vertical cells. Keep samples short enough
  // for obstacle checks and smooth curve construction.
  const span=distance(current,destination);
  const steps=Math.max(1,Math.ceil(span/(roadGrid*.72)));
  for(let step=1;step<=steps;step++){
    const t=step/steps;
    const next={x:lerp(current.x,destination.x,t),y:lerp(current.y,destination.y,t)};
    if(distance(draft[draft.length-1]!,next)>.08)draft.push(next);
  }
}
function pointerPosition(event:MouseEvent):Point{
  const rect=canvas.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};
}
function pointerToGrid(event:PointerEvent):Point{
  const p=screenToWorld(pointerPosition(event));
  return{x:clamp(Math.round(p.x/roadGrid)*roadGrid,-18,18),y:clamp(Math.round(p.y/roadGrid)*roadGrid,-18,15)};
}
function clearDraft(){draft=[];drawing=false;render();}
function updateMission(){
  const done=builtRoads.some(r=>r.connectsVillageToHighway);
  if(missionCount)missionCount.textContent=done?'ВЫПОЛНЕНО':'В РАБОТЕ';
  if(missionProgress)missionProgress.style.width=done?'100%':'12%';
  const missionState=document.querySelector<HTMLElement>('#mission-state');
  if(missionState)missionState.textContent=done?'Сеть получила новый маршрут':'Соедини федеральную трассу с поселением';
}
function startRoad(event:PointerEvent){
  if(selectedTool!=='road'||event.button!==0)return;
  const raw=pointerToGrid(event);
  const p=snapRoadEndpoint(raw);
  if(!p){if(buildMessage)buildMessage.textContent='Начинай дорогу от существующей улицы, перекрёстка или въезда в объект.';return;}
  if(!isBuildingAccess(p)&&obstacles.some(o=>Math.hypot(p.x-o.x,p.y-o.y)<o.r+roadHalfWidth)){if(buildMessage)buildMessage.textContent='Точка подключения перекрыта препятствием. Выбери другой подъезд.';return;}
  drawing=true;pointerId=event.pointerId;draft=[p];canvas.setPointerCapture(event.pointerId);event.preventDefault();render();
}
function finishRoad(event:PointerEvent){
  if(!drawing||pointerId!==event.pointerId)return;
  drawing=false;pointerId=null;
  if(draft.length<2){draft=[];if(buildMessage)buildMessage.textContent='Наметь линию хотя бы на один участок.';render();return;}
  // Snap both ends BEFORE validation: the validator must inspect the exact geometry
  // that will be committed, not the unsnapped pointer approximation.
  const firstSnap=snapRoadEndpoint(draft[0]!);
  const lastIndex=draft.length-1,lastSnap=snapRoadEndpoint(draft[lastIndex]!);
  if(!firstSnap||!lastSnap){draft=[];if(buildMessage)buildMessage.textContent='Не получилось подключить оба конца. Заверши линию на дороге, перекрёстке или въезде в здание.';render();return;}
  draft[0]={...firstSnap};draft[lastIndex]={...lastSnap};
  const validation=validateRoadPath(draft);
  if(!validation.valid){draft=[];if(buildMessage)buildMessage.textContent='Проект отклонён: '+validation.reason;render();return;}
  const touchesHighway=draft.some(p=>Math.abs(p.y+13)<=1.65&&Math.abs(p.x)<=18);
  const touchesVillage=draft.some(p=>(Math.abs(p.x+1)<=1.65&&p.y>=-12&&p.y<=11)||(Math.abs(p.x)<=1.65&&p.y>=-12&&p.y<=-2)||(Math.abs(p.y-5)<=1.4&&p.x>=3&&p.x<=11)||(Math.abs(p.y-3)<=1.4&&p.x>=-11&&p.x<=-3));
  const direction=(document.querySelector<HTMLSelectElement>('#road-direction')?.value??'both') as 'both'|'forward';
   const road:Road={points:draft.map(p=>({...p})),progress:0,width:roadHalfWidth*2,connectsVillageToHighway:touchesHighway&&touchesVillage,direction};
  builtRoads.push(road);constructionJobs.push(road);rebuildRoadGraph();refreshVehicleRoutes();draft=[];updateMission();
  if(buildMessage)buildMessage.textContent='Проект принят. Дорога постепенно прокладывается по намеченной линии.';
  render();
}
canvas.addEventListener('pointerdown',event=>{
  const p=pointerPosition(event);activePointers.set(event.pointerId,p);
  if(activePointers.size===2){drawing=false;panning=false;const pts=[...activePointers.values()];pinchStart={distance:distance(pts[0]!,pts[1]!),zoom:camera.zoom,center:{x:(pts[0]!.x+pts[1]!.x)/2,y:(pts[0]!.y+pts[1]!.y)/2}};return;}
  if(selectedTool==='road'){startRoad(event);return;}
  panning=true;lastPointer=p;canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>{
  const p=pointerPosition(event);if(activePointers.has(event.pointerId))activePointers.set(event.pointerId,p);
  if(pinchStart&&activePointers.size>=2){const pts=[...activePointers.values()],d=distance(pts[0]!,pts[1]!);const anchor=screenToWorld(pinchStart.center);camera.zoom=clamp(pinchStart.zoom*d/Math.max(pinchStart.distance,1),Math.min(width,height)/42,Math.min(width,height)/10);const after=screenToWorld(pinchStart.center);camera.x+=anchor.x-after.x;camera.y+=anchor.y-after.y;render();return;}
  if(drawing){updateDraftPath(pointerToGrid(event));render();return;}
  if(panning&&lastPointer){camera.x-=(p.x-lastPointer.x)/camera.zoom;camera.y-=(p.y-lastPointer.y)/camera.zoom;lastPointer=p;render();}
});
function releasePointer(event:PointerEvent){
  if(drawing){finishRoad(event);}
  activePointers.delete(event.pointerId);if(activePointers.size<2)pinchStart=null;
  panning=false;lastPointer=null;
}
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);
canvas.addEventListener('wheel',event=>{event.preventDefault();const before=screenToWorld(pointerPosition(event));camera.zoom=clamp(camera.zoom*Math.exp(-event.deltaY*.001),Math.min(width,height)/42,Math.min(width,height)/10);const after=screenToWorld(pointerPosition(event));camera.x+=before.x-after.x;camera.y+=before.y-after.y;render();},{passive:false});

function setZoom(factor:number){const center={x:width/2,y:height/2},before=screenToWorld(center);camera.zoom=clamp(camera.zoom*factor,Math.min(width,height)/42,Math.min(width,height)/10);const after=screenToWorld(center);camera.x+=before.x-after.x;camera.y+=before.y-after.y;render();}
document.querySelector<HTMLButtonElement>('#reset-camera')?.addEventListener('click',()=>{camera={x:0,y:-1,zoom:getFitCameraZoom()};render();});
document.querySelector<HTMLButtonElement>('#zoom-in')?.addEventListener('click',()=>setZoom(1.18));
document.querySelector<HTMLButtonElement>('#zoom-out')?.addEventListener('click',()=>setZoom(.84));
const toolButtons=[...document.querySelectorAll<HTMLButtonElement>('.tool')];
toolButtons.forEach(button=>button.addEventListener('click',()=>{
  selectedTool=button.dataset.tool??'inspect';document.querySelector('.tool.active')?.classList.remove('active');button.classList.add('active');
  const hud=document.querySelector<HTMLElement>('#build-hud');if(hud)hud.hidden=selectedTool!=='road';
  if(buildMessage)buildMessage.textContent=selectedTool==='road'?'Соедини дорогу с перекрёстком, улицей или въездом в здание.':'Выбери инструмент «Дороги», чтобы начать строительство.';
  canvas.style.cursor=selectedTool==='road'?'crosshair':'grab';
}));
document.querySelector<HTMLButtonElement>('#cancel-road')?.addEventListener('click',()=>{clearDraft();if(buildMessage)buildMessage.textContent='Черновик дороги отменён.';});
document.querySelector<HTMLButtonElement>('#undo-road')?.addEventListener('click',()=>{
  const road=builtRoads.pop();if(!road)return;const index=constructionJobs.indexOf(road);if(index>=0)constructionJobs.splice(index,1);rebuildRoadGraph();refreshVehicleRoutes();updateMission();if(buildMessage)buildMessage.textContent='Последний построенный участок удалён.';render();
});
window.addEventListener('keydown',event=>{
  if(event.key==='+'||event.key==='=')setZoom(1.12);if(event.key==='-')setZoom(.89);
  if(event.key.toLowerCase()==='r'){camera={x:0,y:-1,zoom:Math.min(width/(WORLD.maxX-WORLD.minX),height/(WORLD.maxY-WORLD.minY))*.92};render();}
  if(event.key==='Escape'&&draft.length)clearDraft();
});
let previousTime=0;
function routeProjectionToPoint(path:Point[],point:Point){
  let walked=0,bestLateral=Infinity,bestDistance=0;
  for(let i=1;i<path.length;i++){
    const a=path[i-1]!,b=path[i]!,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<.001)continue;
    const t=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/(len*len),0,1);
    const projected={x:a.x+dx*t,y:a.y+dy*t},lateral=distance(point,projected);
    if(lateral<bestLateral){bestLateral=lateral;bestDistance=walked+len*t;}
    walked+=len;
  }
  return{lateral:bestLateral,distance:bestDistance};
}
function junctionYieldSpeeds(){
  const limits=vehicles.map(vehicle=>vehicle.cruiseSpeed);
  const junctions=collectRoadJunctions();
  for(const junction of junctions){
    const approaches=vehicles.map((vehicle,index)=>{
      const projection=routeProjectionToPoint(vehicle.path,junction.center);
      return{index,remaining:projection.distance-vehicle.distance,lateral:projection.lateral};
    }).filter(item=>item.lateral<2.65&&item.remaining>=-1.45&&item.remaining<=5.6);
    if(approaches.length<2)continue;
    const occupants=approaches.filter(item=>Math.abs(item.remaining)<=1.45);
    const winner=occupants.length
      ?occupants.sort((a,b)=>a.index-b.index)[0]!
      :approaches.filter(item=>item.remaining>0).sort((a,b)=>a.remaining-b.remaining||a.index-b.index)[0]!;
    for(const item of approaches){
      if(item.index!==winner.index&&item.remaining>-.9){
        limits[item.index]=0;
      }
    }
  }
  return limits;
}
function animate(time:number){
  const delta=Math.min((time-previousTime)/1000||0,.05);previousTime=time;ambientClock+=delta;
  let networkChanged=false;
  for(let i=constructionJobs.length-1;i>=0;i--){
    const job=constructionJobs[i]!;
    const before=job.progress;
    job.progress=clamp(job.progress+delta/Math.max(1.2,job.points.length*.32),0,1);
    if(before<1&&job.progress>=1){constructionJobs.splice(i,1);networkChanged=true;}
  }
  if(networkChanged){rebuildRoadGraph();refreshVehicleRoutes();}
  // Follow the vehicle directly ahead on the same lane. Braking is gradual,
  // and acceleration is slower than braking so gaps recover smoothly.
  const poses=vehicles.map(vehicle=>vehiclePose(vehicle));
  const junctionLimits=junctionYieldSpeeds();
  for(let i=0;i<vehicles.length;i++){
    const vehicle=vehicles[i]!,pose=poses[i]!;
    let desiredSpeed=vehicle.fuel>0?(junctionLimits[i]??vehicle.cruiseSpeed):0;
    for(let j=0;j<vehicles.length;j++){
      if(i===j)continue;
      const other=poses[j]!,dx=other.x-pose.x,dy=other.y-pose.y;
      const longitudinal=dx*pose.heading.x+dy*pose.heading.y;
      const lateral=Math.abs(dx*pose.heading.y-dy*pose.heading.x);
      if(longitudinal>0&&lateral<.38){
        const gap=longitudinal-1.28;
        desiredSpeed=Math.min(desiredSpeed,clamp((gap-1.1)*2.2,0,vehicle.cruiseSpeed));
      }
    }
    const rate=desiredSpeed<vehicle.speed?7.5:2.1;
    vehicle.speed+=clamp(desiredSpeed-vehicle.speed,-rate*delta,rate*delta);
    // Fuel is spent both on distance travelled and while a vehicle is held in a queue.
    vehicle.fuel=Math.max(0,vehicle.fuel-vehicle.speed*delta*.42-(vehicle.speed<.25?delta*.075:0));
    if(vehicle.fuel<=0)vehicle.stalled=true;
    vehicle.distance+=vehicle.speed*delta;
    const poseAfterMove=vehiclePose(vehicle);
    if(fuelStations.some(station=>distance(poseAfterMove,station.access)<1.05)){
      vehicle.fuel=Math.min(vehicle.fuelCapacity,vehicle.fuel+48*delta);
      if(vehicle.fuel>0)vehicle.stalled=false;
    }
  }
  for(let i=vehicles.length-1;i>=0;i--){
    if(vehicles[i]!.distance>=vehicles[i]!.routeLength){vehicles.splice(i,1);updateTrafficCounter();updateDestinationBoard();}
  }
  updateTrafficCounter();
  trafficSpawnTimer-=delta;
  if(trafficSpawnTimer<=0){spawnTrafficVehicle();trafficSpawnTimer=getTrafficSpawnInterval();}
  render();requestAnimationFrame(animate);
}
canvas.style.cursor='grab';
render();requestAnimationFrame(animate);
window.addEventListener('beforeunload',()=>observer.disconnect());
