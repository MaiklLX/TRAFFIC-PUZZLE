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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
sun.shadow.mapSize.set(2048, 2048);
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
car(2.5, -13, yellow);
car(4.7, 4.85, blue);
car(-1, -4.2, mat('#e9e3d2'), 0);

// A distant highway sign gives the scene a sense of place.
const sign = new THREE.Group(); sign.position.set(-13,0,-15.1); scene.add(sign);
box(sign,0.16,2.6,0.16,mat('#786d57'),0,1.25,0);
box(sign,2.4,1.15,0.18,mat('#568b70'),0,2.6,0);
box(sign,1.9,0.08,0.2,mat('#f4e7c5'),0,2.6,0.12);

const clock = new THREE.Clock();
function resize() {
  const w = mount!.clientWidth, h = mount!.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
const observer = new ResizeObserver(resize);
observer.observe(mount);
resize();

function animate() {
  requestAnimationFrame(animate);
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
document.querySelectorAll<HTMLButtonElement>('.tool').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelector('.tool.active')?.classList.remove('active');
    button.classList.add('active');
  });
});

window.addEventListener('beforeunload', () => observer.disconnect());
void clock;
