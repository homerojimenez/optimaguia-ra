// OptimaGuía · RA con seguimiento espacial (WebXR immersive-ar + three.js).
// En iPhone corre dentro del App Clip Needle Go (ARKit); en Android, en Chrome. Con ?sim, simulación en el ordenador.
//
// El guía vive en el suelo de la sala: te sigue mientras andas, y cuando tocas un punto camina hasta ponerse
// delante de ti, se gira, lo señala y te lo explica. Los puntos cuelgan de los vinilos: al reconocer un vinilo
// (seguimiento de imagen de WebXR) aparecen los de su zona y se quedan fijos en la sala aunque dejes de verlo.
// Si el navegador no reconoce imágenes, cada zona se coloca a mano con un toque en el suelo.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as voz from '../voz.js';
import { ZONES, INTRO, OUTRO, QA, SUGG, FALLBACK } from './contenido.js';

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const SIM = qs.has('sim');
const DEBUG = qs.has('debug');
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const APPCLIP = `https://appclip.needle.tools/ar?url=${encodeURIComponent(location.href.split('#')[0])}`;
const IN_APPCLIP = !!(window.__og && window.__og.appclip); // dentro del App Clip Needle Go

const WALK = 0.67;              // m/s a los que está hecho el ciclo Walk
const EYE = 1.45;               // altura típica del móvil, mientras no se ve el suelo
// En vertical, la cámara del móvil abarca unos 30° de ancho: a 2,8 m el guía se ve entero y cabe desplazado a un lado
const AHEAD = 2.8, SIDE = 0.45;  // dónde se pone el guía cuando te acompaña: delante y un poco a un lado
const ONCE = ['Greet', 'Point', 'PointLeft', 'Beckon', 'PresentL', 'PresentR'];
const UP = new THREE.Vector3(0, 1, 0);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:«»"]/g, ' ').replace(/\s+/g, ' ').trim();
function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fwdOf = (yaw, out = V()) => out.set(Math.sin(yaw), 0, Math.cos(yaw));
const rightOf = (dir, out = V()) => out.set(-dir.z, 0, dir.x); // la derecha de quien mira hacia dir
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
function noXRSelect(el) { el.addEventListener('beforexrselect', (e) => e.preventDefault()); }
// iOS solo deja sonar audio después de un toque. Si la RA la arranca Needle Go sin toque, se pide uno antes de que hable el guía.
let audioOK = false;
function unlockOnce() { if (audioOK) return; voz.unlockAudio(); audioOK = true; }
for (const ev of ['touchend', 'click']) document.addEventListener(ev, () => { if (!audioOK && xr.session) { unlockOnce(); renderChip(); } }, true);
// Un toque en un botón no debe contar además como toque en la escena (Needle Go no siempre respeta beforexrselect)
let lastUiTouch = 0;
document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('.ui, .mk')) lastUiTouch = performance.now(); }, true);

// ---------------------------------------------------------------------------
// three.js
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
$('#gl').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.02, 80);
scene.add(camera);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3026, 0.9));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.6); sun.position.set(1.5, 3, 4); scene.add(sun);
addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

function canvasTex(draw, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const blobTex = canvasTex((x, s) => { const g = x.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2 - 2); g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); });
const pinTex = (dot) => canvasTex((x, s) => {
  x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 8, 0, Math.PI * 2); x.fillStyle = 'rgba(0,0,0,.22)'; x.fill(); x.lineWidth = 8; x.strokeStyle = '#fff'; x.stroke();
  x.beginPath(); x.arc(s / 2, s / 2, s * 0.15, 0, Math.PI * 2); x.fillStyle = dot; x.fill();
});
const PIN = pinTex('#C8174F'), PIN_SEEN = pinTex('#8A9099');
const ringGeo = new THREE.RingGeometry(0.17, 0.2, 48).rotateX(-Math.PI / 2);
const stemGeo = new THREE.CylinderGeometry(0.004, 0.004, 1, 6);
const proxyGeo = new THREE.SphereGeometry(0.3, 8, 6);
const white = (o) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, depthWrite: false });

// Diana para colocar zonas a mano y para ver que ya se reconoce el suelo
const reticle = new THREE.Group(); reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.1, 0.125, 40).rotateX(-Math.PI / 2), white(0.95)));
reticle.add(new THREE.Mesh(new THREE.CircleGeometry(0.018, 16).rotateX(-Math.PI / 2), white(0.95)));
let reticleOK = false; const reticlePos = V();

// ---------------------------------------------------------------------------
// Suelo: se estima con los toques de la prueba de impacto sobre superficies horizontales
// ---------------------------------------------------------------------------
let floorY = null; const floorSamples = [];
function addFloorSample(y) {
  floorSamples.push(y); if (floorSamples.length > 60) floorSamples.shift();
  const s = [...floorSamples].sort((a, b) => a - b); const v = s[Math.floor(s.length * 0.2)];
  floorY = floorY === null ? v : floorY + (v - floorY) * 0.15;
}

// ---------------------------------------------------------------------------
// Visitante (la cámara del móvil)
// ---------------------------------------------------------------------------
const U = { pos: V(), fwd: V(0, 0, -1), floor: V() };
const _q = new THREE.Quaternion(), _a = V(), _b = V(), _c = V();
function updateUser() {
  camera.getWorldPosition(U.pos);
  const f = _a.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(_q)); f.y = 0;
  if (f.lengthSq() > 0.02) { f.normalize(); U.fwd.lerp(f, 0.2); if (U.fwd.lengthSq() < 1e-4) U.fwd.copy(f); U.fwd.normalize(); }
  U.floor.set(U.pos.x, floorY ?? U.pos.y - EYE, U.pos.z);
}

// ---------------------------------------------------------------------------
// Zonas y puntos
// ---------------------------------------------------------------------------
const zones = ZONES.map((z, i) => ({ ...z, index: i, placed: false, source: null, c: V(), n: V(0, 0, 1), samples: [], objs: [] }));
const beacons = [];
const TOTAL = ZONES.reduce((n, z) => n + z.beacons.length, 0);
const zoneFloor = (z) => floorY ?? z.c.y - z.vinyl.centerM;
function beaconWorld(b, out) {
  const z = b.zone;
  if (b.atVinyl) return out.copy(z.c);
  const x = _b.crossVectors(UP, z.n); // derecha del vinilo
  out.copy(z.c).addScaledVector(x, b.x).addScaledVector(z.n, b.z);
  out.y = zoneFloor(z) + b.y;
  return out;
}

// Pose de un vinilo reconocido. No se da por hecha la convención de ejes: la normal es el eje de la imagen
// que más apunta hacia el móvil (el visitante siempre está delante del vinilo cuando lo reconoce).
const _m = new THREE.Matrix4();
function onImageMatrix(zone, arr) {
  _m.fromArray(arr);
  const c = V().setFromMatrixPosition(_m);
  const axes = [0, 1, 2].map((i) => V().setFromMatrixColumn(_m, i).normalize());
  onImagePose(zone, c, axes);
}
function onImagePose(zone, c, axes) {
  const toCam = _c.subVectors(U.pos, c).normalize();
  let best = axes[0], bd = 0;
  for (const a of axes) { const d = a.dot(toCam); if (Math.abs(d) > Math.abs(bd)) { bd = d; best = a; } }
  const n = best.clone().multiplyScalar(Math.sign(bd) || 1); n.y = 0;
  if (n.lengthSq() < 0.3) return; // imagen tumbada: no es un vinilo de pared
  n.normalize();
  zone.lastSeen = performance.now();
  if (zone.source === 'image') { zone.c.lerp(c, 0.05); zone.n.lerp(n, 0.05).normalize(); return; }
  zone.samples.push({ c, n });
  if (zone.samples.length < 6) return;
  const ac = V(), an = V();
  for (const s of zone.samples) { ac.add(s.c); an.add(s.n); }
  zone.samples = [];
  placeZone(zone, ac.divideScalar(6), an.normalize(), 'image');
}
function placeZone(zone, c, n, source) {
  const first = !zone.placed;
  zone.c.copy(c); zone.n.copy(n); zone.source = source; zone.placed = true;
  if (floorY === null) addFloorSample(c.y - zone.vinyl.centerM);
  if (first) { createBeacons(zone); onZoneFound(zone); }
  renderTop();
}
function placeManual(zone) {
  if (!reticleOK) return false;
  const P = reticlePos.clone();
  const n = V().subVectors(U.pos, P); n.y = 0;
  if (n.lengthSq() < 0.04) return false;
  n.normalize();
  addFloorSample(P.y);
  placeZone(zone, P.addScaledVector(UP, zone.vinyl.centerM), n, 'manual');
  return true;
}

function createBeacons(zone) {
  for (const def of zone.beacons) {
    const b = { ...def, zone, world: V(), seen: false };
    const g = new THREE.Group(); scene.add(g);
    const pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: PIN, transparent: true, depthWrite: false }));
    pin.scale.set(0.12, 0.12, 1); pin.renderOrder = 3; g.add(pin);
    let ring = null, stem = null;
    if (!def.atVinyl) { ring = new THREE.Mesh(ringGeo, white(0.85)); stem = new THREE.Mesh(stemGeo, white(0.5)); g.add(ring, stem); }
    const proxy = new THREE.Mesh(proxyGeo, new THREE.MeshBasicMaterial({ visible: false })); proxy.userData.b = b; g.add(proxy);
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'mk'; el.hidden = true;
    el.innerHTML = '<span class="ring"></span><span class="lbl"><span class="nm"></span><small></small></span>';
    el.querySelector('.nm').textContent = def.name;
    el.setAttribute('aria-label', `${def.name}. Que el guía lo explique`);
    el.addEventListener('click', () => explain(b)); noXRSelect(el);
    $('#marks').appendChild(el);
    Object.assign(b, { g, pin, ring, stem, proxy, el, dist: '' });
    beaconWorld(b, b.world);
    beacons.push(b); zone.objs.push(b);
  }
}
function updateBeacons(t) {
  for (let i = 0; i < beacons.length; i++) {
    const b = beacons[i];
    beaconWorld(b, b.world);
    b.pin.position.copy(b.world); b.proxy.position.copy(b.world);
    b.pin.visible = !xr.dom;
    const want = b.seen ? PIN_SEEN : PIN; if (b.pin.material.map !== want) { b.pin.material.map = want; b.pin.material.needsUpdate = true; }
    const s = b === pointed ? 0.17 : 0.12; b.pin.scale.set(s, s, 1);
    if (b.ring) {
      const fy = zoneFloor(b.zone);
      const k = 1 + 0.1 * Math.sin(t * 0.004 + i);
      b.ring.position.set(b.world.x, fy + 0.006, b.world.z); b.ring.scale.set(k, 1, k);
      const h = Math.max(0.01, b.world.y - fy - 0.08);
      b.stem.position.set(b.world.x, fy + h / 2, b.world.z); b.stem.scale.y = h;
    }
  }
}
const _p = V();
function updateLabels() {
  if (!xr.dom) return;
  const w = innerWidth, h = innerHeight;
  const camFwd = _a.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(_q));
  for (const b of beacons) {
    const el = b.el;
    if (_b.subVectors(b.world, U.pos).dot(camFwd) < 0.15) { el.hidden = true; continue; }
    _p.copy(b.world).project(camera);
    if (Math.abs(_p.x) > 1.1 || Math.abs(_p.y) > 1.1) { el.hidden = true; continue; }
    const d = U.pos.distanceTo(b.world);
    const dist = d > 2.5 ? `${Math.round(d)} m` : '';
    if (dist !== b.dist) { b.dist = dist; el.querySelector('small').textContent = dist; }
    el.classList.toggle('far', d > 8);
    const r = b === pointed ? 22 : 15;
    el.style.transform = `translate(${Math.round((_p.x + 1) / 2 * w - r)}px, ${Math.round((1 - _p.y) / 2 * h - r)}px)`;
    el.hidden = false;
  }
}
let pointed = null;
function setPointed(b) { pointed = b; for (const x of beacons) x.el.classList.toggle('pointed', x === b); renderTop(); }

// ---------------------------------------------------------------------------
// El guía
// ---------------------------------------------------------------------------
const G = {
  root: null, mixer: null, acts: {}, W: {}, gesture: 'Idle',
  pos: V(), yaw: 0, speed: 0, maxSpeed: WALK, yawVel: 0, turning: false,
  path: [], arrive: null, following: false, side: 1, sinceMove: 0, outOfView: 0, holdUntil: 0,
  placed: false, busy: false, run: 0, aim: null, focus: null, speaking: false,
};
const has = (n) => !!G.acts[n];
const talkName = () => { const o = ['Talk', 'Talk2', 'Talk3'].filter(has); return o[Math.floor(Math.random() * o.length)] || 'Idle'; };

const modelReady = new GLTFLoader().loadAsync('../assets/fray-guia.glb?v=2').then((gltf) => {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const model = gltf.scene; model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); root.add(model);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.004; sh.renderOrder = -1; root.add(sh);
  const mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) { const a = mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0); G.acts[clip.name] = a; G.W[clip.name] = 0; }
  for (const n of ONCE) if (G.acts[n]) { G.acts[n].setLoop(THREE.LoopOnce, 1); G.acts[n].clampWhenFinished = true; }
  mixer.addEventListener('finished', (e) => { if (G.acts[G.gesture] === e.action) setGesture(G.speaking ? talkName() : 'Idle'); });
  G.W.Idle = 1; G.acts.Idle.setEffectiveWeight(1);
  Object.assign(G, { root, mixer });
  return gltf;
});

function setGesture(name) {
  if (!has(name)) name = 'Idle';
  if (G.gesture === name && !ONCE.includes(name)) return;
  const a = G.acts[name];
  if (ONCE.includes(name) || G.W[name] < 0.05) a.reset().play();
  G.gesture = name;
}
// Mezcla de animaciones: andar según la velocidad; el resto del peso, para el gesto actual.
// Todos los pesos se acercan a su objetivo al mismo ritmo, así siempre suman 1 y el esqueleto no cae a la pose de reposo.
function blend(dt) {
  const walkW = clamp(G.speed / 0.3, 0, 1);
  const stepW = G.speed < 0.08 ? clamp(Math.abs(G.yawVel) / 2.5, 0, 0.6) : 0; // pasitos al girar en el sitio
  const lw = Math.max(walkW, stepW);
  const k = Math.min(1, dt * 8);
  for (const n in G.acts) {
    const target = n === 'Walk' ? lw : (n === G.gesture ? 1 - lw : 0);
    G.W[n] += (target - G.W[n]) * k;
    G.acts[n].setEffectiveWeight(G.W[n]);
  }
  if (G.acts.Walk) G.acts.Walk.setEffectiveTimeScale(G.speed > 0.08 ? clamp(G.speed / WALK, 0.5, 1.8) : 0.7);
}

function walkTo(points, speed = WALK, following = false) {
  if (G.arrive) { const r = G.arrive; G.arrive = null; r(false); }
  G.path = points.map((p) => p.clone()); G.maxSpeed = speed; G.following = following;
  return new Promise((res) => { G.arrive = res; });
}
function stopWalking() { G.path = []; G.following = false; if (G.arrive) { const r = G.arrive; G.arrive = null; r(false); } }
function arrived() { G.following = false; G.sinceMove = 0; const r = G.arrive; G.arrive = null; if (r) r(true); }
// Si la línea recta pasa por encima del visitante, rodea por su lado
function pathAround(from, to, u) {
  const ab = V().subVectors(to, from); ab.y = 0; const L2 = ab.lengthSq();
  if (L2 < 1e-4) return [to];
  const t = clamp(V().subVectors(u, from).setY(0).dot(ab) / L2, 0, 1);
  const cl = V().copy(from).addScaledVector(ab, t);
  const off = V().subVectors(cl, u); off.y = 0;
  if (t <= 0.02 || t >= 0.98 || off.length() > 0.6) return [to];
  if (off.lengthSq() < 1e-4) off.set(-ab.z, 0, ab.x);
  off.normalize();
  return [V().copy(u).addScaledVector(off, 0.9).setY(to.y), to];
}
function turn(diff, dt, rate) { const s = clamp(diff, -rate * dt, rate * dt); G.yaw += s; G.yawVel = s / Math.max(dt, 1e-3); }
function desiredYaw() {
  const toU = Math.atan2(U.pos.x - G.pos.x, U.pos.z - G.pos.z);
  if (G.aim !== null) return G.aim;
  if (G.focus) return toU + 0.3 * angleDiff(toU, Math.atan2(G.focus.x - G.pos.x, G.focus.z - G.pos.z));
  return toU;
}
// Señalar con la mano derecha (Point) o con la izquierda (PointLeft, si existe) sin dar la espalda al visitante
function choosePoint(B) {
  const dx = B.x - G.pos.x, dz = B.z - G.pos.z;
  const toU = V(U.pos.x - G.pos.x, 0, U.pos.z - G.pos.z).normalize();
  const opts = [];
  if (has('Point')) opts.push({ gesture: 'Point', yaw: Math.atan2(dz, -dx) });
  if (has('PointLeft')) opts.push({ gesture: 'PointLeft', yaw: Math.atan2(-dz, dx) });
  let best = null, bd = -0.15;
  for (const o of opts) { const d = fwdOf(o.yaw, _a).dot(toU); if (d > bd) { bd = d; best = o; } }
  return best;
}

// Presentar con la mano abierta (PresentR / PresentL, si existen): de cara al visitante, con un leve giro hacia el punto
function choosePresent(B) {
  if (!has('PresentR') && !has('PresentL')) return null;
  const toU = Math.atan2(U.pos.x - G.pos.x, U.pos.z - G.pos.z);
  const toB = Math.atan2(B.x - G.pos.x, B.z - G.pos.z);
  const right = rightOf(fwdOf(toU, _a), _b); // su derecha, mirándote
  let g = V(B.x - G.pos.x, 0, B.z - G.pos.z).dot(right) >= 0 ? 'PresentR' : 'PresentL';
  if (!has(g)) g = has('PresentR') ? 'PresentR' : 'PresentL';
  return { gesture: g, yaw: toU + 0.25 * angleDiff(toU, toB) };
}

function updateGuide(dt) {
  if (!G.placed) return;
  G.yawVel = 0;
  if (G.path.length) {
    const tgt = G.path[0];
    const to = _a.subVectors(tgt, G.pos); to.y = 0;
    const d = to.length(); const last = G.path.length === 1;
    if (d < (last ? 0.12 : 0.35)) { G.path.shift(); if (!G.path.length) arrived(); }
    else {
      const diff = angleDiff(G.yaw, Math.atan2(to.x, to.z));
      turn(diff, dt, 3.2);
      let v = G.maxSpeed * Math.max(0, Math.cos(diff)) ** 3; // si el destino queda detrás, primero se gira
      if (last) v = Math.min(v, 0.18 + d * 0.9);               // frena al llegar
      G.speed += clamp(v - G.speed, -2.2 * dt, 1.3 * dt);
    }
  } else G.speed = Math.max(0, G.speed - 2.2 * dt);
  G.pos.addScaledVector(fwdOf(G.yaw, _b), G.speed * dt);
  G.pos.y += ((floorY ?? U.pos.y - EYE) - G.pos.y) * Math.min(1, dt * 6);
  if (!G.path.length && G.speed < 0.15) {
    const diff = angleDiff(G.yaw, desiredYaw());
    if (G.turning || Math.abs(diff) > (G.busy ? 0.12 : 0.45)) { G.turning = Math.abs(diff) > 0.05; turn(diff, dt, G.busy ? 2.6 : 1.8); }
  } else G.turning = false;
  G.root.position.copy(G.pos); G.root.rotation.y = G.yaw;
}
function guideInView() {
  const p = _p.copy(G.pos).addScaledVector(UP, 1.0);
  if (_a.copy(p).applyMatrix4(camera.matrixWorldInverse).z > -0.1) return false;
  p.project(camera);
  return Math.abs(p.x) < 0.9 && Math.abs(p.y) < 1;
}
// Acompañar: se mantiene delante de ti y un poco a un lado; se mueve solo cuando hace falta
function followTick(dt) {
  if (!G.placed || G.busy) return;
  const r = rightOf(U.fwd, _c);
  const sideNow = Math.sign(_a.subVectors(G.pos, U.floor).dot(r)) || G.side;
  const desired = V().copy(U.floor).addScaledVector(U.fwd, AHEAD).addScaledVector(r, SIDE * sideNow);
  const dU = hdist(G.pos, U.floor), dD = hdist(G.pos, desired);
  G.outOfView = guideInView() ? 0 : G.outOfView + dt;
  if (!G.path.length) {
    G.sinceMove += dt;
    if (performance.now() < G.holdUntil && dU < 4.4 && dU > 0.8) return;
    if (dU > 4.2 || dU < 1.0 || (dD > 1.5 && G.sinceMove > 1.5) || (G.outOfView > 2.5 && dD > 0.8)) {
      G.side = sideNow;
      walkTo(pathAround(G.pos, desired, U.floor), dU > 5 ? 1.15 : WALK, true);
    }
  } else if (G.following) {
    G.path[G.path.length - 1].lerp(desired, Math.min(1, dt * 1.5));
    G.maxSpeed = dU > 5 ? 1.15 : WALK;
  }
}
function maybeSpawn() {
  if (G.placed || !G.root || floorY === null || !audioOK) return;
  G.pos.copy(U.floor).addScaledVector(U.fwd, 2.6).addScaledVector(rightOf(U.fwd, _a), 0.3);
  G.yaw = Math.atan2(U.pos.x - G.pos.x, U.pos.z - G.pos.z);
  G.root.position.copy(G.pos); G.root.rotation.y = G.yaw;
  G.root.visible = true; G.placed = true; G.holdUntil = performance.now() + 2500;
  greet();
}

// ---------------------------------------------------------------------------
// Lo que hace el guía (cada secuencia cancela la anterior)
// ---------------------------------------------------------------------------
const pendingZones = [];
let lastSaid = null, outroDone = false;
function begin() { G.run++; voz.hush(); G.busy = true; G.aim = null; G.focus = null; G.speaking = false; stopWalking(); return G.run; }
const alive = (run) => run === G.run;
function finish(run, holdMs = 3500) {
  if (!alive(run)) return;
  G.busy = false; G.aim = null; G.focus = null; G.speaking = false;
  setGesture('Idle'); setPointed(null);
  G.holdUntil = performance.now() + holdMs;
  hideBubbleSoon(3500);
  if (pendingZones.length) setTimeout(() => { if (!G.busy && pendingZones.length) presentZone(pendingZones.shift()); }, 700);
  else if (!outroDone && beacons.length === TOTAL && beacons.every((b) => b.seen)) { outroDone = true; setTimeout(() => { if (!G.busy) sayAlone(OUTRO); }, 900); }
}
function warnVoice() { toast('La voz de ElevenLabs no responde. Sigo con la voz del móvil.', 4000); }
async function sayLine(text, run, first = null) {
  showBubble(text);
  G.speaking = true;
  await voz.speak(text, {
    onFallback: warnVoice,
    onStart: () => {
      if (!alive(run)) return;
      if (first) setGesture(first);
      else if (!(ONCE.includes(G.gesture) && G.acts[G.gesture].isRunning())) setGesture(talkName());
    },
  });
  if (!alive(run)) return false;
  G.speaking = false;
  if (!ONCE.includes(G.gesture)) setGesture('Idle');
  return true;
}
async function waitFacing(run, maxS) {
  const t0 = performance.now();
  while (alive(run) && performance.now() - t0 < maxS * 1000) {
    if (!G.turning && Math.abs(angleDiff(G.yaw, desiredYaw())) < 0.15) return;
    await wait(50);
  }
}
async function greet() {
  const run = begin();
  INTRO.forEach((l) => voz.prefetch(l));
  setGesture('Greet');
  await wait(900);
  for (const line of INTRO) { if (!(await sayLine(line, run))) return; await wait(250); }
  lastSaid = { text: INTRO.join(' ') };
  finish(run, 1500);
}
async function sayAlone(text) {
  const run = begin();
  if (!(await sayLine(text, run))) return;
  lastSaid = { text };
  finish(run);
}
// Dónde se pone para explicar: delante de ti, a la derecha de la línea que va de ti al punto.
// Así, mirándote, el punto le queda a su derecha y lo señala con la mano derecha.
function explainSpot(B) {
  const dir = V().subVectors(B, U.floor); dir.y = 0;
  let dist = dir.length();
  if (dist < 0.4) { dir.copy(U.fwd); dist = 1.5; } else dir.divideScalar(dist);
  const a = Math.max(0.8, Math.min(clamp(dist - 0.9, 1.3, 2.2), dist - 0.4)); // nunca más allá del punto (ni dentro de la pared)
  return V().copy(U.floor).addScaledVector(dir, a).addScaledVector(rightOf(dir, _a), 0.45);
}
async function goExplain(b, text, markSeen) {
  if (!G.placed) { toast('Espera a que aparezca el guía.'); return; }
  const run = begin();
  closeSheets();
  setPointed(b); hideBubble();
  voz.prefetch(text);
  const B = beaconWorld(b, V());
  const spot = explainSpot(B);
  const wall = _c.subVectors(spot, b.zone.c).dot(b.zone.n); // separación de la pared del vinilo
  if (wall < 0.55) spot.addScaledVector(b.zone.n, 0.55 - wall);
  const far = hdist(G.pos, spot);
  if (far > 0.4) {
    const ok = await walkTo(pathAround(G.pos, spot, U.floor), far > 3 ? 1.0 : WALK);
    if (!ok || !alive(run)) return;
  }
  const p = choosePresent(B) || choosePoint(B);
  if (p) G.aim = p.yaw; else G.focus = B;
  await waitFacing(run, 1.5);
  if (!alive(run)) return;
  if (!(await sayLine(text, run, p ? p.gesture : null))) return;
  if (markSeen) b.seen = true;
  b.el.classList.toggle('seen', b.seen);
  lastSaid = { text, b };
  $('#bubble-more').hidden = !b.photo;
  finish(run, 4000);
}
function explain(b) { if (b) goExplain(b, b.say, true); }
function presentZone(zone) {
  const vb = zone.objs.find((b) => b.atVinyl) || zone.objs[0];
  goExplain(vb, zone.intro, false);
}
function onZoneFound(zone) {
  renderTop();
  if (!G.placed || G.busy) { pendingZones.push(zone); return; }
  presentZone(zone);
}
async function callGuide() {
  if (!G.placed) { toast('Espera a que aparezca el guía.'); return; }
  const run = begin();
  const spot = V().copy(U.floor).addScaledVector(U.fwd, 2.2).addScaledVector(rightOf(U.fwd, _a), 0.3 * G.side);
  const d = hdist(G.pos, spot);
  if (d > 0.3) { const ok = await walkTo(pathAround(G.pos, spot, U.floor), d > 3 ? 1.1 : WALK); if (!ok || !alive(run)) return; }
  await waitFacing(run, 1.2);
  if (has('Beckon') && alive(run)) setGesture('Beckon');
  finish(run, 6000);
}

// ---------------------------------------------------------------------------
// Hablar con el guía
// ---------------------------------------------------------------------------
let recH = null;
$('#sugg').innerHTML = SUGG.map((q) => `<button type="button"><span>↳</span>${q}</button>`).join('');
$('#sugg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) answer(b.textContent.replace('↳', '').trim()); });
$('#ask-form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#ask-input').value.trim(); if (v) answer(v); });
$('#talk-x').addEventListener('click', () => { closeTalk(); finish(G.run); });
$('#talk-state').addEventListener('click', () => { if (!recH && voz.canRecord()) listen(G.run); });
$('#btn-talk').addEventListener('click', openTalk);
function setTalkState(cls, label) {
  const t = $('#talk'); t.classList.toggle('listening', cls === 'listening'); t.classList.toggle('thinking', cls === 'thinking');
  $('#talk-label').textContent = label;
}
function openTalk() {
  if (!G.placed) { toast('Espera a que aparezca el guía.'); return; }
  const run = begin();
  setGesture(has('Listen') ? 'Listen' : 'Idle');
  closeSheets(); hideBubble();
  $('#talk').hidden = false; $('#dock').hidden = true; renderChip();
  $('#you').textContent = 'Pregúntale lo que quieras sobre la oficina.'; $('#you').classList.add('dim'); $('#ask-input').value = '';
  if (voz.canRecord()) listen(run); else setTalkState('', 'Elige o escribe una pregunta');
}
async function listen(run) {
  setTalkState('listening', 'Te escucho');
  try {
    recH = await voz.record();
    const h = recH; const blob = await h.done; const heard = h.heard(); recH = null;
    if (!alive(run) || $('#talk').hidden) return;
    if (!blob || !heard || blob.size < 1500) { setTalkState('', 'Toca para hablar'); $('#you').textContent = 'No te he oído. Toca para hablar o elige una pregunta.'; return; }
    setTalkState('thinking', 'Te he oído…');
    const text = await voz.transcribe(blob);
    if (!alive(run) || $('#talk').hidden) return;
    if (!text) { setTalkState('', 'Toca para hablar'); $('#you').textContent = 'No te he entendido. Prueba otra vez o elige una pregunta.'; return; }
    $('#you').textContent = text; $('#you').classList.remove('dim');
    await wait(400);
    if (alive(run) && !$('#talk').hidden) answer(text);
  } catch (e) {
    console.warn(e); recH = null;
    setTalkState('', 'Toca para hablar');
    $('#you').textContent = /NotAllowed|denied|Permission/i.test(String(e && (e.name || e.message)))
      ? 'No tengo permiso para el micrófono. Elige una pregunta o escríbela.'
      : 'No he podido usar el micrófono aquí. Elige una pregunta o escríbela.';
  }
}
function closeTalk() {
  if (recH) { recH.cancel(); recH = null; }
  $('#talk').hidden = true; setTalkState('', 'Te escucho'); $('#dock').hidden = false;
}
function nearestZone() {
  let best = null, bd = 6;
  for (const z of zones) if (z.placed) { const d = hdist(z.c, U.pos); if (d < bd) { bd = d; best = z; } }
  return best;
}
function nextHint() {
  const z = zones.find((x) => !x.placed);
  if (z) return `Busca el vinilo «${z.vinyl.label}», ${z.vinyl.where}.`;
  const b = beacons.find((x) => !x.seen);
  if (b) return `Te queda por ver ${b.name.toLowerCase()}, en la zona «${b.zone.title}». Toca su punto y voy.`;
  return 'Ya has visto toda la oficina. Puedes preguntarme lo que quieras.';
}
function localAnswer(q) {
  const nq = norm(q);
  if (/\b(donde|siguiente|adonde|voy|ahora que)\b/.test(nq) && !/cafe|planta|sofa/.test(nq)) return nextHint();
  const hit = QA.find((x) => x.k.some((k) => nq.includes(norm(k))));
  return hit ? hit.a : FALLBACK;
}
async function answer(q) {
  closeTalk();
  const run = G.run; G.busy = true;
  setGesture(has('Think') ? 'Think' : (has('Listen') ? 'Listen' : 'Idle'));
  showBubble('…');
  let used = false;
  if (voz.hasServer()) {
    // La voz va frase a frase: cada frase se pide en cuanto llega y suena en orden.
    const queue = []; let closed = false, wake = null;
    const player = (async () => {
      let i = 0;
      for (;;) {
        if (!alive(run)) return;
        if (i < queue.length) {
          G.speaking = true;
          await voz.speak(queue[i++], { onFallback: warnVoice, onStart: () => { if (alive(run) && !/^Talk/.test(G.gesture)) setGesture(talkName()); } });
          continue;
        }
        if (closed) return;
        await new Promise((r) => { wake = r; });
      }
    })();
    const push = (s) => { voz.prefetch(s); queue.push(s); if (wake) { const w = wake; wake = null; w(); } };
    try {
      const zone = nearestZone();
      const r = await voz.ask(q, { zone: zone ? zone.title : '', onSentence: push, onText: (t) => { if (alive(run) && t) showBubble(t); } });
      if (r && r.refused) { const t = 'Prefiero no responder a eso. Pregúntame por la visita.'; showBubble(t); push(t); }
      used = !!r || queue.length > 0;
    } catch (e) {
      console.warn(e);
      used = queue.length > 0;
      if (!used) toast('Ahora no puedo pensar la respuesta. Te digo lo que tengo preparado.', 3500);
    }
    closed = true; if (wake) { const w = wake; wake = null; w(); }
    await player;
  }
  if (!alive(run)) return;
  if (!used) { const a = localAnswer(q); if (!(await sayLine(a, run))) return; lastSaid = { text: a }; }
  finish(run, 4000);
}

// ---------------------------------------------------------------------------
// Interfaz
// ---------------------------------------------------------------------------
let bubbleT = 0;
function showBubble(text) { clearTimeout(bubbleT); $('#line').textContent = text; $('#bubble').hidden = false; $('#bubble-more').hidden = true; renderChip(); }
function hideBubble() { clearTimeout(bubbleT); $('#bubble').hidden = true; renderChip(); }
function hideBubbleSoon(ms) { clearTimeout(bubbleT); bubbleT = setTimeout(() => { if (!G.speaking) hideBubble(); }, ms); }
function closeSheets() { $('#card').hidden = true; $('#place').hidden = true; if (!$('#talk').hidden) closeTalk(); $('#dock').hidden = false; }
function renderTop() {
  const nz = zones.filter((z) => z.placed).length;
  const seen = beacons.filter((b) => b.seen).length;
  const z = nearestZone();
  $('#title').textContent = z ? z.title : 'Visita por la oficina';
  $('#sub').textContent = nz ? `${nz} de ${zones.length} zonas encontradas` : 'Busca un vinilo';
  const all = zones.flatMap((zz) => zz.beacons.map((d) => beacons.find((b) => b.id === d.id)));
  $('#segs').innerHTML = all.map((b) => `<i class="${b && b.seen ? 'done' : (b && b === pointed ? 'now' : '')}"></i>`).join('');
  $('#cnt').textContent = `${seen}/${TOTAL}`;
}
let chipKey = '';
function renderChip() {
  const sheet = !$('#talk').hidden || !$('#card').hidden || !$('#place').hidden;
  let t = '', s = '', thumbs = [], btns = false;
  if (placing) {
    t = `Coloca «${placing.vinyl.label}»`;
    s = 'Ponte delante del vinilo y apunta el círculo al suelo, pegado a la pared, justo debajo de su centro.';
    btns = true;
  } else if (sheet || !$('#bubble').hidden) {
    t = '';
  } else if (!audioOK && xr.session) {
    t = 'Toca la pantalla para empezar'; s = 'Así el guía podrá hablarte.';
  } else if (floorY === null || !G.placed) {
    t = 'Buscando el suelo'; s = 'Mueve el móvil despacio, apuntando al suelo, hasta que aparezca el guía.';
  } else if (!zones.some((z) => z.placed)) {
    t = 'Apunta a un vinilo de la pared';
    s = xr.imageAPI === false ? 'Este móvil no reconoce los vinilos: colócalos a mano con el botón de la diana, arriba.' : 'Ponte a 2 o 3 metros, con el vinilo entero en la pantalla.';
    thumbs = zones;
  } else if (!beacons.some((b) => b.seen) && !G.busy) {
    t = 'Toca un punto'; s = 'El guía se pondrá delante de ti para explicártelo.';
  } else if (!G.busy && zones.some((z) => !z.placed)) {
    const z = zones.find((x) => !x.placed);
    t = 'Siguiente zona'; s = `Busca el vinilo «${z.vinyl.label}», ${z.vinyl.where}.`;
  }
  const key = [t, s, thumbs.map((z) => z.id).join(), btns].join('|');
  if (key === chipKey) return;
  chipKey = key;
  const chip = $('#chip');
  chip.hidden = !t; chip.classList.toggle('placing', btns);
  $('#chip-t').textContent = t; $('#chip-s').textContent = s;
  $('#chip-thumbs').innerHTML = thumbs.map((z) => `<figure><img src="${z.vinyl.img}" alt="Vinilo ${z.vinyl.label}"><figcaption>${z.title}</figcaption></figure>`).join('');
  $('#chip-btns').hidden = !btns;
  $('#dock').hidden = btns || sheet;
}

// Ficha
let cardB = null;
function openCard(b) {
  cardB = b; closeSheets(); hideBubble();
  $('#card-img').src = b.photo; $('#card-img').alt = b.name;
  $('#card-over').textContent = b.over || b.zone.title; $('#card-title').textContent = b.name; $('#card-text').textContent = b.text;
  $('#card').hidden = false; $('#dock').hidden = true; renderChip();
}
$('#bubble-more').addEventListener('click', () => { if (lastSaid && lastSaid.b) openCard(lastSaid.b); });
$('#card-x').addEventListener('click', () => { $('#card').hidden = true; $('#dock').hidden = false; renderChip(); });
$('#card-explain').addEventListener('click', () => { $('#card').hidden = true; $('#dock').hidden = false; explain(cardB); });

// Dock
$('#btn-call').addEventListener('click', callGuide);
$('#btn-repeat').addEventListener('click', () => {
  if (!lastSaid) { toast('Todavía no te he contado nada.'); return; }
  if (lastSaid.b) goExplain(lastSaid.b, lastSaid.text, true); else sayAlone(lastSaid.text);
});

// Colocar zonas a mano
let placing = null;
function renderPlace() {
  $('#zone-list').innerHTML = zones.map((z, i) => {
    const st = z.source === 'image' ? 'Reconocida' : z.source === 'manual' ? 'Colocada' : 'Sin colocar';
    return `<button type="button" data-i="${i}"><img src="${z.vinyl.img}" alt=""><span><b>${z.title}</b><small>Vinilo «${z.vinyl.label}», ${z.vinyl.where}</small></span><span class="st ${z.placed ? 'ok' : ''}">${st}</span></button>`;
  }).join('');
}
$('#btn-place').addEventListener('click', () => { closeSheets(); renderPlace(); $('#place').hidden = false; $('#dock').hidden = true; renderChip(); });
$('#place-x').addEventListener('click', () => { $('#place').hidden = true; $('#dock').hidden = false; renderChip(); });
$('#zone-list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]'); if (!b) return;
  placing = zones[+b.dataset.i]; $('#place').hidden = true; renderChip();
});
$('#chip-cancel').addEventListener('click', () => { placing = null; renderChip(); });
$('#chip-here').addEventListener('click', () => {
  const z = placing;
  if (!z || !placeManual(z)) { toast('Apunta el círculo al suelo, delante de ti.'); return; }
  placing = null; renderChip(); toast(`Zona «${z.title}» colocada.`);
});
$('#btn-exit').addEventListener('click', () => { if (xr.session) xr.session.end(); else location.href = './'; });
document.querySelectorAll('#overlay .ui').forEach(noXRSelect);

// ---------------------------------------------------------------------------
// WebXR
// ---------------------------------------------------------------------------
const xr = { session: null, hit: null, dom: false, imageAPI: null, imgStates: [] };
let bitmaps = null;
const bitmapsReady = Promise.all(ZONES.map((z) => fetch(z.vinyl.target).then((r) => r.blob()).then((b) => createImageBitmap(b))))
  .then((bs) => { bitmaps = bs; }).catch((e) => { console.warn('vinilos', e); });
const raycaster = new THREE.Raycaster();
function tapRay(o, d) {
  raycaster.set(o, d); raycaster.camera = camera;
  const hits = raycaster.intersectObjects(beacons.map((b) => b.proxy), false);
  if (hits.length) explain(hits[0].object.userData.b);
}
function onSelect(e) {
  if (placing || performance.now() - lastUiTouch < 450) return;
  const pose = e.frame.getPose(e.inputSource.targetRaySpace, renderer.xr.getReferenceSpace());
  if (!pose) return;
  _m.fromArray(pose.transform.matrix);
  tapRay(V().setFromMatrixPosition(_m), V(0, 0, -1).transformDirection(_m));
}
let starting = false;
// granted = la sesión la ha concedido Needle Go al abrir la página (sin toque del visitante)
async function startXR({ granted = false } = {}) {
  if (starting || xr.session) return;
  starting = true;
  const st = $('#start-status');
  if (!granted) unlockOnce();
  st.className = 'status'; st.textContent = 'Abriendo la cámara…';
  // Todo opcional, como hace Needle: si se exige algo que el navegador no tiene, la sesión no arranca
  const opts = { optionalFeatures: ['hit-test', 'dom-overlay', 'image-tracking', 'plane-detection', 'local-floor'], domOverlay: { root: $('#overlay') } };
  if (granted && !bitmaps) await Promise.race([bitmapsReady, wait(2500)]);
  if (bitmaps) { opts.trackedImages = trackedList(); xr.imgBase = 0; }
  let session;
  try { session = await navigator.xr.requestSession('immersive-ar', opts); }
  catch (e) {
    console.warn(e);
    try { session = await navigator.xr.requestSession('immersive-ar', { optionalFeatures: ['hit-test', 'dom-overlay'], domOverlay: opts.domOverlay }); xr.imgBase = null; }
    catch (e2) {
      console.error(e2); starting = false;
      st.className = 'status err'; st.textContent = 'No se ha podido abrir la RA. Comprueba el permiso de la cámara y vuelve a intentarlo.';
      $('#btn-start').disabled = false; $('#btn-start').textContent = 'Empezar';
      return;
    }
  }
  xr.session = session; starting = false;
  document.documentElement.classList.add('in-xr');
  $('#overlay').hidden = false; $('#start').hidden = true;
  session.addEventListener('end', () => location.reload());
  session.addEventListener('select', onSelect);
  await renderer.xr.setSession(session);
  // Needle Go pinta la RA a través del propio canvas: su tamaño en píxeles es la resolución de la RA
  if (IN_APPCLIP) requestAnimationFrame(() => {
    const dpr = Math.min(2, devicePixelRatio || 1); const c = renderer.domElement;
    c.width = Math.floor(innerWidth * dpr); c.height = Math.floor(innerHeight * dpr);
    c.style.width = '100vw'; c.style.height = '100vh';
  });
  // Si la sesión se abrió antes de tener los vinilos, Needle Go deja añadirlos en marcha
  if (xr.imgBase === undefined || xr.imgBase === null) {
    bitmapsReady.then(() => {
      if (!bitmaps || xr.session !== session) return;
      const reg = session.nonStandard_registerTrackedImages;
      if (typeof reg === 'function') { const base = reg.call(session, trackedList()); if (base >= 0) xr.imgBase = base; }
    }).catch(() => {});
  }
  try { const viewer = await session.requestReferenceSpace('viewer'); xr.hit = await session.requestHitTestSource({ space: viewer }); }
  catch (e) { console.warn('hit-test', e); xr.hit = null; toast('Este navegador no detecta el suelo. El guía aparecerá a una altura aproximada.', 4500); }
  xr.dom = !!session.domOverlayState || IN_APPCLIP; // en el App Clip la página entera se ve sobre la cámara
  if (typeof session.getTrackedImageScores === 'function' && xr.imgBase === 0) {
    session.getTrackedImageScores().then((s) => {
      xr.scores = s;
      const bad = s.map((x, i) => (x === 'untrackable' ? ZONES[i].vinyl.label : null)).filter(Boolean);
      if (bad.length) toast(`No puedo reconocer: ${bad.join(', ')}. Coloca esas zonas a mano.`, 5000);
    }).catch(() => {});
  }
  setTimeout(() => { if (floorY === null && !xr.hit) addFloorSample(U.pos.y - EYE); }, 4000);
  started();
}
const trackedList = () => bitmaps.map((image, i) => ({ image, widthInMeters: ZONES[i].vinyl.widthM }));
function xrFrame(frame) {
  const ref = renderer.xr.getReferenceSpace();
  reticleOK = false;
  if (xr.hit) {
    const hits = frame.getHitTestResults(xr.hit);
    if (hits.length) {
      const pose = hits[0].getPose(ref);
      if (pose) {
        const m = pose.transform.matrix;
        reticle.matrix.fromArray(m);
        reticlePos.set(m[12], m[13], m[14]);
        const flat = m[5] > 0.85; // la normal de la superficie apunta hacia arriba
        if (flat && U.pos.y - m[13] > 0.95) addFloorSample(m[13]);
        reticleOK = flat;
      }
    }
  }
  if (typeof frame.getImageTrackingResults === 'function') {
    xr.imageAPI = true;
    for (const r of frame.getImageTrackingResults()) {
      const i = r.index - (xr.imgBase || 0);
      xr.imgStates[i] = r.trackingState;
      if (r.trackingState !== 'tracked') continue;
      const pose = frame.getPose(r.imageSpace, ref);
      if (pose && zones[i]) onImageMatrix(zones[i], pose.transform.matrix);
    }
  } else if (xr.imageAPI === null) {
    xr.imageAPI = false;
    toast('Este móvil no reconoce los vinilos. Coloca cada zona a mano con el botón de la diana.', 5000);
  }
}

// ---------------------------------------------------------------------------
// Simulación en el ordenador (?sim): una sala vacía con los tres vinilos en las paredes
// ---------------------------------------------------------------------------
const SIM_LAYOUT = {
  bienvenida: { c: V(0, 1.63, -4.2), n: V(0, 0, 1) },
  planta: { c: V(-4.2, 1.69, 0.5), n: V(1, 0, 0) },
  cafe: { c: V(4.2, 1.52, 0.5), n: V(-1, 0, 0) },
};
const sim = { yaw: 0, pitch: -0.15, keys: new Set(), t: 0 };
function buildSimRoom() {
  scene.background = new THREE.Color(0x24262a);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 9.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a5d62, roughness: 0.95 }));
  floor.position.set(0, 0, 0.5); scene.add(floor);
  const grid = new THREE.GridHelper(8.4, 14, 0x777b82, 0x6a6e74); grid.position.set(0, 0.002, 0.5); scene.add(grid);
  const wallM = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 1 });
  const wall = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.5), wallM); m.position.set(x, 1.25, z); m.rotation.y = ry; scene.add(m); };
  wall(8.4, 0, -4.2, 0); wall(9.4, -4.2, 0.5, Math.PI / 2); wall(9.4, 4.2, 0.5, -Math.PI / 2);
  const tl = new THREE.TextureLoader();
  for (const z of zones) {
    const L = SIM_LAYOUT[z.id];
    tl.load(z.vinyl.target, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const h = z.vinyl.widthM * tex.image.height / tex.image.width;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(z.vinyl.widthM, h), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.copy(L.c).addScaledVector(L.n, 0.01); m.lookAt(V().copy(m.position).add(L.n)); scene.add(m);
    });
  }
  const cv = renderer.domElement; let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, yaw: sim.yaw, pitch: sim.pitch, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 6) down.moved = true;
    sim.yaw = down.yaw - dx * 0.005; sim.pitch = clamp(down.pitch - dy * 0.005, -1.2, 0.8);
  });
  cv.addEventListener('pointerup', (e) => {
    if (down && !down.moved) {
      raycaster.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
      tapRay(raycaster.ray.origin.clone(), raycaster.ray.direction.clone());
    }
    down = null;
  });
  addEventListener('keydown', (e) => { if (e.target.closest && e.target.closest('input')) return; sim.keys.add(e.key.toLowerCase()); });
  addEventListener('keyup', (e) => sim.keys.delete(e.key.toLowerCase()));
}
function simControls(dt) {
  const k = sim.keys, f = fwdOf(sim.yaw + Math.PI, _a), r = rightOf(f, _b);
  const mv = V();
  if (k.has('w') || k.has('arrowup')) mv.add(f);
  if (k.has('s') || k.has('arrowdown')) mv.sub(f);
  if (k.has('d') || k.has('arrowright')) mv.add(r);
  if (k.has('a') || k.has('arrowleft')) mv.sub(r);
  if (mv.lengthSq()) camera.position.addScaledVector(mv.normalize(), 1.2 * dt);
  camera.position.y = EYE;
  camera.rotation.set(sim.pitch, sim.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
}
function simFrame(dt) {
  sim.t += dt;
  const o = U.pos, d = _a.set(0, 0, -1).applyQuaternion(camera.quaternion);
  reticleOK = false;
  if (d.y < -0.05) {
    const t = -o.y / d.y;
    if (t < 12) { reticlePos.copy(o).addScaledVector(d, t); reticlePos.y = 0; reticle.matrix.makeTranslation(reticlePos.x, 0.002, reticlePos.z); reticleOK = true; if (sim.t > 0.8) addFloorSample(0); }
  }
  if (sim.t > 2.5 && floorY === null) addFloorSample(0);
  // Reconocimiento simulado: vinilo a menos de 5,5 m, delante y casi en el centro de la pantalla
  for (const z of zones) {
    const L = SIM_LAYOUT[z.id];
    const to = _b.subVectors(L.c, o); const dist = to.length(); if (dist > 5.5) continue; to.normalize();
    if (d.dot(to) < Math.cos(0.38) || L.n.dot(to) > -0.3) continue;
    onImagePose(z, L.c.clone(), [V().crossVectors(UP, L.n), L.n.clone(), V(0, -1, 0)]);
  }
}
function startSim() {
  unlockOnce();
  buildSimRoom();
  camera.position.set(0.3, EYE, 2.6); sim.yaw = 0; sim.pitch = -0.32;
  simControls(0);
  xr.dom = true; xr.imageAPI = true;
  $('#overlay').hidden = false; $('#start').hidden = true;
  started();
}

// ---------------------------------------------------------------------------
// Bucle
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let uiT = 0, dbgT = 0, frames = 0;
function loop(t, frame) {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (frame) renderer.xr.updateCamera(camera); else if (SIM) simControls(dt);
  updateUser();
  if (frame) xrFrame(frame); else if (SIM) simFrame(dt);
  maybeSpawn();
  updateGuide(dt); followTick(dt);
  if (G.mixer) { blend(dt); G.mixer.update(dt); }
  updateBeacons(t);
  reticle.visible = reticleOK && (!!placing || !G.placed);
  renderer.render(scene, camera);
  updateLabels();
  frames++; uiT += dt; dbgT += dt;
  if (uiT > 0.25) {
    uiT = 0; renderChip();
    const here = $('#chip-here'); if (here.disabled === reticleOK) here.disabled = !reticleOK;
  }
  if (DEBUG && dbgT > 0.5) {
    const fps = Math.round(frames / dbgT); frames = 0; dbgT = 0;
    $('#debug').hidden = false;
    $('#debug').textContent = [
      `${IN_APPCLIP ? 'Needle Go · ' : ''}${fps} fps · suelo ${floorY === null ? '—' : floorY.toFixed(2)} · capa DOM ${xr.dom ? 'sí' : 'no'} · imágenes ${xr.imageAPI === null ? '?' : xr.imageAPI ? 'sí' : 'no'} ${xr.imgStates.join(',')}`,
      `zonas ${zones.map((z) => `${z.id}:${z.source || '-'}`).join(' ')}`,
      `guía ${G.placed ? `${G.gesture} v=${G.speed.toFixed(2)} a ${hdist(G.pos, U.floor).toFixed(1)} m${G.busy ? ' ocupado' : ''}${G.following ? ' siguiendo' : ''}` : 'sin colocar'} · voz ${voz.hasServer() ? 'servidor' : 'móvil'}${voz.lastError ? ' (error)' : ''}`,
    ].join('\n');
  }
}
function started() {
  renderer.setAnimationLoop(loop);
  renderTop(); renderChip();
  if (!voz.hasServer()) toast('Sin servidor: el guía usa la voz del móvil y respuestas preparadas.', 4000);
}

// ---------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------
$('#start-thumbs').innerHTML = ZONES.map((z) => `<figure><img src="${z.vinyl.img}" alt="Vinilo ${z.vinyl.label}"><figcaption>${z.title}<br>${z.vinyl.where}</figcaption></figure>`).join('');
(async function initStart() {
  const btn = $('#btn-start'), st = $('#start-status');
  modelReady.catch(() => { st.className = 'status err'; st.textContent = 'No se ha podido cargar el guía 3D.'; });
  if (SIM) {
    $('#link-sim').hidden = true;
    $('#start-lead').textContent = 'Simulación de la visita en una sala vacía. Muévete con las flechas o W A S D, arrastra para mirar y haz clic en un punto para que el guía te lo explique. Los vinilos se reconocen al mirarlos de frente.';
    await modelReady; btn.disabled = false; btn.textContent = 'Empezar la simulación'; btn.onclick = startSim;
    return;
  }
  if (IN_APPCLIP) {
    $('#link-sim').hidden = true;
    btn.textContent = 'Abriendo la cámara…';
    const go = () => startXR({ granted: true });
    if (window.__og.granted) go(); else document.addEventListener('og-granted', go, { once: true });
    // Si Needle Go no concede la sesión por su cuenta, se arranca con un toque
    setTimeout(() => { if (!xr.session && !starting) { btn.disabled = false; btn.textContent = 'Empezar'; btn.onclick = () => startXR(); } }, 4000);
    return;
  }
  const xrOK = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  if (xrOK) {
    $('#link-sim').hidden = true;
    if (window.__og && window.__og.granted) { startXR({ granted: true }); return; }
    document.addEventListener('og-granted', () => startXR({ granted: true }), { once: true });
    await Promise.all([modelReady, bitmapsReady]);
    btn.disabled = false; btn.textContent = 'Empezar'; btn.onclick = () => startXR();
  } else if (IOS) {
    btn.hidden = true; $('#link-sim').hidden = true; $('#tip-ios').hidden = false;
    const a = $('#btn-appclip'); a.hidden = false; a.href = APPCLIP;
  } else {
    btn.hidden = true;
    st.textContent = 'Este navegador no tiene RA con seguimiento espacial. Ábrelo en un iPhone (se abre en Needle Go) o en Chrome para Android.';
  }
})();

// Para las pruebas automáticas de la simulación
if (SIM) {
  window.og = {
    G, zones, beacons, U,
    setCam(x, z, yawDeg, pitchDeg = -15) { camera.position.set(x, EYE, z); sim.yaw = THREE.MathUtils.degToRad(yawDeg); sim.pitch = THREE.MathUtils.degToRad(pitchDeg); },
    tap(id) { explain(beacons.find((b) => b.id === id)); },
    state: () => ({
      floorY, guide: { placed: G.placed, x: +G.pos.x.toFixed(2), z: +G.pos.z.toFixed(2), yaw: +G.yaw.toFixed(2), gesture: G.gesture, speed: +G.speed.toFixed(2), busy: G.busy, following: G.following, dUser: +hdist(G.pos, U.floor).toFixed(2), inView: guideInView() },
      user: { x: +U.pos.x.toFixed(2), z: +U.pos.z.toFixed(2) },
      zones: zones.map((z) => `${z.id}:${z.source || '-'}`), seen: beacons.filter((b) => b.seen).map((b) => b.id),
      bubble: $('#bubble').hidden ? '' : $('#line').textContent, chip: $('#chip').hidden ? '' : $('#chip-t').textContent,
    }),
  };
}
