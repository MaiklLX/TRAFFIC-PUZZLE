import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const mount = document.querySelector<HTMLDivElement>('#world');
if (!mount) throw new Error('World mount not found');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#b9d9bd');
scene.fog = new THREE.Fog('#b9d9bd', 28, 72);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 150);
camera.position.set(17, 19, 17);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
mount.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = true;
controls.enableRotate = true;
controls.minDistance = 12;
controls.maxDistance = 42;
controls.minPolarAngle = 0.48;
controls.maxPolarAngle = 1.18;
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
controls.touches.ONE = THREE.TOUCH.PAN;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

scene.add(new THREE.HemisphereLight('#f4fff0', '#788d65', 2.1));
const sun = new THREE.DirectionalLight('#fff2d2', 3.1);
sun.position.set(-12, 22, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(window.innerWidth < 700 ? 1024 : 2048, window.innerWidth < 700 ? 1024 : 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
scene.add(sun);

const mat = (color: string, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });
const grass = mat('#91bd83');
const grassLight = mat('#a6cb8c');
const roadMat = mat('#59666a');
const roadEdge = mat('#d9d5bd');
const cream = mat('#f3e7c8');
const red = mat('#dc8068');
const blue = mat('#78a9b6');
const yellow = mat('#e9c46a');
const dark = mat('#4b5550');

function box(parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), grass);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.18;
ground.receiveShadow = true;
scene.add(ground);

// Soft rolling hills frame the playable valley.
for (const [x, z, s, color] of [[-19,-12,7,'#83b47d'],[19,-16,9,'#8fbd81'],[-21,15,10,'#a0c889'],[21,14,8,'#80ae77']] as const) {
  const hill = new THREE.Mesh(new THREE.SphereGeometry(s, 24, 16), mat(color));
  hill.scale.y = 0.34;
  hill.position.set(x, -1.7, z);
  hill.receiveShadow = true;
  scene.add(hill);
}

// Main road and the little federal highway at the north edge.
function road(x: number, z: number, w: number, d: number, rotation = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0.015, z);
  group.rotation.y = rotation;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), roadMat);
  base.receiveShadow = true; base.castShadow = true; group.add(base);
  const edge1 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, 0.11), roadEdge);
  edge1.position.set(0, 0.075, -d / 2 + 0.13); group.add(edge1);
  const edge2 = edge1.clone(); edge2.position.z = d / 2 - 0.13; group.add(edge2);
  scene.add(group);
  return group;
}
road(0, -13, 36, 3.1);
road(-1, -1, 3.0, 25);
road(5, 5, 13, 2.6);
road(-7, 3, 10, 2.6);
road(0, -7.8, 3, 10.8);
road(10, -13, 3, 5.2);

// Road dashes.
for (let x = -16; x <= 16; x += 3.2) {
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.025, 0.09), mat('#f5e8b7'));
  dash.position.set(x, 0.095, -13); scene.add(dash);
}

// Houses with pitched roofs, porches and tiny chimneys.
function house(x: number, z: number, wall: THREE.Material, roof: THREE.Material, scale = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); scene.add(g);
  box(g, 2.7, 1.8, 2.3, wall, 0, 0.9, 0);
  const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(2.05, 1.35, 4), roof);
  roofMesh.position.y = 2.45; roofMesh.rotation.y = Math.PI / 4; roofMesh.castShadow = true; g.add(roofMesh);
  box(g, 0.52, 1.05, 0.12, mat('#916c52'), 0, 0.55, 1.17);
  box(g, 0.52, 0.52, 0.08, mat('#a9d6db'), -0.82, 1.12, 1.17);
  box(g, 0.52, 0.52, 0.08, mat('#a9d6db'), 0.82, 1.12, 1.17);
  box(g, 0.36, 0.85, 0.36, mat('#bd9a78'), 0.72, 2.5, -0.48);
  return g;
}
house(-6.5, -3.2, cream, red, 1.05);
house(7.7, 1.7, mat('#e8d9ad'), blue, 0.92);
house(-10.4, 5.8, mat('#e8d4b5'), yellow, 0.88);
house(2.8, 8.3, mat('#e8e0c8'), red, 0.8);
house(-2.1, -9.0, mat('#e7d9b7'), blue, 0.72);

// Small shop and a barn.
const shop = new THREE.Group(); shop.position.set(11, -5, 0); scene.add(shop);
box(shop, 3.3, 2.1, 2.8, mat('#e9d8ae'), 0, 1, 0);
const shopRoof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.4, 4), mat('#6d9b78'));
shopRoof.position.y = 2.75; shopRoof.rotation.y = Math.PI / 4; shop.add(shopRoof);
box(shop, 1.1, 0.8, 0.08, mat('#b7d9d2'), 0, 1.25, 1.43);

const barn = new THREE.Group(); barn.position.set(-13, -4, 0); scene.add(barn);
box(barn, 3.5, 2.1, 3, mat('#c96f5d'), 0, 1, 0);
const barnRoof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.5, 4), mat('#765e52'));
barnRoof.position.y = 2.75; barnRoof.rotation.y = Math.PI / 4; barn.add(barnRoof);
box(barn, 1.2, 1.5, 0.1, mat('#704f45'), 0, 0.8, 1.55);

// Trees: rounded crowns and simple trunks, arranged around homes.
function tree(x: number, z: number, size = 1) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16*size, 0.22*size, 1.05*size, 7), mat('#8b6849'));
  trunk.position.set(x, 0.45*size, z); trunk.castShadow = true; scene.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.92*size, 12, 10), mat(['#5d9c68','#70a96d','#82b779'][Math.floor((x*x+z*z)%3)]));
  crown.scale.set(1, 1.08, 0.95); crown.position.set(x, 1.35*size, z); crown.castShadow = true; crown.receiveShadow = true; scene.add(crown);
}
[[-14,-10],[-11,-11],[-16,1],[-12,10],[-4,12],[4,12],[12,9],[15,4],[14,-9],[6,-5],[-9,-1],[0,5]] .forEach(([x,z], i) => tree(x!, z!, i%3===0?1.2:0.9));

// Flower patches and a pond.
const pond = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), mat('#79b7bd', 0.35));
pond.rotation.x = -Math.PI/2; pond.position.set(16, -0.08, 7); pond.scale.set(1.25, 0.75, 1); scene.add(pond);
for (let i=0;i<36;i++) {
  const a = i*2.399, r = 5 + (i%4)*0.65;
  const flower = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 6), mat(i%2?'#f3d47c':'#f3e6d1'));
  flower.position.set(Math.cos(a)*r, 0.1, Math.sin(a)*r); scene.add(flower);
}

// Friendly toy cars on the roads.
function car(x: number, z: number, color: THREE.Material, rotation = 0) {
  const g = new THREE.Group(); g.position.set(x, 0.18, z); g.rotation.y = rotation; scene.add(g);
  box(g, 1.35, 0.42, 0.72, color, 0, 0.28, 0);
  box(g, 0.72, 0.38, 0.58, mat('#c9e1df'), -0.08, 0.65, 0);
  for (const wx of [-0.42,0.42]) for (const wz of [-0.4,0.4]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.12,10), dark);
    wheel.rotation.z = Math.PI/2; wheel.position.set(wx,0.16,wz); g.add(wheel);
  }
  return g;
}
car(-1, -11.8, red, Math.PI/2);
car(-1, -4.2, mat('#e9e3d2'), Math.PI / 2);

// A distant highway sign gives the scene a sense of place.
const sign = new THREE.Group(); sign.position.set(-13,0,-15.1); scene.add(sign);
box(sign,0.16,2.6,0.16,mat('#786d57'),0,1.25,0);
box(sign,2.4,1.15,0.18,mat('#568b70'),0,2.6,0);
box(sign,1.9,0.08,0.2,mat('#f4e7c5'),0,2.6,0.12);


// Extra village details: fences, lamps, paths and garden beds.
const wood = mat('#a47b55');
const fencePaint = mat('#ead9b8');
function fence(x: number, z: number, length: number, rotation = 0) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotation; scene.add(group);
  const count = Math.max(2, Math.floor(length / 0.8));
  for (let i = 0; i <= count; i++) {
    const px = -length / 2 + (length * i / count);
    box(group, 0.13, 0.72, 0.13, wood, px, 0.36, 0);
  }
  box(group, length, 0.11, 0.12, fencePaint, 0, 0.48, 0);
  box(group, length, 0.11, 0.12, fencePaint, 0, 0.23, 0);
}
fence(-8.9, -5.4, 4.2);
fence(-11.2, 7.5, 4.4, Math.PI / 2);
fence(5.8, 3.5, 3.5);
fence(4.2, 9.7, 5.0);

const lampMetal = mat('#65756a', 0.55);
const lampGlow = new THREE.MeshStandardMaterial({ color: '#ffe6a1', emissive: '#f6c96c', emissiveIntensity: 0.65 });
function streetLamp(x: number, z: number) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 2.35, 8), lampMetal);
  pole.position.y = 1.17; pole.castShadow = true; g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.07), lampMetal);
  arm.position.set(0.25, 2.25, 0); g.add(arm);
  const shade = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lampGlow);
  shade.position.set(0.52, 2.17, 0); g.add(shade);
}
[[-3,-9.8],[7,-1.4],[9,5.8],[-7,1.5],[-3,-15],[8,-15]].forEach(([x,z]) => streetLamp(x!, z!));

const pathMat = mat('#d5c59b');
function gardenPath(x: number, z: number, w: number, d: number, rotation = 0) {
  const path = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), pathMat);
  path.position.set(x, -0.025, z); path.rotation.y = rotation; scene.add(path);
}
gardenPath(-6.5, -5.1, 1.15, 2.7);
gardenPath(7.7, 3.9, 1.0, 2.5);
gardenPath(11, -2.9, 1.2, 2.4);

const cropColors = [mat('#78a66c'), mat('#a6bb68'), mat('#c6a75f')];
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 5; col++) {
    const crop = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 6), cropColors[(row + col) % cropColors.length]);
    crop.scale.set(1.1, 0.7, 1.1);
    crop.position.set(-16 + col * 0.55, 0.12, 5 + row * 0.58);
    scene.add(crop);
  }
}

// A small stone crossing and stepping stones make the landscape feel lived in.
const stone = mat('#b8b8a0');
for (let i = 0; i < 7; i++) {
  const step = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.12, 7), stone);
  step.position.set(13.2 + i * 0.62, -0.03, 8.4 + Math.sin(i * 0.65) * 0.18);
  step.rotation.y = i * 0.24; scene.add(step);
}

// Two cars follow simple village routes so the prototype already feels alive.
const movingCars = [
  { mesh: car(-8, -13, yellow), from: -8, to: 8, z: -13, speed: 1.65, offset: 0 },
  { mesh: car(1, 4.85, blue), from: 1, to: 9, z: 4.85, speed: 1.15, offset: 2.4 }
];

const clock = new THREE.Clock();
function resize() {
  const w = mount!.clientWidth, h = mount!.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.fov = w < 680 ? 39 : 34;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, w < 680 ? 1.5 : 2));
  renderer.setSize(w, h, false);
}
const observer = new ResizeObserver(resize);
observer.observe(mount);
resize();

let previousFrameTime = 0;
function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  const delta = Math.min(Math.max(elapsed - previousFrameTime, 0), 0.05);
  previousFrameTime = elapsed;
  for (const vehicle of movingCars) {
    const span = vehicle.to - vehicle.from;
    const progress = ((elapsed * vehicle.speed + vehicle.offset) % (span * 2)) / span;
    const x = progress <= 1 ? vehicle.from + progress * span : vehicle.to - (progress - 1) * span;
    vehicle.mesh.position.set(x, 0.18, vehicle.z);
    vehicle.mesh.rotation.y = progress <= 1 ? 0 : Math.PI;
  }
  updateRoadTraffic(delta);
  controls.update();
  renderer.render(scene, camera);
}
animate();

document.querySelector<HTMLButtonElement>('#reset-camera')?.addEventListener('click', () => {
  camera.position.set(17,19,17); controls.target.set(0,0,0); controls.update();
});
document.querySelector<HTMLButtonElement>('#zoom-in')?.addEventListener('click', () => {
  camera.position.sub(controls.target).multiplyScalar(0.86).add(controls.target);
});
document.querySelector<HTMLButtonElement>('#zoom-out')?.addEventListener('click', () => {
  camera.position.sub(controls.target).multiplyScalar(1.16).add(controls.target);
});
document.querySelector<HTMLButtonElement>('#rotate-camera')?.addEventListener('click', () => {
  const offset = camera.position.clone().sub(controls.target);
  offset.applyAxisAngle(new THREE.Vector3(0,1,0), Math.PI/4);
  camera.position.copy(controls.target).add(offset);
});
let selectedTool = 'inspect';
const toolButtons = [...document.querySelectorAll<HTMLButtonElement>('.tool')];
toolButtons.forEach(button => {
  button.addEventListener('click', () => {
    selectedTool = button.dataset.tool ?? 'inspect';
    document.querySelector('.tool.active')?.classList.remove('active');
    button.classList.add('active');
    controls.enabled = selectedTool !== 'road';
    const hud = document.querySelector<HTMLElement>('#build-hud');
    if (hud) hud.hidden = selectedTool !== 'road';
    const hint = document.querySelector<HTMLElement>('#build-message');
    if (hint) hint.textContent = selectedTool === 'road'
      ? 'Коснись поля и протяни дорогу. Отпусти, чтобы построить.'
      : 'Выбери инструмент «Дороги», чтобы начать строительство.';
  });
});

// KT-003: drag-to-build road editor on a 1.5-unit isometric grid.
const roadGrid = 1.5;
const roadRaycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const previewGroup = new THREE.Group();
scene.add(previewGroup);
const builtRoads: THREE.Group[] = [];
const roadTraffic: { mesh: THREE.Group; points: THREE.Vector2[]; lengths: number[]; total: number; distance: number; speed: number; direction: number; road: THREE.Group }[] = [];
const junctionMarkers = new Map<string, THREE.Mesh>();
let drawing = false;
let draft: THREE.Vector2[] = [];
let budget = 2400;
let rewardClaimed = false;
const budgetValue = document.querySelector<HTMLElement>('#budget-value');
const missionCount = document.querySelector<HTMLElement>('.mission-count');
const missionProgress = document.querySelector<HTMLElement>('.progress span');
const buildMessage = document.querySelector<HTMLElement>('#build-message');
const trafficCount = document.querySelector<HTMLElement>('#traffic-count');

function pointerToGrid(event: PointerEvent): THREE.Vector2 | null {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  roadRaycaster.setFromCamera(pointerNdc, camera);
  const hit = new THREE.Vector3();
  if (!roadRaycaster.ray.intersectPlane(groundPlane, hit)) return null;
  const x = THREE.MathUtils.clamp(Math.round(hit.x / roadGrid) * roadGrid, -18, 18);
  const z = THREE.MathUtils.clamp(Math.round(hit.z / roadGrid) * roadGrid, -18, 15);
  return new THREE.Vector2(x, z);
}

function appendGridPath(target: THREE.Vector2[], destination: THREE.Vector2) {
  let current = target[target.length - 1];
  if (!current || current.distanceTo(destination) < 0.1) return;
  let x = current.x, z = current.y;
  // Fill skipped cells when the pointer moves quickly; prefer the dominant axis.
  while (Math.abs(destination.x - x) > 0.1 || Math.abs(destination.y - z) > 0.1) {
    const dx = destination.x - x, dz = destination.y - z;
    if (Math.abs(dx) >= Math.abs(dz) && Math.abs(dx) > 0.1) x += Math.sign(dx) * roadGrid;
    else if (Math.abs(dz) > 0.1) z += Math.sign(dz) * roadGrid;
    const next = new THREE.Vector2(x, z);
    if (target[target.length - 1]?.distanceTo(next) > 0.1) target.push(next);
  }
}

function clearPreview() {
  while (previewGroup.children.length) {
    const child = previewGroup.children.pop()!;
    child.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach(item => item.dispose());
        else material.dispose();
      }
    });
  }
}

function drawRoadSegments(points: THREE.Vector2[], parent: THREE.Group, preview = false) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const dx = b.x - a.x, dz = b.y - a.y;
    const length = Math.hypot(dx, dz) + 0.08;
    const material = preview
      ? new THREE.MeshStandardMaterial({ color: '#f5d47a', transparent: true, opacity: 0.78, roughness: 0.85 })
      : roadMat;
    const segment = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, length), material);
    segment.position.set((a.x + b.x) / 2, 0.055, (a.y + b.y) / 2);
    segment.rotation.y = Math.atan2(dx, dz);
    segment.receiveShadow = true;
    segment.castShadow = !preview;
    parent.add(segment);
    if (!preview) {
      const edgeMaterial = roadEdge;
      for (const side of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, length), edgeMaterial);
        edge.position.set(side * 0.91, 0.09, 0);
        segment.add(edge);
      }
    }
  }
}

function refreshPreview() {
  clearPreview();
  drawRoadSegments(draft, previewGroup, true);
}

function refreshJunctions() {
  for (const marker of junctionMarkers.values()) {
    scene.remove(marker);
    marker.geometry.dispose();
  }
  junctionMarkers.clear();
  const usage = new Map<string, { point: THREE.Vector2; roads: number }>();
  for (const built of builtRoads) {
    const points = built.userData.gridPoints as THREE.Vector2[] | undefined;
    if (!points) continue;
    const seen = new Set<string>();
    for (const point of points) {
      const key = `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = usage.get(key) ?? { point, roads: 0 };
      entry.roads += 1;
      usage.set(key, entry);
    }
  }
  for (const [key, entry] of usage) {
    if (entry.roads < 2) continue;
    const marker = new THREE.Mesh(new THREE.CircleGeometry(0.92, 20), roadMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(entry.point.x, 0.132, entry.point.y);
    marker.receiveShadow = true;
    scene.add(marker);
    junctionMarkers.set(key, marker);
  }
}

function launchRoadTraffic(road: THREE.Group, points: THREE.Vector2[]) {
  if (points.length < 3) return;
  const route = points.map(point => point.clone());
  const lengths = route.slice(1).map((point, index) => point.distanceTo(route[index]!));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total < 3) return;
  const mesh = car(route[0]!.x, route[0]!.y, yellow);
  roadTraffic.push({ mesh, points: route, lengths, total, distance: 0, speed: 2.2, direction: 1, road });
  if (trafficCount) trafficCount.textContent = String(18 + roadTraffic.length);
}

function updateRoadTraffic(delta: number) {
  for (const vehicle of roadTraffic) {
    vehicle.distance += vehicle.speed * delta * vehicle.direction;
    if (vehicle.distance >= vehicle.total) {
      vehicle.distance = vehicle.total;
      vehicle.direction = -1;
    } else if (vehicle.distance <= 0) {
      vehicle.distance = 0;
      vehicle.direction = 1;
    }
    let remaining = vehicle.distance;
    let segment = 0;
    while (segment < vehicle.lengths.length - 1 && remaining > vehicle.lengths[segment]!) {
      remaining -= vehicle.lengths[segment]!;
      segment++;
    }
    const a = vehicle.points[segment]!;
    const b = vehicle.points[segment + 1]!;
    const length = vehicle.lengths[segment] || 1;
    const t = THREE.MathUtils.clamp(remaining / length, 0, 1);
    vehicle.mesh.position.set(THREE.MathUtils.lerp(a.x, b.x, t), 0.18, THREE.MathUtils.lerp(a.y, b.y, t));
    const dx = b.x - a.x, dz = b.y - a.y;
    vehicle.mesh.rotation.y = Math.atan2(-dz, dx) + (vehicle.direction < 0 ? Math.PI : 0);
  }
}

function startRoad(event: PointerEvent) {
  if (selectedTool !== 'road' || event.button !== 0) return;
  const point = pointerToGrid(event);
  if (!point) return;
  drawing = true;
  draft = [point];
  renderer.domElement.setPointerCapture(event.pointerId);
  refreshPreview();
  event.preventDefault();
}
function moveRoad(event: PointerEvent) {
  if (!drawing) return;
  const point = pointerToGrid(event);
  if (!point) return;
  appendGridPath(draft, point);
  refreshPreview();
}
function finishRoad(event: PointerEvent) {
  if (!drawing) return;
  drawing = false;
  if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
  if (draft.length < 2) {
    clearPreview();
    draft = [];
    if (buildMessage) buildMessage.textContent = 'Протяни дорогу хотя бы на одну клетку.';
    return;
  }
  const cost = (draft.length - 1) * 25;
  if (budget < cost) {
    clearPreview();
    draft = [];
    if (buildMessage) buildMessage.textContent = 'Недостаточно монет для этой дороги.';
    return;
  }
  const path = new THREE.Group();
  const routePoints = draft.map(point => point.clone());
  drawRoadSegments(routePoints, path);
  path.userData.gridPoints = routePoints;
  scene.add(path);
  const touchesHighway = draft.some(point => Math.abs(point.y + 13) <= 1.65 && Math.abs(point.x) <= 18);
  const touchesVillage = draft.some(point =>
    (Math.abs(point.x + 1) <= 1.65 && point.y >= -12 && point.y <= 11) ||
    (Math.abs(point.x) <= 1.65 && point.y >= -12 && point.y <= -2) ||
    (Math.abs(point.y - 5) <= 1.4 && point.x >= 3 && point.x <= 11) ||
    (Math.abs(point.y - 3) <= 1.4 && point.x >= -11 && point.x <= -3)
  );
  path.userData.connectsVillageToHighway = touchesHighway && touchesVillage;
  path.userData.cost = cost;
  builtRoads.push(path);
  refreshJunctions();
  launchRoadTraffic(path, routePoints);
  budget -= cost;
  const missionDone = builtRoads.some(item => item.userData.connectsVillageToHighway === true);
  if (missionDone && !rewardClaimed) { budget += 300; rewardClaimed = true; }
  if (budgetValue) budgetValue.textContent = budget.toLocaleString('ru-RU');
  if (missionCount) missionCount.textContent = missionDone ? '1 / 1' : '0 / 1';
  if (missionProgress) missionProgress.style.width = missionDone ? '100%' : '8%';
  if (buildMessage) buildMessage.textContent = missionDone
    ? `Отлично! Деревня соединена с федеральной трассой. Награда +300 монет начислена. Дорога: ${draft.length - 1} сегм.`
    : `Дорога построена: ${draft.length - 1} сегм. Для задания соедини её с деревенской дорогой и федеральной трассой. Стоимость: ${cost} монет.`;
  clearPreview();
  draft = [];
}
renderer.domElement.addEventListener('pointerdown', startRoad);
renderer.domElement.addEventListener('pointermove', moveRoad);
renderer.domElement.addEventListener('pointerup', finishRoad);
renderer.domElement.addEventListener('pointercancel', finishRoad);

document.querySelector<HTMLButtonElement>('#cancel-road')?.addEventListener('click', () => {
  drawing = false; draft = []; clearPreview();
  if (buildMessage) buildMessage.textContent = 'Черновик дороги отменён.';
});
document.querySelector<HTMLButtonElement>('#undo-road')?.addEventListener('click', () => {
  const last = builtRoads.pop();
  if (!last) return;
  scene.remove(last);
  const trafficToRemove = roadTraffic.filter(vehicle => vehicle.road === last);
  for (const vehicle of trafficToRemove) {
    scene.remove(vehicle.mesh);
    const index = roadTraffic.indexOf(vehicle);
    if (index >= 0) roadTraffic.splice(index, 1);
  }
  if (trafficCount) trafficCount.textContent = String(18 + roadTraffic.length);
  refreshJunctions();
  budget += Number(last.userData.cost ?? 0);
  last.traverse(object => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  const missionDone = builtRoads.some(item => item.userData.connectsVillageToHighway === true);
  if (!missionDone && rewardClaimed) { budget -= 300; rewardClaimed = false; }
  if (budgetValue) budgetValue.textContent = budget.toLocaleString('ru-RU');
  if (missionCount) missionCount.textContent = missionDone ? '1 / 1' : '0 / 1';
  if (missionProgress) missionProgress.style.width = missionDone ? '100%' : '8%';
  if (buildMessage) buildMessage.textContent = 'Последняя построенная дорога удалена.';
});

window.addEventListener('keydown', (event) => {
  if (event.key === '+' || event.key === '=') camera.position.sub(controls.target).multiplyScalar(0.9).add(controls.target);
  if (event.key === '-') camera.position.sub(controls.target).multiplyScalar(1.1).add(controls.target);
  if (event.key.toLowerCase() === 'r') {
    camera.position.set(17, 19, 17);
    controls.target.set(0, 0, 0);
  }
});
window.addEventListener('beforeunload', () => {
  observer.disconnect();
  controls.dispose();
  renderer.dispose();
});
