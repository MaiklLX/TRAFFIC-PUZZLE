import './style.css';

type Point = { x: number; y: number };
type Road = { points: Point[]; progress: number; connectsVillageToHighway: boolean; width: number };
type RoadGraphNode = { id: number; x: number; y: number; edgeIds: string[] };
type RoadGraphEdge = { id: string; from: number; to: number; width: number; kind: 'highway' | 'local'; source: string };
type RoadGraph = { nodes: RoadGraphNode[]; edges: RoadGraphEdge[] };
type Vehicle = { distance: number; speed: number; direction: number; color: string };

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
const route = [{x:-18,y:-13},{x:-1,y:-13},{x:-1,y:5},{x:9,y:5}];
const routeLengths = route.slice(1).map((p,i)=>distance(p,route[i]!));
const routeLength = routeLengths.reduce((a,b)=>a+b,0);
const vehicles: Vehicle[] = [
  {distance:2,speed:2.25,direction:1,color:'#e9c46a'},
  {distance:8.5,speed:1.85,direction:1,color:'#78a9b6'}
];
const missionCount = document.querySelector<HTMLElement>('.mission-count');
const missionProgress = document.querySelector<HTMLElement>('.progress span');
const buildMessage = document.querySelector<HTMLElement>('#build-message');
const trafficCount = document.querySelector<HTMLElement>('#traffic-count');
if (trafficCount) trafficCount.textContent = String(vehicles.length);

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
    const len=Math.min(0.52,distance(a,b)*0.28,distance(b,c)*0.28);
    const from={x:b.x+(a.x-b.x)/distance(a,b)*len,y:b.y+(a.y-b.y)/distance(a,b)*len};
    const to={x:b.x+(c.x-b.x)/distance(b,c)*len,y:b.y+(c.y-b.y)/distance(b,c)*len};
    out.push(from);
    for(let s=1;s<=6;s++){const t=s/6,u=1-t;out.push({x:u*u*from.x+2*u*t*b.x+t*t*to.x,y:u*u*from.y+2*u*t*b.y+t*t*to.y});}
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
function drawRoadCentreLine(a:Point,b:Point,subtle=false){
  const p=worldToScreen(a),q=worldToScreen(b);
  ctx!.save();ctx!.setLineDash(subtle?[.42*camera.zoom,.56*camera.zoom]:[1.2*camera.zoom,1.45*camera.zoom]);
  ctx!.lineCap='butt';ctx!.strokeStyle=subtle?'#d9d3b5':'#f4e8bd';
  ctx!.globalAlpha=subtle?.68:.95;ctx!.lineWidth=(subtle?.035:.075)*camera.zoom;
  ctx!.beginPath();ctx!.moveTo(p.x,p.y);ctx!.lineTo(q.x,q.y);ctx!.stroke();ctx!.restore();
}
function drawJunction(point:Point,connectedWidths:number[]){
  if(connectedWidths.length<2)return;
  const p=worldToScreen(point);
  const radius=Math.max(...connectedWidths)/2;
  ctx!.save();
  // The pale shoulder joins all incoming road edges into one clean junction.
  ctx!.fillStyle='#d9d2b9';ctx!.beginPath();ctx!.arc(p.x,p.y,(radius+.17)*camera.zoom,0,Math.PI*2);ctx!.fill();
  ctx!.fillStyle='#59666a';ctx!.beginPath();ctx!.arc(p.x,p.y,radius*camera.zoom,0,Math.PI*2);ctx!.fill();
  ctx!.restore();
}
function drawRoadNetwork(){
  // Road ribbons are drawn first; the junction surfaces are layered over their ends.
  for(const road of staticRoads)strokeRoad([road.a,road.b],1,'#59666a',1,road.width);
  for(const road of builtRoads)strokeRoad(road.points,road.progress,'#59666a',1,roadHalfWidth*2);
  // Centre markings stay subtle on village roads and stronger on the federal highway.
  for(let i=0;i<staticRoads.length;i++){
    const road=staticRoads[i]!;
    drawRoadCentreLine(road.a,road.b,i!==0);
  }
  // Junction radii match the widest road entering each node, avoiding oversized round blobs.
  drawJunction({x:-1,y:-13},[1.55,1.5]);
  drawJunction({x:10,y:-13},[1.55,1.5]);
  drawJunction({x:-1,y:5},[1.5,1.3]);
  drawJunction({x:-1,y:3},[1.5,1.3]);
  // A small stop/merge cue on the side-road approach to the highway.
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
  while(segment<routeLengths.length-1&&remaining>routeLengths[segment]!){remaining-=routeLengths[segment]!;segment++;}
  const a=route[segment]!,b=route[segment+1]!,t=clamp(remaining/(routeLengths[segment]||1),0,1);
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
  if(draft.length>1){const valid=isValidRoadPath(draft);strokeRoad(draft,1,valid?'#e9c46a':'#d96c62',.88);const first=worldToScreen(draft[0]!);ctx!.fillStyle=valid?'#fff1bd':'#f4b5ad';ctx!.beginPath();ctx!.arc(first.x,first.y,.22*camera.zoom,0,Math.PI*2);ctx!.fill();}
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
    ...builtRoads.map((r,i)=>({id:'built-'+i,points:r.points,width:r.width,kind:r.width>1.45?'highway' as const:'local' as const}))
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
function touchesRoadNetwork(p:Point){
  return nearestNetworkDistance(p)<=roadHalfWidth+.55;
}
function isValidRoadPath(points:Point[]){
  if(points.length<2)return false;
  if(!touchesRoadNetwork(points[0]!)&&!touchesRoadNetwork(points[points.length-1]!))return false;
  const total=points.slice(1).reduce((sum,p,i)=>sum+distance(p,points[i]!),0);let travelled=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,len=distance(a,b),steps=Math.max(2,Math.ceil(len/.25));
    for(let s=0;s<=steps;s++){
      const t=s/steps,p={x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)};
      if(obstacles.some(o=>Math.hypot(p.x-o.x,p.y-o.y)<o.r+roadHalfWidth))return false;
      const atStart=travelled+len*t<1.25,atEnd=total-(travelled+len*t)<1.25;
      const overlapStatic=staticRoads.some(r=>distanceToSegment(p,r.a,r.b)<roadHalfWidth*1.72);
      const overlapBuilt=builtRoads.some(r=>r.points.some((q,j)=>j>0&&distanceToSegment(p,r.points[j-1]!,q)<roadHalfWidth*1.72));
      if((overlapStatic||overlapBuilt)&&!(atStart||atEnd))return false;
    }travelled+=len;
  }return true;
}
function updateDraftPath(destination:Point){
  const current=draft[draft.length-1];if(!current||distance(current,destination)<.1)return;
  for(let i=draft.length-2;i>=0;i--){if(distance(draft[i]!,destination)<.1){draft.splice(i+1);return;}}
  let x=current.x,y=current.y;
  while(Math.abs(destination.x-x)>.1||Math.abs(destination.y-y)>.1){
    const dx=destination.x-x,dy=destination.y-y;
    if(Math.abs(dx)>=Math.abs(dy)&&Math.abs(dx)>.1)x+=Math.sign(dx)*roadGrid;
    else if(Math.abs(dy)>.1)y+=Math.sign(dy)*roadGrid;
    const next={x,y};if(distance(draft[draft.length-1]!,next)>.1)draft.push(next);
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
  const p=pointerToGrid(event);
  if(obstacles.some(o=>Math.hypot(p.x-o.x,p.y-o.y)<o.r+roadHalfWidth)){if(buildMessage)buildMessage.textContent='Нельзя начинать проект внутри здания, дерева или водоёма.';return;}
  drawing=true;pointerId=event.pointerId;draft=[p];canvas.setPointerCapture(event.pointerId);event.preventDefault();render();
}
function finishRoad(event:PointerEvent){
  if(!drawing||pointerId!==event.pointerId)return;
  drawing=false;pointerId=null;
  if(draft.length<2){draft=[];if(buildMessage)buildMessage.textContent='Наметь линию хотя бы на один участок.';render();return;}
  if(!isValidRoadPath(draft)){draft=[];if(buildMessage)buildMessage.textContent='Проект отклонён: линия должна соединяться с сетью и обходить здания, деревья и воду.';render();return;}
  // Snap connected endpoints to the exact centreline so the new edge becomes part of the graph.
  const firstSnap=nearestNetworkPoint(draft[0]!);
  if(firstSnap&&distance(draft[0]!,firstSnap)<=roadHalfWidth+.55)draft[0]=firstSnap;
  const lastIndex=draft.length-1,lastSnap=nearestNetworkPoint(draft[lastIndex]!);
  if(lastSnap&&distance(draft[lastIndex]!,lastSnap)<=roadHalfWidth+.55)draft[lastIndex]=lastSnap;
  const touchesHighway=draft.some(p=>Math.abs(p.y+13)<=1.65&&Math.abs(p.x)<=18);
  const touchesVillage=draft.some(p=>(Math.abs(p.x+1)<=1.65&&p.y>=-12&&p.y<=11)||(Math.abs(p.x)<=1.65&&p.y>=-12&&p.y<=-2)||(Math.abs(p.y-5)<=1.4&&p.x>=3&&p.x<=11)||(Math.abs(p.y-3)<=1.4&&p.x>=-11&&p.x<=-3));
  const road:Road={points:draft.map(p=>({...p})),progress:0,width:roadHalfWidth*2,connectsVillageToHighway:touchesHighway&&touchesVillage};
  builtRoads.push(road);constructionJobs.push(road);rebuildRoadGraph();draft=[];updateMission();
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
  const road=builtRoads.pop();if(!road)return;const index=constructionJobs.indexOf(road);if(index>=0)constructionJobs.splice(index,1);rebuildRoadGraph();updateMission();if(buildMessage)buildMessage.textContent='Последний построенный участок удалён.';render();
});
window.addEventListener('keydown',event=>{
  if(event.key==='+'||event.key==='=')setZoom(1.12);if(event.key==='-')setZoom(.89);
  if(event.key.toLowerCase()==='r'){camera={x:0,y:-1,zoom:Math.min(width,height)/22};render();}
  if(event.key==='Escape'&&draft.length)clearDraft();
});
let previousTime=0;
function animate(time:number){
  const delta=Math.min((time-previousTime)/1000||0,.05);previousTime=time;
  for(const job of constructionJobs)job.progress=clamp(job.progress+delta/Math.max(1.2,job.points.length*.32),0,1);
  for(const vehicle of vehicles){vehicle.distance+=vehicle.speed*delta*vehicle.direction;if(vehicle.distance>=routeLength){vehicle.distance=routeLength;vehicle.direction=-1;}if(vehicle.distance<=0){vehicle.distance=0;vehicle.direction=1;}}
  render();requestAnimationFrame(animate);
}
canvas.style.cursor='grab';
render();requestAnimationFrame(animate);
window.addEventListener('beforeunload',()=>observer.disconnect());
