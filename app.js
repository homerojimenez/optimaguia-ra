// OptimaGuía · prototipo de RA web (iPhone, Safari).
// Reconoce tres vinilos de la oficina con MindAR y coloca encima al guía 3D animado (three.js).
import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (s) => document.querySelector(s);
const DEBUG = new URLSearchParams(location.search).has('debug');

// ---------------------------------------------------------------------------
// Escenas. Posiciones en metros respecto al centro de cada vinilo, mirando a la pared:
// x hacia la derecha, y = altura sobre el suelo, z = distancia desde la pared hacia el visitante.
// Los anchos de los vinilos salen de las medidas de Homero; las demás posiciones se afinan con «Ajustar».
// ---------------------------------------------------------------------------
const SCENES = [
  {
    id: 'bienvenida', target: 0, title: 'Bienvenida', sub: 'Rincón del sofá',
    vinyl: { label: 'more soul', where: 'junto al sofá', img: 'assets/vinilos/more-soul.jpg', widthM: 1.357, centerM: 1.63 },
    guide: { x: 0.45, z: 0.75 },
    points: [
      { id: 'lema1', hidden: true, x: 0, y: 1.63, z: 0 },
      { id: 'sofa', name: 'El sofá', x: 2.0, y: 0.6, z: -0.4, photo: 'assets/fotos/sofa.jpg', over: 'Rincón del sofá',
        text: 'El rincón del sofá, junto a la pared de pizarra y la alfombra naranja. Un buen sitio para esperar.',
        say: 'Este es el rincón del sofá, junto a la pared de pizarra. Un buen sitio para esperar.' },
    ],
    lines: [
      { anim: 'Greet', text: 'Hola, bienvenido a Óptima Cultura. Soy tu guía.' },
      { text: 'Hoy probamos aquí, en la oficina de Madrid, la audioguía de la basílica de San Juan de Dios.' },
      { at: 'lema1', text: 'Este es el lema de la casa: más alma, más belleza, más cultura.' },
      { at: 'sofa', text: 'A mi lado tienes el rincón del sofá. Toca su etiqueta para verlo de cerca.' },
      { text: 'Cuando quieras, ve a la sala de reuniones. Allí te espero, junto a la planta.' },
    ],
  },
  {
    id: 'planta', target: 1, title: 'La planta', sub: 'Sala de reuniones',
    vinyl: { label: 'meetings that matter', where: 'en la sala de reuniones', img: 'assets/vinilos/meetings.jpg', widthM: 2.149, centerM: 1.69 },
    guide: { x: -0.2, z: 1.0 },
    points: [
      { id: 'lema2', hidden: true, x: 0, y: 1.69, z: 0 },
      { id: 'planta', name: 'La planta', x: -1.3, y: 0.9, z: 2.3, photo: 'assets/fotos/planta.jpg', over: 'Sala de reuniones',
        text: 'Es una planta muy bonita.', say: 'Es una planta muy bonita. Fíjate en sus hojas.' },
    ],
    lines: [
      { text: 'Ya estás en la sala de reuniones.' },
      { at: 'planta', text: 'Mira esta planta. Es una planta muy bonita.' },
      { at: 'lema2', text: 'Y fíjate en la pared: reuniones que importen... o que podrían haber sido un correo.' },
      { text: 'Si quieres preguntarme algo, pulsa «Habla con el guía». Después, pásate por la zona del café.' },
    ],
  },
  {
    id: 'cafe', target: 2, title: 'El café', sub: 'Zona de la cafetera',
    vinyl: { label: 'not cultured yet?', where: 'en la zona del café', img: 'assets/vinilos/cultured.jpg', widthM: 1.881, centerM: 1.52 },
    guide: { x: -0.4, z: 0.8 },
    points: [
      { id: 'lema3', hidden: true, x: 0, y: 1.52, z: 0 },
      { id: 'cafetera', name: 'La cafetera', x: 1.5, y: 1.2, z: 0.35, photo: 'assets/fotos/cafetera.jpg', over: 'Zona del café',
        text: 'Hace un café muy rico.', say: 'Esta es la cafetera. Hace un café muy rico.' },
    ],
    lines: [
      { text: 'Esta es la zona del café.' },
      { at: 'cafetera', text: 'La cafetera hace un café muy rico. Toca su etiqueta para verla de cerca.' },
      { at: 'lema3', text: 'Y en la pared, una pregunta: ¿todavía sin cultura?' },
      { text: 'Gracias por probar la visita. Puedes volver a cualquier vinilo cuando quieras.' },
    ],
  },
];

const QA = [
  { k: ['quien eres', 'como te llamas', 'eres tu', 'quien es'], a: 'Soy el guía de OptimaGuía. En la basílica de San Juan de Dios te contaré su historia. Hoy estamos de prueba en la oficina.' },
  { k: ['planta', 'hojas', 'verde'], a: 'Es una planta muy bonita. Está en la sala de reuniones, junto al vinilo «meetings that matter».' },
  { k: ['cafe', 'cafetera'], a: 'La cafetera está en la zona del café, junto al vinilo «not cultured yet?». Hace un café muy rico.' },
  { k: ['sofa', 'sentar', 'descansar'], a: 'El sofá está en el rincón de la pared de pizarra, junto al vinilo «more soul».' },
  { k: ['donde', 'siguiente', 'adonde', 'ahora que', 'voy'], a: () => nextHintText() },
  { k: ['optima', 'oficina', 'empresa'], a: 'Estás en la oficina de Óptima Cultura en Madrid. Su lema está en la pared: más alma, más belleza, más cultura.' },
  { k: ['basilica', 'granada', 'san juan'], a: 'La basílica de San Juan de Dios está en Granada. Esta prueba es para su audioguía.' },
];
const SUGG = ['¿Quién eres?', '¿Qué tiene de especial la planta?', '¿Dónde está el café?', '¿Adónde voy ahora?'];
const FALLBACK = 'Eso todavía no lo sé. En la visita real responderé con la información del monumento.';

// ---------------------------------------------------------------------------
// Ajustes guardados en este móvil (modo «Ajustar»)
// ---------------------------------------------------------------------------
const LSK = 'og-ra-ajustes-v1';
const DEFAULTS = JSON.parse(JSON.stringify(SCENES.map((s) => ({ id: s.id, guide: s.guide, vinyl: { widthM: s.vinyl.widthM, centerM: s.vinyl.centerM }, points: s.points.map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z })) }))));
function loadAdj() { try { return JSON.parse(localStorage.getItem(LSK)) || {}; } catch (e) { return {}; } }
function saveAdj() {
  const out = {};
  for (const s of SCENES) out[s.id] = { guide: { ...s.guide }, vinyl: { widthM: s.vinyl.widthM, centerM: s.vinyl.centerM }, points: Object.fromEntries(s.points.map((p) => [p.id, { x: p.x, y: p.y, z: p.z }])) };
  try { localStorage.setItem(LSK, JSON.stringify(out)); } catch (e) { /* sin almacenamiento */ }
  return out;
}
(function applyAdj() {
  const adj = loadAdj();
  for (const s of SCENES) {
    const a = adj[s.id]; if (!a) continue;
    if (a.guide) Object.assign(s.guide, a.guide);
    if (a.vinyl) Object.assign(s.vinyl, a.vinyl);
    if (a.points) for (const p of s.points) if (a.points[p.id]) Object.assign(p, a.points[p.id]);
  }
})();

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:«»"]/g, ' ').replace(/\s+/g, ' ').trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function toast(msg, ms = 3000) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
const localPoint = (sc, p) => new THREE.Vector3(p.x / sc.vinyl.widthM, (p.y - sc.vinyl.centerM) / sc.vinyl.widthM, p.z / sc.vinyl.widthM);

// ---------------------------------------------------------------------------
// Claves de voz e IA. Las pega Homero en el panel «Voz e IA» y se guardan solo en este navegador.
// Nunca van en el código: este sitio es público.
// ---------------------------------------------------------------------------
const KEYS_LS = 'og-ra-claves-v1';
const DEFAULT_VOICE = 'FXn3GKRRt9FCEyTbrkaL'; // «Nico», ElevenLabs: guía de museo, cálida y tranquila
let keys = { anthropic: '', eleven: '', voice: DEFAULT_VOICE };
try { keys = { ...keys, ...(JSON.parse(localStorage.getItem(KEYS_LS)) || {}) }; } catch (e) { /* sin almacenamiento */ }
if (!keys.voice) keys.voice = DEFAULT_VOICE;
function saveKeys() { try { localStorage.setItem(KEYS_LS, JSON.stringify(keys)); return true; } catch (e) { return false; } }

// ---------------------------------------------------------------------------
// Voz: ElevenLabs (frase a frase, con caché) y, si falla o no hay clave, la voz del sistema
// ---------------------------------------------------------------------------
let sysVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  sysVoice = vs.find((v) => /es[-_]ES/i.test(v.lang) && /m[oó]nica|jorge|marisol|siri/i.test(v.name)) || vs.find((v) => /es[-_]ES/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
const audioEl = new Audio(); audioEl.setAttribute('playsinline', ''); audioEl.preload = 'auto';
const ttsCache = new Map();   // texto -> Promise<url>
let pendingStop = null;       // corta lo que esté sonando
function ttsUrl(text) {
  if (!keys.eleven) return null;
  if (ttsCache.has(text)) return ttsCache.get(text);
  const pr = fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(keys.voice || DEFAULT_VOICE)}/stream?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': keys.eleven, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', language_code: 'es', voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
  }).then(async (r) => {
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`ElevenLabs ${r.status} ${t.slice(0, 160)}`); }
    return URL.createObjectURL(await r.blob());
  });
  pr.catch(() => ttsCache.delete(text));
  ttsCache.set(text, pr);
  return pr;
}
let ttsWarned = false;
function playUrl(url) {
  return new Promise((res) => {
    let done = false; const fin = () => { if (!done) { done = true; pendingStop = null; res(); } };
    pendingStop = () => { audioEl.pause(); fin(); };
    audioEl.onended = fin; audioEl.onerror = fin;
    audioEl.src = url; audioEl.play().catch(fin);
  });
}
function speakSystem(text) {
  return new Promise((res) => {
    if (!('speechSynthesis' in window)) { setTimeout(res, 900 + text.length * 55); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES'; if (sysVoice) u.voice = sysVoice; u.rate = 1.0;
    let done = false; const fin = () => { if (!done) { done = true; clearTimeout(t); pendingStop = null; res(); } };
    pendingStop = () => { speechSynthesis.cancel(); fin(); };
    u.onend = fin; u.onerror = fin;
    const t = setTimeout(fin, 2500 + text.length * 95);
    speechSynthesis.speak(u);
  });
}
async function speak(text) {
  const pr = ttsUrl(text);
  if (pr) {
    try { const url = await pr; return await playUrl(url); }
    catch (e) { console.warn(e); if (!ttsWarned) { ttsWarned = true; toast('ElevenLabs no responde. Sigo con la voz del móvil.'); } }
  }
  return speakSystem(text);
}
function hush() { if (pendingStop) pendingStop(); audioEl.pause(); if ('speechSynthesis' in window) speechSynthesis.cancel(); }
function unlockAudio() {
  // iOS solo deja sonar audio después de un toque: se desbloquean aquí las dos vías.
  if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
  const sr = 8000, n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const w = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  audioEl.src = URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); audioEl.play().catch(() => {});
}

// ---------------------------------------------------------------------------
// Respuestas en tiempo real con Claude (SDK oficial en el navegador, con la clave de este móvil)
// ---------------------------------------------------------------------------
let AnthropicSDK = null, claude = null, claudeKey = '';
async function getClaude() {
  if (!keys.anthropic) return null;
  if (!AnthropicSDK) AnthropicSDK = (await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm')).default;
  if (!claude || claudeKey !== keys.anthropic) { claude = new AnthropicSDK({ apiKey: keys.anthropic, dangerouslyAllowBrowser: true }); claudeKey = keys.anthropic; }
  return claude;
}
const SYSTEM_PROMPT = [
  'Eres el guía de OptimaGuía: un fraile de la Orden Hospitalaria de San Juan de Dios que acompaña al visitante en realidad aumentada.',
  'Hoy es una prueba en la oficina de Óptima Cultura en Madrid, antes de llevar la audioguía a la basílica de San Juan de Dios de Granada.',
  'Responde solo con la información de esta visita, que tienes abajo. Si te preguntan algo que no está, dilo con amabilidad en una frase y ofrece lo que sí sabes. No inventes datos, fechas ni nombres.',
  'Hablas en voz alta: español de España, cercano y tranquilo, de una a tres frases cortas. Sin listas, sin markdown, sin emojis, sin comillas raras.',
  'Responde enseguida, sin preámbulos: la respuesta se convierte en voz mientras la escribes.',
  '',
  'Información de la visita:',
  '- Zona 1, «Bienvenida»: el vinilo «more soul, more beauty, more culture», junto al rincón del sofá. Es el lema de Óptima Cultura: más alma, más belleza, más cultura. El rincón del sofá está junto a la pared de pizarra, con una alfombra naranja; es un buen sitio para esperar.',
  '- Zona 2, «La planta»: el vinilo «meetings that matter… or maybe this could’ve just been an email», en la sala de reuniones. Allí hay una planta muy bonita.',
  '- Zona 3, «El café»: el vinilo «not cultured yet?», en la zona del café. La cafetera hace un café muy rico.',
  '- Orden recomendado: bienvenida, sala de reuniones y café. Para que aparezcas, el visitante apunta con el móvil a cada vinilo.',
  '- La basílica de San Juan de Dios está en Granada; esta prueba es para su audioguía. No tienes más datos de la basílica en esta prueba.',
].join('\n');
let convo = [];  // conversación de esta sesión, sin recortar (solo se añade)
async function askClaude(q, A, onSentence, onText) {
  const client = await getClaude(); if (!client) return null;
  if (convo.length > 24) convo = [];
  const where = A ? `El visitante está ahora en la zona «${A.sc.title}».` : 'El visitante no está apuntando a ningún vinilo ahora mismo.';
  const messages = [...convo, { role: 'user', content: `${where}\n\nPregunta: ${q}` }];
  const stream = client.beta.messages.stream({
    model: 'claude-opus-5-5',
    max_tokens: 2048,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: SYSTEM_PROMPT,
    messages,
  });
  let full = '', buf = '';
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
      full += ev.delta.text; buf += ev.delta.text; onText(full);
      let m;
      while ((m = buf.match(/^([\s\S]*?[.!?…])(\s+)/)) && m[1].trim().length >= 12) { onSentence(m[1].trim()); buf = buf.slice(m[0].length); }
    }
  }
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') return { refused: true };
  if (buf.trim()) onSentence(buf.trim());
  convo.push(messages[messages.length - 1], { role: 'assistant', content: msg.content });
  return { text: full };
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// ---------------------------------------------------------------------------
// three.js + MindAR
// ---------------------------------------------------------------------------
let mindar, renderer, scene3, camera, gltf;
const clock = new THREE.Clock();
const anchors = [];
let active = null;     // escena con vinilo a la vista
let paused = false;
let lastSeen = null;   // última escena vista (para «Ajustar»)
const camWorld = new THREE.Vector3();
const tmp = new THREE.Vector3();

const modelReady = new GLTFLoader().loadAsync('assets/fray-guia.glb?v=2').then((g) => { gltf = g; return g; });

function shadowMesh() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = -1; return m;
}

function buildAnchor(sc) {
  const anchor = mindar.addAnchor(sc.target);
  const g = new THREE.Group(); anchor.group.add(g);
  const root = SkeletonUtils.clone(gltf.scene);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  const holder = new THREE.Group(); holder.add(root); g.add(holder);
  const shadow = shadowMesh(); g.add(shadow);
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  for (const n of ['Greet', 'Point']) if (actions[n]) { actions[n].setLoop(THREE.LoopOnce, 1); actions[n].clampWhenFinished = true; }
  const A = { sc, anchor, g, holder, shadow, mixer, actions, cur: null, yaw: 0, visible: false, lineIdx: 0, done: false, run: 0, speaking: false, focus: null, pointMode: false, marks: {} };
  mixer.addEventListener('finished', (e) => { if (e.action === actions.Greet || e.action === actions.Point) play(A, A.speaking ? 'Talk' : 'Idle'); });
  anchor.onTargetFound = () => onFound(A);
  anchor.onTargetLost = () => onLost(A);
  // Marcas HTML de los puntos visibles
  for (const p of sc.points) {
    if (p.hidden) continue;
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'mk'; el.hidden = true;
    el.innerHTML = `<span class="ring"></span><span class="lbl"></span>`;
    el.querySelector('.lbl').textContent = p.name;
    el.setAttribute('aria-label', `${p.name}. Ver ficha`);
    el.addEventListener('click', () => openCard(A, p));
    $('#marks').appendChild(el); A.marks[p.id] = el;
  }
  layout(A); play(A, 'Idle', 0);
  return A;
}
function layout(A) {
  const { sc } = A; const s = 1 / sc.vinyl.widthM;
  const fy = -sc.vinyl.centerM * s;
  A.holder.scale.setScalar(s);
  A.holder.position.set(sc.guide.x * s, fy, sc.guide.z * s);
  A.shadow.scale.setScalar(s);
  A.shadow.position.set(sc.guide.x * s, fy + 0.003 * s, sc.guide.z * s);
}
function play(A, name, fade = 0.3) {
  const next = A.actions[name] || A.actions.Idle; if (!next) return;
  if (A.cur === next && next.isRunning()) return;
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play();
  if (A.cur && A.cur !== next) A.cur.fadeOut(fade);
  A.cur = next;
}
function angleDamp(a, b, k) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * Math.min(1, k); }
function updateYaw(A, dt) {
  camera.getWorldPosition(camWorld);
  const cam = A.g.worldToLocal(camWorld.clone()); const gp = A.holder.position;
  const face = Math.atan2(cam.x - gp.x, cam.z - gp.z);
  let target = face;
  if (A.focus) {
    const dx = A.focus.x - gp.x, dz = A.focus.z - gp.z;
    if (A.pointMode) target = Math.atan2(dz, -dx);         // brazo derecho hacia el objeto
    else target = face + 0.5 * angleDiff(face, Math.atan2(dx, dz)); // mira a medias al objeto
  }
  A.yaw = angleDamp(A.yaw, target, dt * 4);
  A.holder.rotation.y = A.yaw;
}
function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function canPoint(A, focus) {
  camera.getWorldPosition(camWorld);
  const cam = A.g.worldToLocal(camWorld.clone()); const gp = A.holder.position;
  const dx = focus.x - gp.x, dz = focus.z - gp.z; const th = Math.atan2(dz, -dx);
  const fwd = new THREE.Vector2(Math.sin(th), Math.cos(th));
  const c = new THREE.Vector2(cam.x - gp.x, cam.z - gp.z).normalize();
  return fwd.dot(c) > -0.15; // al señalar no le da la espalda al visitante
}

// ---------------------------------------------------------------------------
// Narración
// ---------------------------------------------------------------------------
function showBubble(text) { $('#line').textContent = text; $('#bubble').hidden = false; }
function setPointed(A, id) { for (const [pid, el] of Object.entries(A.marks)) el.classList.toggle('pointed', pid === id); }
async function sayLine(A, L, run) {
  showBubble(L.text);
  const p = L.at ? A.sc.points.find((x) => x.id === L.at) : null;
  A.focus = p ? localPoint(A.sc, p) : null;
  setPointed(A, p && !p.hidden ? p.id : null);
  A.pointMode = !!(A.focus && canPoint(A, A.focus));
  A.speaking = true;
  play(A, L.anim || (A.pointMode ? 'Point' : 'Talk'));
  await speak(L.text);
  if (run !== A.run) return;
  A.speaking = false;
  if (A.cur === A.actions.Talk) play(A, 'Idle');
  await wait(450);
}
async function runLines(A) {
  const run = ++A.run;
  while (A.lineIdx < A.sc.lines.length) {
    if (run !== A.run || paused) return;
    const nx = A.sc.lines[A.lineIdx + 1]; if (nx) ttsUrl(nx.text);
    await sayLine(A, A.sc.lines[A.lineIdx], run);
    if (run !== A.run) return;
    A.lineIdx++;
  }
  A.done = true; A.focus = null; setPointed(A, null); play(A, 'Idle');
  renderTop();
}
function stopNarration(A) { if (!A) return; A.run++; A.speaking = false; hush(); }

function onFound(A) {
  active = A; lastSeen = A; A.visible = true;
  $('#hint').hidden = true;
  renderTop();
  if (!paused && !A.done && $('#talk').hidden && $('#card').hidden) runLines(A);
  else if (A.done) { $('#bubble').hidden = true; play(A, 'Idle'); }
}
function onLost(A) {
  A.visible = false; stopNarration(A);
  for (const el of Object.values(A.marks)) el.hidden = true;
  if (active === A) { active = null; $('#bubble').hidden = true; }
  renderTop(); renderHint();
  play(A, 'Idle', 0);
}

// ---------------------------------------------------------------------------
// Interfaz
// ---------------------------------------------------------------------------
function renderTop() {
  const doneN = anchors.filter((a) => a.done).length;
  $('#segs').innerHTML = SCENES.map((s, i) => { const A = anchors[i]; return `<i class="${A && A.done ? 'done' : (active && active.sc === s ? 'now' : '')}"></i>`; }).join('');
  $('#cnt').textContent = `${doneN}/${SCENES.length}`;
  $('#scene-title').textContent = active ? active.sc.title : 'Busca un vinilo';
  $('#scene-sub').textContent = active ? active.sc.sub : 'Visita en realidad aumentada';
}
function nextScene() { return SCENES.find((s, i) => !(anchors[i] && anchors[i].done)); }
function nextHintText() {
  const n = nextScene();
  return n ? `Busca el vinilo «${n.vinyl.label}», ${n.vinyl.where}.` : 'Ya has visto las tres zonas. Puedes volver a cualquier vinilo cuando quieras.';
}
function renderHint() {
  if (active || $('#start').hidden === false) return;
  const n = nextScene(); const started = anchors.some((a) => a.lineIdx > 0 || a.done);
  $('#hint-title').textContent = started ? (n ? 'Siguiente parada' : 'Visita completa') : 'Apunta a un vinilo de la pared';
  $('#hint-sub').textContent = started ? nextHintText() : 'Ponte a unos 2 o 3 metros, con el vinilo entero en la pantalla.';
  const list = started && n ? [n] : SCENES;
  $('#hint-thumbs').innerHTML = list.map((s) => `<figure class="${list.length === 1 ? 'only' : ''}"><img src="${s.vinyl.img}" alt="Vinilo ${s.vinyl.label}"><figcaption>${s.title}</figcaption></figure>`).join('');
  $('#hint').hidden = false;
}
function updateMarks() {
  const r = renderer.domElement.getBoundingClientRect();
  for (const A of anchors) {
    for (const p of A.sc.points) {
      const el = A.marks[p.id]; if (!el) continue;
      if (!A.visible) { el.hidden = true; continue; }
      tmp.copy(localPoint(A.sc, p)); A.g.localToWorld(tmp); tmp.project(camera);
      if (tmp.z > 1 || tmp.z < -1) { el.hidden = true; continue; }
      const x = r.left + (tmp.x + 1) / 2 * r.width, y = r.top + (1 - tmp.y) / 2 * r.height;
      const ring = el.classList.contains('pointed') ? 22 : 15;
      el.style.transform = `translate(${Math.round(x - ring)}px, ${Math.round(y - ring)}px)`;
      el.hidden = false;
    }
  }
}

// Ficha de un punto
let cardCtx = null;
function openCard(A, p) {
  cardCtx = { A, p }; stopNarration(A);
  $('#card-img').src = p.photo; $('#card-img').alt = p.name;
  $('#card-over').textContent = p.over || A.sc.title; $('#card-title').textContent = p.name; $('#card-text').textContent = p.text;
  $('#card').hidden = false; $('#dock').hidden = true; $('#bubble').hidden = true;
}
function closeCard(resume = true) {
  $('#card').hidden = true; $('#dock').hidden = false;
  const A = cardCtx && cardCtx.A; cardCtx = null;
  if (resume && A && A.visible && !A.done && !paused) runLines(A);
}
$('#card-x').addEventListener('click', () => closeCard(true));
$('#card-explain').addEventListener('click', async () => {
  const { A, p } = cardCtx || {}; closeCard(false);
  if (!A) return;
  if (!A.visible) { toast('Vuelve a apuntar al vinilo para que el guía lo explique.'); return; }
  const run = ++A.run; await sayLine(A, { at: p.id, text: p.say || p.text }, run);
  if (run === A.run && !A.done && !paused) runLines(A);
});

// Pausa y repetir
function setPaused(v) {
  paused = v;
  $('#btn-pause').setAttribute('aria-label', v ? 'Seguir' : 'Pausar');
  $('#ico-pause').innerHTML = v ? '<path d="M8 5.2v13.6c0 .8.9 1.3 1.5.8l10.4-6.8c.6-.4.6-1.2 0-1.6L9.5 4.4C8.9 4 8 4.4 8 5.2z"/>' : '<rect x="6.5" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2"/>';
  if (v) { if (active) { stopNarration(active); play(active, 'Idle'); } }
  else if (active && !active.done) runLines(active);
}
$('#btn-pause').addEventListener('click', () => setPaused(!paused));
$('#btn-repeat').addEventListener('click', () => {
  const A = active || lastSeen; if (!A) { toast('Apunta a un vinilo para empezar.'); return; }
  stopNarration(A); A.lineIdx = 0; A.done = false; renderTop();
  if (A.visible) { setPaused(false); runLines(A); } else toast('Vuelve a apuntar al vinilo para escucharlo otra vez.');
});

// Hablar con el guía
let rec = null, heard = '';
$('#sugg').innerHTML = SUGG.map((q) => `<button type="button"><span>↳</span>${q}</button>`).join('');
$('#sugg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) answer(b.textContent.replace('↳', '').trim()); });
$('#ask-form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#ask-input').value.trim(); if (v) answer(v); });
$('#talk-x').addEventListener('click', () => closeTalk(true));
$('#talk-state').addEventListener('click', () => { if (SR && !rec) listen(); });
$('#btn-talk').addEventListener('click', openTalk);
function openTalk() {
  if (active) { stopNarration(active); play(active, 'Listen'); }
  $('#talk').hidden = false; $('#dock').hidden = true; $('#bubble').hidden = true;
  $('#you').textContent = SR ? 'Te escucho. Pregúntale lo que quieras.' : 'Elige una pregunta o escríbela.';
  $('#you').classList.add('dim'); $('#ask-input').value = '';
  if (SR) listen(); else $('#talk-state').lastChild.textContent = 'Escribe tu pregunta';
}
function closeTalk(resume) {
  if (rec) { try { rec.abort(); } catch (e) { /* nada */ } rec = null; }
  $('#talk').hidden = true; $('#talk').classList.remove('listening'); $('#dock').hidden = false;
  if (resume && active && !active.done && !paused) runLines(active);
  else if (active) play(active, 'Idle');
}
function listen() {
  heard = '';
  try {
    rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => { heard = Array.from(e.results).map((r) => r[0].transcript).join(''); $('#you').textContent = heard; $('#you').classList.remove('dim'); };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { $('#you').textContent = 'No tengo permiso para el micrófono. Elige una pregunta o escríbela.'; } };
    rec.onend = () => { rec = null; $('#talk').classList.remove('listening'); $('#talk-state').lastChild.textContent = 'Toca para hablar'; if (heard) answer(heard); };
    rec.start(); $('#talk').classList.add('listening'); $('#talk-state').lastChild.textContent = 'Te escucho';
  } catch (e) { rec = null; $('#you').textContent = 'No puedo usar el micrófono aquí. Elige una pregunta o escríbela.'; }
}
async function answer(q) {
  closeTalk(false);
  const A = active;
  const run = A ? ++A.run : 0;
  if (A) { A.focus = null; setPointed(A, null); A.speaking = true; play(A, 'Talk'); }
  const alive = () => !A || run === A.run;
  let usedClaude = false;
  if (keys.anthropic) {
    showBubble('…');
    // La voz va frase a frase: cada frase se pide a ElevenLabs en cuanto llega y suena en orden.
    const queue = []; let closed = false, wake = null;
    const player = (async () => {
      let i = 0;
      for (;;) {
        if (!alive()) return;
        if (i < queue.length) { await speak(queue[i++]); continue; }
        if (closed) return;
        await new Promise((r) => { wake = r; });
      }
    })();
    try {
      const r = await askClaude(q, A, (sentence) => { ttsUrl(sentence); queue.push(sentence); if (wake) { const w = wake; wake = null; w(); } }, (txt) => { if (alive()) showBubble(txt); });
      if (r && r.refused) { queue.push('Prefiero no responder a eso. Pregúntame por la visita.'); showBubble('Prefiero no responder a eso. Pregúntame por la visita.'); }
      usedClaude = !!r;
    } catch (e) {
      console.warn(e);
      toast(/401|authentication|api.key/i.test(String(e && e.message)) ? 'La clave de Claude no es válida. Uso las respuestas preparadas.' : 'Claude no responde ahora. Uso las respuestas preparadas.', 4000);
    }
    closed = true; if (wake) { const w = wake; wake = null; w(); }
    await player;
  }
  if (!usedClaude && alive()) {
    const nq = norm(q);
    const hit = QA.find((x) => x.k.some((k) => nq.includes(norm(k))));
    const a = hit ? (typeof hit.a === 'function' ? hit.a() : hit.a) : FALLBACK;
    showBubble(a);
    if (!A) toast(a, 6000);
    await speak(a);
  }
  if (!A || !alive()) return;
  A.speaking = false; play(A, 'Idle'); await wait(600);
  if (alive() && !A.done && !paused) runLines(A);
}

// Ajustar posiciones
let adjSel = 'guide';
$('#btn-adjust').addEventListener('click', () => { const open = $('#adjust').hidden; $('#adjust').hidden = !open; $('#btn-adjust').classList.toggle('on', open); $('#dock').hidden = open; if (open) renderAdjust(); });
$('#adj-x').addEventListener('click', () => { $('#adjust').hidden = true; $('#btn-adjust').classList.remove('on'); $('#dock').hidden = false; });
function adjScene() { return (active || lastSeen || anchors[0]); }
function renderAdjust() {
  const A = adjScene(); const sc = A.sc;
  $('#adj-title').textContent = `Ajustar · ${sc.title}`;
  $('#adj-help').textContent = A.visible ? 'Mueve el guía o los puntos hasta que encajen con la sala. Metros desde el centro del vinilo: X a la derecha, Z hacia ti.' : `Apunta al vinilo «${sc.vinyl.label}» para ver los cambios en directo.`;
  const opts = [['guide', 'Guía'], ...sc.points.filter((p) => !p.hidden).map((p) => [p.id, p.name]), ['vinyl', 'Vinilo']];
  if (!opts.some((o) => o[0] === adjSel)) adjSel = 'guide';
  $('#adj-what').innerHTML = opts.map(([id, n]) => `<button type="button" data-id="${id}" aria-pressed="${id === adjSel}">${n}</button>`).join('');
  let fields;
  if (adjSel === 'guide') fields = [['X', sc.guide, 'x', -4, 4], ['Z', sc.guide, 'z', -1, 6]];
  else if (adjSel === 'vinyl') fields = [['Ancho del vinilo', sc.vinyl, 'widthM', 0.3, 4], ['Altura del centro', sc.vinyl, 'centerM', 0.3, 2.6]];
  else { const p = sc.points.find((x) => x.id === adjSel); fields = [['X', p, 'x', -4, 4], ['Altura', p, 'y', 0, 2.6], ['Z', p, 'z', -2, 6]]; }
  $('#adj-sliders').innerHTML = fields.map(([l, o, k, mn, mx], i) => `<div class="sl"><label for="sl${i}">${l}<span id="sv${i}">${o[k].toFixed(2)} m</span></label><input id="sl${i}" type="range" min="${mn}" max="${mx}" step="0.01" value="${o[k]}"></div>`).join('');
  fields.forEach(([, o, k], i) => {
    $(`#sl${i}`).addEventListener('input', (e) => { o[k] = parseFloat(e.target.value); $(`#sv${i}`).textContent = `${o[k].toFixed(2)} m`; layout(A); saveAdj(); });
  });
}
$('#adj-what').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (!b) return; adjSel = b.dataset.id; renderAdjust(); });
$('#adj-reset').addEventListener('click', () => {
  const A = adjScene(); const d = DEFAULTS.find((x) => x.id === A.sc.id);
  Object.assign(A.sc.guide, d.guide); Object.assign(A.sc.vinyl, d.vinyl);
  for (const p of A.sc.points) Object.assign(p, d.points.find((q) => q.id === p.id));
  layout(A); saveAdj(); renderAdjust(); toast('Posiciones de esta zona restablecidas.');
});
$('#adj-copy').addEventListener('click', async () => {
  const txt = JSON.stringify(saveAdj());
  try { await navigator.clipboard.writeText(txt); toast('Ajustes copiados. Pégamelos en el chat.'); }
  catch (e) { toast('No he podido copiar. Haz una captura de esta pantalla.'); }
});

// Panel «Voz e IA»: las claves se pegan aquí, en el móvil
function keyStatus() {
  const v = keys.eleven ? 'Voz: ElevenLabs' : 'Voz: la del móvil';
  const ia = keys.anthropic ? 'Respuestas: Claude en tiempo real' : 'Respuestas: preparadas';
  return `${v} · ${ia}`;
}
function renderKeyStatus() { const t = keyStatus(); $('#keys-status').textContent = t; $('#start-keys-status').textContent = t; }
function openKeys() {
  $('#k-anthropic').value = keys.anthropic; $('#k-eleven').value = keys.eleven; $('#k-voice').value = keys.voice || DEFAULT_VOICE;
  renderKeyStatus(); $('#keys').hidden = false; $('#dock').hidden = true;
}
function closeKeys() { $('#keys').hidden = true; if ($('#start').hidden) $('#dock').hidden = false; }
$('#btn-keys').addEventListener('click', openKeys);
$('#btn-keys-2').addEventListener('click', () => { $('#adjust').hidden = true; $('#btn-adjust').classList.remove('on'); openKeys(); });
$('#keys-x').addEventListener('click', closeKeys);
$('#keys-form').addEventListener('submit', (e) => {
  e.preventDefault();
  keys.anthropic = $('#k-anthropic').value.trim(); keys.eleven = $('#k-eleven').value.trim(); keys.voice = $('#k-voice').value.trim() || DEFAULT_VOICE;
  ttsCache.clear(); claude = null; convo = []; ttsWarned = false;
  toast(saveKeys() ? 'Guardado en este móvil.' : 'No se ha podido guardar: el navegador no deja. Durará hasta que cierres la página.');
  renderKeyStatus();
});
$('#keys-clear').addEventListener('click', () => {
  keys = { anthropic: '', eleven: '', voice: DEFAULT_VOICE }; saveKeys(); ttsCache.clear(); claude = null; convo = [];
  $('#k-anthropic').value = ''; $('#k-eleven').value = ''; $('#k-voice').value = DEFAULT_VOICE; renderKeyStatus(); toast('Claves borradas de este móvil.');
});
$('#keys-test').addEventListener('click', async () => {
  unlockAudio(); await wait(150);
  keys.eleven = $('#k-eleven').value.trim(); keys.voice = $('#k-voice').value.trim() || DEFAULT_VOICE; ttsCache.clear(); ttsWarned = false;
  await speak('Hola, soy tu guía. Así sonará mi voz durante la visita.');
});
renderKeyStatus();

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
$('#start-thumbs').innerHTML = SCENES.map((s) => `<figure><img src="${s.vinyl.img}" alt="Vinilo ${s.vinyl.label}"><figcaption>${s.title}<br>${s.vinyl.where}</figcaption></figure>`).join('');
let dbg = null;
if (DEBUG) { dbg = document.createElement('div'); dbg.className = 'debug'; document.body.appendChild(dbg); }

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const A of anchors) if (A.visible) { A.mixer.update(dt); updateYaw(A, dt); }
  renderer.render(scene3, camera);
  updateMarks();
  if (dbg) dbg.textContent = `${Math.round(1 / Math.max(dt, 0.001))} fps · ${active ? active.sc.id : 'sin vinilo'} · línea ${active ? active.lineIdx : '-'}`;
}

async function start() {
  const st = $('#start-status'); const btn = $('#btn-start');
  btn.disabled = true; st.className = 'status';
  unlockAudio();
  if (keys.eleven) ttsUrl(SCENES[0].lines[0].text);
  try {
    st.textContent = 'Cargando el guía…';
    await modelReady;
    st.textContent = 'Abriendo la cámara…';
    mindar = new MindARThree({
      container: $('#ar'), imageTargetSrc: 'assets/targets.mind?v=2', maxTrack: 1,
      uiLoading: 'no', uiScanning: 'no', uiError: 'no',
      filterMinCF: 0.0001, filterBeta: 0.001, warmupTolerance: 4, missTolerance: 10,
    });
    ({ renderer, scene: scene3, camera } = mindar);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const pm = new THREE.PMREMGenerator(renderer);
    scene3.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene3.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3026, 0.9));
    const key = new THREE.DirectionalLight(0xfff1dc, 1.6); key.position.set(1.5, 3, 4); scene3.add(key);
    for (const sc of SCENES) anchors.push(buildAnchor(sc));
    await mindar.start();
    renderer.setAnimationLoop(tick);
    $('#start').hidden = true; $('#topbar').hidden = false; $('#dock').hidden = false;
    renderTop(); renderHint();
  } catch (e) {
    console.error(e);
    btn.disabled = false; st.className = 'status err';
    const msg = String(e && (e.name || e.message) || e);
    st.textContent = /NotAllowed|Permission|denied/i.test(msg)
      ? 'Necesito la cámara. Actívala en Ajustes › Safari › Cámara y vuelve a cargar la página.'
      : 'No se ha podido abrir la RA. Comprueba la conexión y vuelve a intentarlo.';
  }
}
$('#btn-start').addEventListener('click', start);
modelReady.catch(() => { $('#start-status').textContent = 'No se ha podido cargar el guía 3D.'; $('#start-status').className = 'status err'; });
