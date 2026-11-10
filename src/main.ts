import './style.css';

type Point = { x: number; y: number };
type Road = { points: Point[]; progress: number; connectsVillageToHighway: boolean; width: number };
type RoadGraphNode = { id: number; x: number; y: number; edgeIds: string[] };
type RoadGraphEdge = { id: string; from: number; to: number; width: number; kind: 'highway' | 'local'; source: string };
type RoadGraph = { nodes: RoadGraphNode[]; edges: RoadGraphEdge[] };
type Vehicle = { path: Point[]; lengths: number[]; routeLength: number; distance: number; speed: number; direction: number; color: string; destinationId: string };

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
let selectedTool = 'inspect';
let drawing = false;
let panning = false;
let lastPointer: Point | null = null;
let draft: Point[] = [];
let pointerId: number | null = null;
const activePointers = new Map<number, Point>();
let pinchStart: { distance: number; zoom: number; center: Point } | null = null;

const staticRoads: { a: Point; b: Point; width: number }[] = [
  { a: {x:-18,y:-13}, b:{x:18,y:-13}, width:1.55 },
  { a: {x:-1,y:-13}, b:{x:-1,y:11}, width:1.5 },
  { a: {x:-1,y:5}, b:{x:11,y:5}, width:1.3 },
  { a: {x:-12,y:3}, b:{x:-1,y:3}, width:1.3 },
  { a: {x:10,y:-15.6}, b:{x:10,y:-10.4}, width:1.5 }
];
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


function distance(a: Point,b: Point) { return Math.hypot(a.x-b.x,a.y-b.y); }
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}
function lerp(a:number,b:number,t:number){return a+(b-a)*t;}
function worldToScreen(p:Point):Point{return{x:width/2+(p.x-camera.x)*camera.zoom,y:height/2+(p.y-camera.y)*camera.zoom};}
function screenToWorld(p:Point):Point{return{x:(p.x-width/2)/camera.zoom+camera.x,y:(p.y-height/2)/camera.zoom+camera.y};}
function resize(){
  const rect=mount!.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  width=rect.width;height=rect.height;dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  canvas.style.width=width+'px';canvas.style.height=height+'px';
  ctx!.setTransform(dpr,0,0,dpr,0,0);
  camera.zoom=clamp(camera.zoom,Math.min(width,height)/42,Math.min(width,height)/15);
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
    if(ab<.001||bc<.001){out.push(b);continue;}
    const radius=Math.min(.68,ab*.32,bc*.32);
    const from={x:b.x+(a.x-b.x)/ab*radius,y:b.y+(a.y-b.y)/ab*radius};
    const to={x:b.x+(c.x-b.x)/bc*radius,y:b.y+(c.y-b.y)/bc*radius};
    out.push(from);
    for(let sample=1;sample<=8;sample++){
      const t=sample/8,u=1-t;
      out.push({x:u*u*from.x+2*u*t*b.x+t*t*to.x,y:u*u*from.y+2*u*t*b.y+t*t*to.y});
    }
  }
  out.push(points[points.length-1]!);return out;
}
function strokeRoad(points:Point[],progress=1,color='#59666a',alpha=1,roadWidth=1.9){
  if(points.length<2||progress<=0)return;
  pathOnCanvas(points,progress);
  ctx!.save();ctx!.globalAlpha=alpha;ctx!.lineCap='round';ctx!.lineJoin='round';
  ctx!.strokeStyle='#d9d2b9';ctx!.lineWidth=(roadWidth+.34)*camera.zoom;ctx!.stroke();
  pathOnCanvas(points,progress);
  ctx!.strokeStyle=color;ctx!.lineWidth=roadWidth*camera.zoom;ctx!.stroke();
  ctx!.restore();
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
function convexHull(points:Point[]):Point[]{
  const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
  if(sorted.length<=2)return sorted;
  const cross=(o:Point,a:Point,b:Point)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower:Point[]=[];
  for(const p of sorted){while(lower.length>=2&&cross(lower[lower.length-2]!,lower[lower.length-1]!,p)<=0)lower.pop();lower.push(p);}
  const upper:Point[]=[];
  for(let i=sorted.length-1;i>=0;i--){const p=sorted[i]!;while(upper.length>=2&&cross(upper[upper.length-2]!,upper[upper.length-1]!,p)<=0)upper.pop();upper.push(p);}
  lower.pop();upper.pop();return lower.concat(upper);
}
function drawJunctionPatch(center:Point,arms:JunctionArm[]){
  if(arms.length<3)return;
  const drawLayer=(extra:number,color:string)=>{
    const candidates:Point[]=[];
    for(const arm of arms){
      const half=arm.width/2+extra,reach=half+.1;
      const normal={x:-arm.direction.y,y:arm.direction.x};
      candidates.push(
        {x:center.x+arm.direction.x*reach+normal.x*half,y:center.y+arm.direction.y*reach+normal.y*half},
        {x:center.x+arm.direction.x*reach-normal.x*half,y:center.y+arm.direction.y*reach-normal.y*half}
      );
    }
    const hull=convexHull(candidates);if(hull.length<3)return;
    const rounded=hull.map((point,index)=>{
      const previous=hull[(index-1+hull.length)%hull.length]!,next=hull[(index+1)%hull.length]!;
      const beforeLength=distance(point,previous),afterLength=distance(point,next);
      const radius=Math.min(extra > 0 ? .48 : .38,beforeLength*.4,afterLength*.4);
      return{
        before:{x:point.x+(previous.x-point.x)*radius/Math.max(beforeLength,.001),y:point.y+(previous.y-point.y)*radius/Math.max(beforeLength,.001)},
        corner:point,
        after:{x:point.x+(next.x-point.x)*radius/Math.max(afterLength,.001),y:point.y+(next.y-point.y)*radius/Math.max(afterLength,.001)}
      };
    });
    ctx!.beginPath();const first=worldToScreen(rounded[0]!.before);ctx!.moveTo(first.x,first.y);
    for(const item of rounded){const before=worldToScreen(item.before),corner=worldToScreen(item.corner),after=worldToScreen(item.after);ctx!.lineTo(before.x,before.y);ctx!.quadraticCurveTo(corner.x,corner.y,after.x,after.y);}
    ctx!.closePath();ctx!.fillStyle=color;ctx!.fill();
  };
  drawLayer(.17,'#d9d2b9');drawLayer(0,'#59666a');
}
function collectRoadJunctions():{center:Point;arms:JunctionArm[]}[]{
  // Keep each road as a separate source: neighbouring samples of one curved
  // road must never be interpreted as a junction with itself.
  const sources:{id:string;points:Point[];width:number}[]=[
    ...staticRoads.map((road,index)=>({id:'static-'+index,points:[road.a,road.b],width:road.width})),
    ...builtRoads.filter(road=>road.progress>=.999).map((road,index)=>({id:'built-'+index,points:road.points,width:road.width}))
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
  // Road surfaces first, then clipped markings, then the junction asphalt cap.
  for(const road of staticRoads)strokeRoad([road.a,road.b],1,'#59666a',1,road.width);
  for(const road of builtRoads)strokeRoad(road.points,road.progress,'#59666a',1,road.width);
  for(let i=0;i<staticRoads.length;i++){
    const road=staticRoads[i]!;
    drawRoadCentreLinePath([road.a,road.b],i!==0,junctions);
  }
  for(const road of builtRoads)drawRoadCentreLinePath(road.points,false,junctions,road.progress);
  for(const junction of junctions)drawJunctionPatch(junction.center,junction.arms);
  // Highway merge marker stays outside the intersection surface.
  const merge=worldToScreen({x:10,y:-14.05});
  ctx!.save();ctx!.strokeStyle='#f1e6c8';ctx!.globalAlpha=.75;ctx!.lineWidth=.055*camera.zoom;
  ctx!.beginPath();ctx!.moveTo(merge.x-.48*camera.zoom,merge.y);ctx!.lineTo(merge.x+.48*camera.zoom,merge.y);ctx!.stroke();ctx!.restore();
}
function drawTerrain(){
  ctx!.fillStyle='#a7c98f';ctx!.fillRect(0,0,width,height);
  // Soft meadow patches, clipped to the visible map.
  for(let i=0;i<34;i++){
    const x=((i*97)%47)-23,y=((i*53)%37)-18,p=worldToScreen({x,y});
    ctx!.fillStyle=i%3===0?'#9bc487':'#afd096';ctx!.globalAlpha=0.25;
    ctx!.beginPath();ctx!.ellipse(p.x,p.y,(2.2+(i%4)*0.5)*camera.zoom,(1.4+(i%3)*0.35)*camera.zoom,((i%5)-2)*0.12,0,Math.PI*2);ctx!.fill();
  }
  ctx!.globalAlpha=1;
  // Water and shoreline.
  const pond=worldToScreen({x:16,y:7});
  ctx!.fillStyle='#d6d2ad';ctx!.beginPath();ctx!.ellipse(pond.x,pond.y,4.35*camera.zoom,3.15*camera.zoom,-0.18,0,Math.PI*2);ctx!.fill();
  ctx!.fillStyle='#79b9c0';ctx!.beginPath();ctx!.ellipse(pond.x,pond.y,3.95*camera.zoom,2.82*camera.zoom,-0.18,0,Math.PI*2);ctx!.fill();
  ctx!.strokeStyle='#a8d8d4';ctx!.lineWidth=0.1*camera.zoom;ctx!.beginPath();ctx!.ellipse(pond.x-0.35*camera.zoom,pond.y-0.35*camera.zoom,1.5*camera.zoom,0.45*camera.zoom,-0.2,0,Math.PI*2);ctx!.stroke();
  // Farmland rows.
  const field=worldToScreen({x:-15,y:6.1});ctx!.fillStyle='#b9c77e';roundedRect(ctx!,field.x-1.9*camera.zoom,field.y-1.7*camera.zoom,4.3*camera.zoom,3.2*camera.zoom,0.25*camera.zoom);ctx!.fill();
  ctx!.strokeStyle='#8ba96c';ctx!.lineWidth=0.1*camera.zoom;
  for(let i=0;i<5;i++){ctx!.beginPath();ctx!.moveTo(field.x+(-1.45+i*.65)*camera.zoom,field.y-1.45*camera.zoom);ctx!.lineTo(field.x+(-1.45+i*.65)*camera.zoom,field.y+1.35*camera.zoom);ctx!.stroke();}
  // Small flower clusters.
  for(let i=0;i<42;i++){const a=i*2.399,r=5+(i%4)*.65,p=worldToScreen({x:Math.cos(a)*r,y:Math.sin(a)*r});ctx!.fillStyle=i%2?'#f4d47c':'#f5ead1';ctx!.beginPath();ctx!.arc(p.x,p.y,Math.max(1,0.09*camera.zoom),0,Math.PI*2);ctx!.fill();}
}
function drawTree(x:number,y:number,size=1){
  const p=worldToScreen({x,y}),r=size*0.88*camera.zoom;
  ctx!.fillStyle='#527e54';ctx!.beginPath();ctx!.ellipse(p.x+0.12*camera.zoom,p.y+0.2*camera.zoom,r*1.12,r*.9,0,0,Math.PI*2);ctx!.fill();
  ctx!.fillStyle=['#5d9c68','#70a96d','#82b779'][Math.abs(Math.floor(x*x+y*y))%3]!;
  ctx!.beginPath();ctx!.arc(p.x,p.y,r,0,Math.PI*2);ctx!.fill();
  ctx!.fillStyle='#9bc985';ctx!.beginPath();ctx!.arc(p.x-r*.28,p.y-r*.3,r*.32,0,Math.PI*2);ctx!.fill();
}
function drawHouse(x:number,y:number,scale=1,wall='#f0e3c2',roof='#d87966'){
  const p=worldToScreen({x,y}),s=camera.zoom*scale;
  ctx!.fillStyle='#71916a';ctx!.globalAlpha=.22;roundedRect(ctx!,p.x-1.55*s,p.y-1.2*s,3.1*s,2.7*s,.35*s);ctx!.fill();ctx!.globalAlpha=1;
  ctx!.fillStyle=roof;ctx!.beginPath();ctx!.moveTo(p.x-1.55*s,p.y-.25*s);ctx!.lineTo(p.x,p.y-1.55*s);ctx!.lineTo(p.x+1.55*s,p.y-.25*s);ctx!.closePath();ctx!.fill();
  ctx!.fillStyle=wall;roundedRect(ctx!,p.x-1.28*s,p.y-.35*s,2.56*s,1.65*s,.12*s);ctx!.fill();
  ctx!.fillStyle='#a9d6db';ctx!.fillRect(p.x-.86*s,p.y-.12*s,.48*s,.48*s);ctx!.fillRect(p.x+.38*s,p.y-.12*s,.48*s,.48*s);
  ctx!.fillStyle='#916c52';ctx!.fillRect(p.x-.22*s,p.y+.52*s,.44*s,.78*s);
  ctx!.strokeStyle='#fff0d5';ctx!.lineWidth=Math.max(1,.06*s);ctx!.strokeRect(p.x-1.28*s,p.y-.35*s,2.56*s,1.65*s);
}
function drawShop(x:number,y:number){
  const p=worldToScreen({x,y}),s=camera.zoom;
  ctx!.fillStyle='#7d9d72';ctx!.fillRect(p.x-1.8*s,p.y-1.2*s,3.6*s,2.6*s);
  ctx!.fillStyle='#6d9b78';ctx!.beginPath();ctx!.moveTo(p.x-1.95*s,p.y-.9*s);ctx!.lineTo(p.x,p.y-2*s);ctx!.lineTo(p.x+1.95*s,p.y-.9*s);ctx!.closePath();ctx!.fill();
  ctx!.fillStyle='#e9d8ae';ctx!.fillRect(p.x-1.5*s,p.y-.85*s,3*s,2*s);
  ctx!.fillStyle='#b7d9d2';ctx!.fillRect(p.x-.58*s,p.y-.62*s,1.16*s,.72*s);
  ctx!.fillStyle='#d98b69';ctx!.fillRect(p.x-.45*s,p.y+.3*s,.9*s,.85*s);
}
function drawBarn(x:number,y:number){
  const p=worldToScreen({x,y}),s=camera.zoom;
  ctx!.fillStyle='#765e52';ctx!.beginPath();ctx!.moveTo(p.x-2*s,p.y-.8*s);ctx!.lineTo(p.x,p.y-1.9*s);ctx!.lineTo(p.x+2*s,p.y-.8*s);ctx!.closePath();ctx!.fill();
  ctx!.fillStyle='#c96f5d';ctx!.fillRect(p.x-1.7*s,p.y-.8*s,3.4*s,2*s);
  ctx!.fillStyle='#704f45';ctx!.fillRect(p.x-.6*s,p.y+.05*s,1.2*s,1.15*s);
  ctx!.strokeStyle='#e9b29a';ctx!.lineWidth=.09*s;ctx!.strokeRect(p.x-1.7*s,p.y-.8*s,3.4*s,2*s);
}
function drawDecor(){
  // Fences, garden paths and roadside lamps.
  const fences=[[-8.9,-5.4,4.2,0],[-11.2,7.5,4.4,Math.PI/2],[5.8,3.5,3.5,0],[4.2,9.7,5,0]] as const;
  for(const [x,y,len,angle] of fences){const p=worldToScreen({x,y});ctx!.save();ctx!.translate(p.x,p.y);ctx!.rotate(angle);ctx!.strokeStyle='#ead9b8';ctx!.lineWidth=Math.max(1,.13*camera.zoom);ctx!.beginPath();ctx!.moveTo(-len*camera.zoom/2,-.22*camera.zoom);ctx!.lineTo(len*camera.zoom/2,-.22*camera.zoom);ctx!.moveTo(-len*camera.zoom/2,.22*camera.zoom);ctx!.lineTo(len*camera.zoom/2,.22*camera.zoom);ctx!.stroke();for(let i=0;i<=Math.floor(len/.8);i++){const xx=-len*camera.zoom/2+i*len*camera.zoom/Math.floor(len/.8);ctx!.fillStyle='#a47b55';ctx!.fillRect(xx-.06*camera.zoom,-.38*camera.zoom,.12*camera.zoom,.76*camera.zoom);}ctx!.restore();}
  const paths=[[-6.5,-5.1,1.15,2.7],[7.7,3.9,1,2.5],[11,-2.9,1.2,2.4]] as const;
  ctx!.fillStyle='#d5c59b';for(const [x,y,w,h] of paths){const p=worldToScreen({x,y});ctx!.save();ctx!.translate(p.x,p.y);ctx!.rotate(-.12);ctx!.fillRect(-w*camera.zoom/2,-h*camera.zoom/2,w*camera.zoom,h*camera.zoom);ctx!.restore();}
  for(const [x,y] of [[-3,-9.8],[7,-1.4],[9,5.8],[-7,1.5],[-3,-15],[8,-15]] as const){const p=worldToScreen({x,y});ctx!.strokeStyle='#65756a';ctx!.lineWidth=.09*camera.zoom;ctx!.beginPath();ctx!.moveTo(p.x,p.y);ctx!.lineTo(p.x,p.y-.85*camera.zoom);ctx!.stroke();ctx!.fillStyle='#ffe6a1';ctx!.beginPath();ctx!.arc(p.x,p.y-.88*camera.zoom,.16*camera.zoom,0,Math.PI*2);ctx!.fill();}
  // Highway direction sign.
  const sign=worldToScreen({x:-13,y:-15.1});ctx!.fillStyle='#786d57';ctx!.fillRect(sign.x-.07*camera.zoom,sign.y,.14*camera.zoom,1.2*camera.zoom);ctx!.fillStyle='#568b70';roundedRect(ctx!,sign.x-1.2*camera.zoom,sign.y-.65*camera.zoom,2.4*camera.zoom,1.05*camera.zoom,.12*camera.zoom);ctx!.fill();
  ctx!.strokeStyle='#f4e7c5';ctx!.lineWidth=.08*camera.zoom;ctx!.strokeRect(sign.x-.95*camera.zoom,sign.y-.43*camera.zoom,1.9*camera.zoom,.08*camera.zoom);
}
function drawCar(vehicle:Vehicle){
  let remaining=vehicle.distance,segment=0;
  while(segment<vehicle.lengths.length-1&&remaining>vehicle.lengths[segment]!){remaining-=vehicle.lengths[segment]!;segment++;}
  const a=vehicle.path[segment]!,b=vehicle.path[segment+1]!,t=clamp(remaining/(vehicle.lengths[segment]||1),0,1);
  const x=lerp(a.x,b.x,t),y=lerp(a.y,b.y,t),angle=Math.atan2(b.y-a.y,b.x-a.x)+(vehicle.direction<0?Math.PI:0),p=worldToScreen({x,y}),s=camera.zoom;
  ctx!.save();ctx!.translate(p.x,p.y);ctx!.rotate(angle);
  ctx!.fillStyle='#344b45';roundedRect(ctx!,-.82*s,-.48*s,1.64*s,.96*s,.24*s);ctx!.fill();
  ctx!.fillStyle=vehicle.color;roundedRect(ctx!,-.72*s,-.42*s,1.44*s,.84*s,.22*s);ctx!.fill();
  ctx!.fillStyle='#c9e1df';roundedRect(ctx!,-.2*s,-.34*s,.65*s,.68*s,.13*s);ctx!.fill();
  ctx!.fillStyle='#f8e7ad';ctx!.fillRect(.56*s,-.29*s,.12*s,.18*s);ctx!.fillRect(.56*s,.11*s,.12*s,.18*s);
  ctx!.fillStyle='#e9d4c2';ctx!.fillRect(-.68*s,-.3*s,.09*s,.16*s);ctx!.fillRect(-.68*s,.14*s,.09*s,.16*s);
  ctx!.restore();
}
function render(){
  ctx!.clearRect(0,0,width,height);drawTerrain();drawRoadNetwork();drawDecor();
  drawHouse(-6.5,-3.2,1.05);drawHouse(7.7,1.7,.92,'#e8d9ad','#78a9b6');drawHouse(-10.4,5.8,.88,'#e8d4b5','#e9c46a');drawHouse(2.8,8.3,.8,'#e8e0c8','#dc8068');drawHouse(-5,-9,.72,'#e7d9b7','#78a9b6');
  drawShop(11,-5);drawBarn(-13,-4);
  const trees=[[-14,-10,1.2],[-17,-4,.9],[-16,1,.9],[-12,10,1.2],[-4,12,.9],[4,12,.9],[12,9,.9],[15,4,1.2],[14,-9,.9],[6,-5,.9],[-9,-1,.9],[17,0,1.2]] as const;
  for(const [x,y,s] of trees)drawTree(x,y,s);
  for(const vehicle of vehicles)drawCar(vehicle);
  if(draft.length>1){const validation=validateRoadPath(draft);const valid=validation.valid;strokeRoad(draft,1,valid?'#e9c46a':'#d96c62',.88);const first=worldToScreen(draft[0]!);ctx!.fillStyle=valid?'#fff1bd':'#f4b5ad';ctx!.beginPath();ctx!.arc(first.x,first.y,.22*camera.zoom,0,Math.PI*2);ctx!.fill();}
}
function segmentIntersection(a:Point,b:Point,c:Point,d:Point):Point|null{
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
  const sources:{id:string;points:Point[];width:number;kind:'highway'|'local'}[]=[
    ...staticRoads.map((r,i)=>({id:'base-'+i,points:[r.a,r.b],width:r.width,kind:r.width>1.45?'highway' as const:'local' as const})),
    ...builtRoads.filter(r=>r.progress>=.999).map((r,i)=>({id:'built-'+i,points:r.points,width:r.width,kind:r.width>1.45?'highway' as const:'local' as const}))
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
        const edge:RoadGraphEdge={id,from:from.id,to:to.id,width:source.width,kind:source.kind,source:source.id};
        roadGraph.edges.push(edge);from.edgeIds.push(id);to.edgeIds.push(id);
      }
    }
  }
  if(networkStatus)networkStatus.textContent='Сеть: '+roadGraph.nodes.length+' узлов · '+roadGraph.edges.length+' участков';
}
// KT-011: graph-based shortest path for all demonstration vehicles.
function nearestGraphNode(point:Point):RoadGraphNode|null{
  let best:RoadGraphNode|null=null,bestDistance=Infinity;
  for(const node of roadGraph.nodes){const d=distance(point,node);if(d<bestDistance){bestDistance=d;best=node;}}
  return best;
}
function findRoadPath(start:Point,end:Point):Point[]|null{
  const source=nearestGraphNode(start),target=nearestGraphNode(end);
  if(!source||!target)return null;
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
      const edge=roadGraph.edges.find(item=>item.id===edgeId);if(!edge)continue;
      const next=edge.from===current?edge.to:edge.from;
      if(!remaining.has(next))continue;
      const nextNode=roadGraph.nodes[next]!;
      const candidate=best+distance(node,nextNode);
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
const trafficDestinations:TrafficDestination[]=[
  {id:'west',name:'Западный квартал',access:{x:-12,y:3},color:'#e9c46a',weight:2},
  {id:'north',name:'Северный квартал',access:{x:-1,y:11},color:'#78a9b6',weight:1},
  {id:'centre',name:'Центральный квартал',access:{x:11,y:5},color:'#d98c78',weight:3},
  {id:'market',name:'Магазин у трассы',access:{x:10,y:-10.4},color:'#9aa9d0',weight:2}
];
function findRoadPath(start:Point,end:Point):Point[]|null{
  const source=nearestGraphNode(start),target=nearestGraphNode(end);
  if(!source||!target)return null;
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
      const edge=roadGraph.edges.find(item=>item.id===edgeId);if(!edge)continue;
      const next=edge.from===current?edge.to:edge.from;
      if(!remaining.has(next))continue;
      const nextNode=roadGraph.nodes[next]!;
      const candidate=best+distance(node,nextNode);
      if(candidate<(costs.get(next)??Infinity)){costs.set(next,candidate);previous.set(next,current);}
    }
  }
  if(!previous.has(target.id))return null;
  const ids:number[]=[];let cursor:number|null=target.id;
  while(cursor!==null){ids.push(cursor);cursor=previous.get(cursor)??null;}
  ids.reverse();
  return ids.map(id=>({x:roadGraph.nodes[id]!.x,y:roadGraph.nodes[id]!.y}));
}
function buildTrafficRoute(destinationId:string):Point[]|null{
  const destination=trafficDestinations.find(item=>item.id===destinationId);
  if(!destination)return null;
  const inbound=findRoadPath(demoStart,destination.access);
  const outbound=findRoadPath(destination.access,demoExit);
  if(!inbound||!outbound)return null;
  return inbound.concat(outbound.slice(1));
}
function createVehicle(path:Point[],speed:number,destination:TrafficDestination,offset:number):Vehicle{
  const lengths=path.slice(1).map((point,index)=>distance(path[index]!,point));
  const routeLength=lengths.reduce((sum,value)=>sum+value,0);
  return{path,lengths,routeLength,distance:Math.min(offset,routeLength),speed,direction:1,color:destination.color,destinationId:destination.id};
}
let reachableDestinations:TrafficDestination[]=[];
function refreshVehicleRoutes(){
  reachableDestinations=trafficDestinations.filter(destination=>buildTrafficRoute(destination.id)!==null);
  for(let i=vehicles.length-1;i>=0;i--){
    const vehicle=vehicles[i]!;
    const nextPath=buildTrafficRoute(vehicle.destinationId);
    if(!nextPath){vehicles.splice(i,1);continue;}
    const progress=vehicle.routeLength>0?vehicle.distance/vehicle.routeLength:0;
    vehicle.path=nextPath.map(point=>({...point}));
    vehicle.lengths=nextPath.slice(1).map((point,index)=>distance(nextPath[index]!,point));
    vehicle.routeLength=vehicle.lengths.reduce((sum,value)=>sum+value,0);
    vehicle.distance=clamp(progress*vehicle.routeLength,0,vehicle.routeLength);
    vehicle.direction=1;
  }
  updateTrafficCounter();
}
// Only completed roads participate in traffic routing.
rebuildRoadGraph();
reachableDestinations=trafficDestinations.filter(destination=>buildTrafficRoute(destination.id)!==null);
let trafficSpawnTimer=5.5,trafficSpawnIndex=0;
function updateTrafficCounter(){if(trafficCount)trafficCount.textContent=String(vehicles.length);}
function spawnTrafficVehicle(){
  if(!reachableDestinations.length)return false;
  // All routes share the same highway entry: keep a safe gap there.
  if(vehicles.some(vehicle=>vehicle.distance<9))return false;
  const demandQueue=reachableDestinations.flatMap(item=>Array.from({length:item.weight},()=>item));
  const destination=demandQueue[trafficSpawnIndex%demandQueue.length]!;
  trafficSpawnIndex++;
  const path=buildTrafficRoute(destination.id);if(!path)return false;
  vehicles.push(createVehicle(path,2.05+Math.random()*.35,destination,0));
  updateTrafficCounter();return true;
}
for(let i=0;i<Math.min(2,reachableDestinations.length);i++){
  const destination=reachableDestinations[i]!;
  const path=buildTrafficRoute(destination.id);
  if(path)vehicles.push(createVehicle(path,i===0?2.25:1.85,destination,i===0?2:8.5));
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
type RoadValidation = { valid:boolean; reason:string };
function validateRoadPath(points:Point[]):RoadValidation{
  if(points.length<2)return{valid:false,reason:'Нужно провести линию хотя бы на один участок.'};
  if(!touchesRoadNetwork(points[0]!)&&!touchesRoadNetwork(points[points.length-1]!))return{valid:false,reason:'Начни или закончи проект на существующей дороге.'};

  // A deliberate crossing of a road is a valid junction, not an illegal overlap.
  // Keep a small junction clearance around each true centreline intersection;
  // parallel travel along an existing road remains forbidden.
  const junctionContacts:{point:Point;radius:number}[]=[];
  const existingSegments:{a:Point;b:Point;width:number}[]=[
    ...staticRoads.map(road=>({a:road.a,b:road.b,width:road.width})),
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
      if(obstacles.some(o=>Math.hypot(p.x-o.x,p.y-o.y)<o.r+roadHalfWidth))return{valid:false,reason:'На пути препятствие: здание, дерево или водоём. Обойди его.'};
      const along=travelled+len*t;
      const atStart=along<endpointOverlapAllowance,atEnd=total-along<endpointOverlapAllowance;
      const overlapStatic=staticRoads.some(road=>distanceToSegment(p,road.a,road.b)<roadOverlapDistance);
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
  if(missionCount)missionCount.textContent=done?'1 / 1':'0 / 1';
  if(missionProgress)missionProgress.style.width=done?'100%':'8%';
}
function startRoad(event:PointerEvent){
  if(selectedTool!=='road'||event.button!==0)return;
  let p=pointerToGrid(event);
  const nearbyNetworkPoint=nearestNetworkPoint(p);
  if(nearbyNetworkPoint&&distance(p,nearbyNetworkPoint)<=roadConnectionTolerance)p=nearbyNetworkPoint;
  if(obstacles.some(o=>Math.hypot(p.x-o.x,p.y-o.y)<o.r+roadHalfWidth)){if(buildMessage)buildMessage.textContent='Нельзя начинать проект внутри здания, дерева или водоёма.';return;}
  drawing=true;pointerId=event.pointerId;draft=[p];canvas.setPointerCapture(event.pointerId);event.preventDefault();render();
}
function finishRoad(event:PointerEvent){
  if(!drawing||pointerId!==event.pointerId)return;
  drawing=false;pointerId=null;
  if(draft.length<2){draft=[];if(buildMessage)buildMessage.textContent='Наметь линию хотя бы на один участок.';render();return;}
  // Snap both ends BEFORE validation: the validator must inspect the exact geometry
  // that will be committed, not the unsnapped pointer approximation.
  const firstSnap=nearestNetworkPoint(draft[0]!);
  if(firstSnap&&distance(draft[0]!,firstSnap)<=roadConnectionTolerance)draft[0]={...firstSnap};
  const lastIndex=draft.length-1,lastSnap=nearestNetworkPoint(draft[lastIndex]!);
  if(lastSnap&&distance(draft[lastIndex]!,lastSnap)<=roadConnectionTolerance)draft[lastIndex]={...lastSnap};
  const validation=validateRoadPath(draft);
  if(!validation.valid){draft=[];if(buildMessage)buildMessage.textContent='Проект отклонён: '+validation.reason;render();return;}
  const touchesHighway=draft.some(p=>Math.abs(p.y+13)<=1.65&&Math.abs(p.x)<=18);
  const touchesVillage=draft.some(p=>(Math.abs(p.x+1)<=1.65&&p.y>=-12&&p.y<=11)||(Math.abs(p.x)<=1.65&&p.y>=-12&&p.y<=-2)||(Math.abs(p.y-5)<=1.4&&p.x>=3&&p.x<=11)||(Math.abs(p.y-3)<=1.4&&p.x>=-11&&p.x<=-3));
  const road:Road={points:draft.map(p=>({...p})),progress:0,width:roadHalfWidth*2,connectsVillageToHighway:touchesHighway&&touchesVillage};
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
document.querySelector<HTMLButtonElement>('#reset-camera')?.addEventListener('click',()=>{camera={x:0,y:-1,zoom:Math.min(width,height)/22};render();});
document.querySelector<HTMLButtonElement>('#zoom-in')?.addEventListener('click',()=>setZoom(1.18));
document.querySelector<HTMLButtonElement>('#zoom-out')?.addEventListener('click',()=>setZoom(.84));
const toolButtons=[...document.querySelectorAll<HTMLButtonElement>('.tool')];
toolButtons.forEach(button=>button.addEventListener('click',()=>{
  selectedTool=button.dataset.tool??'inspect';document.querySelector('.tool.active')?.classList.remove('active');button.classList.add('active');
  const hud=document.querySelector<HTMLElement>('#build-hud');if(hud)hud.hidden=selectedTool!=='road';
  if(buildMessage)buildMessage.textContent=selectedTool==='road'?'Наметь линию будущей дороги. После проверки проект начнёт строиться.':'Выбери инструмент «Дороги», чтобы начать строительство.';
  canvas.style.cursor=selectedTool==='road'?'crosshair':'grab';
}));
document.querySelector<HTMLButtonElement>('#cancel-road')?.addEventListener('click',()=>{clearDraft();if(buildMessage)buildMessage.textContent='Черновик дороги отменён.';});
document.querySelector<HTMLButtonElement>('#undo-road')?.addEventListener('click',()=>{
  const road=builtRoads.pop();if(!road)return;const index=constructionJobs.indexOf(road);if(index>=0)constructionJobs.splice(index,1);rebuildRoadGraph();refreshVehicleRoutes();updateMission();if(buildMessage)buildMessage.textContent='Последний построенный участок удалён.';render();
});
window.addEventListener('keydown',event=>{
  if(event.key==='+'||event.key==='=')setZoom(1.12);if(event.key==='-')setZoom(.89);
  if(event.key.toLowerCase()==='r'){camera={x:0,y:-1,zoom:Math.min(width,height)/22};render();}
  if(event.key==='Escape'&&draft.length)clearDraft();
});
let previousTime=0;
function animate(time:number){
  const delta=Math.min((time-previousTime)/1000||0,.05);previousTime=time;
  let networkChanged=false;
  for(let i=constructionJobs.length-1;i>=0;i--){
    const job=constructionJobs[i]!;
    const before=job.progress;
    job.progress=clamp(job.progress+delta/Math.max(1.2,job.points.length*.32),0,1);
    if(before<1&&job.progress>=1){constructionJobs.splice(i,1);networkChanged=true;}
  }
  if(networkChanged){rebuildRoadGraph();refreshVehicleRoutes();}
  for(let i=vehicles.length-1;i>=0;i--){
    const vehicle=vehicles[i]!;
    vehicle.distance+=vehicle.speed*delta;
    if(vehicle.distance>=vehicle.routeLength){vehicles.splice(i,1);updateTrafficCounter();}
  }
  trafficSpawnTimer-=delta;
  if(trafficSpawnTimer<=0){spawnTrafficVehicle();trafficSpawnTimer=7.5;}
  render();requestAnimationFrame(animate);
}
canvas.style.cursor='grab';
render();requestAnimationFrame(animate);
window.addEventListener('beforeunload',()=>observer.disconnect());
