// Voz y preguntas del guía. Todo pasa por el servidor de Cloudflare, que es quien tiene las claves:
//   /tts  voz de ElevenLabs   ·   /ask  respuesta de Claude en streaming   ·   /stt  transcripción de lo que dices
// Sin servidor, o si falla, el guía habla con la voz del móvil y responde con las frases preparadas.
import { API_URL } from './config.js';

const qs = new URLSearchParams(location.search);
function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k) || '';
    if (v) localStorage.setItem(k, v); else localStorage.removeItem(k);
  } catch (e) { /* sin almacenamiento */ }
  return '';
}
if (qs.has('api')) store('og-ra-api', qs.get('api'));
export const api = (store('og-ra-api') || API_URL || '').replace(/\/+$/, '');
export const hasServer = () => !!api;
function headers(extra = {}) {
  const h = { ...extra };
  const code = store('og-ra-acceso'); // solo si se activa ACCESS_CODE en el servidor
  if (code) h['X-Acceso'] = code;
  return h;
}

// ---------------------------------------------------------------------------
// Voz
// ---------------------------------------------------------------------------
let sysVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  sysVoice = vs.find((v) => /es[-_]ES/i.test(v.lang) && /m[oó]nica|jorge|marisol|siri/i.test(v.name)) || vs.find((v) => /es[-_]ES/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

const audioEl = new Audio(); audioEl.setAttribute('playsinline', ''); audioEl.preload = 'auto';
const cache = new Map(); // texto -> Promise<url del mp3>
let stopCurrent = null;
let serverDown = false;
export let lastError = '';

export function prefetch(text) {
  if (!api || serverDown || !text) return null;
  if (cache.has(text)) return cache.get(text);
  const pr = fetch(`${api}/tts`, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ text }) })
    .then(async (r) => {
      if (!r.ok) {
        if ([401, 403, 500].includes(r.status)) serverDown = true; // sin clave o sin permiso: no insistir en cada frase
        throw new Error(`voz ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
      }
      return URL.createObjectURL(await r.blob());
    });
  pr.catch(() => cache.delete(text));
  cache.set(text, pr);
  if (cache.size > 40) { const k = cache.keys().next().value; const old = cache.get(k); cache.delete(k); old.then((u) => URL.revokeObjectURL(u)).catch(() => {}); }
  return pr;
}

function playUrl(url, onStart) {
  return new Promise((res) => {
    let done = false; const fin = () => { if (!done) { done = true; stopCurrent = null; res(); } };
    stopCurrent = () => { audioEl.pause(); fin(); };
    audioEl.onended = fin; audioEl.onerror = fin;
    audioEl.onplaying = () => { audioEl.onplaying = null; if (onStart) onStart(); };
    audioEl.src = url; audioEl.play().catch(fin);
  });
}
function speakSystem(text, onStart) {
  return new Promise((res) => {
    if (onStart) onStart();
    if (!('speechSynthesis' in window)) { setTimeout(res, 900 + text.length * 55); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES'; if (sysVoice) u.voice = sysVoice; u.rate = 1.0;
    let done = false; const fin = () => { if (!done) { done = true; clearTimeout(t); stopCurrent = null; res(); } };
    stopCurrent = () => { speechSynthesis.cancel(); fin(); };
    u.onend = fin; u.onerror = fin;
    const t = setTimeout(fin, 2500 + text.length * 95);
    speechSynthesis.speak(u);
  });
}
let warned = false;
// Dice una frase y resuelve al terminar. onStart se llama cuando empieza a sonar (para sincronizar el gesto).
export async function speak(text, { onStart, onFallback } = {}) {
  const pr = prefetch(text);
  if (pr) {
    try { return await playUrl(await pr, onStart); }
    catch (e) {
      lastError = String(e && e.message || e);
      console.warn(e);
      if (!warned) { warned = true; if (onFallback) onFallback(lastError); }
    }
  }
  return speakSystem(text, onStart);
}
export function hush() {
  if (stopCurrent) stopCurrent();
  audioEl.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
// iOS solo deja sonar audio después de un toque: se llama dentro del primer toque.
export function unlockAudio() {
  if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
  const sr = 8000, n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  audioEl.src = URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); audioEl.play().catch(() => {});
}

// ---------------------------------------------------------------------------
// Preguntas a Claude (por el servidor). El texto llega poco a poco y se corta en frases para la voz.
// ---------------------------------------------------------------------------
const history = []; // últimas preguntas y respuestas de esta visita
export async function ask(question, { zone = '', onSentence = () => {}, onText = () => {}, signal } = {}) {
  if (!api) return null;
  const r = await fetch(`${api}/ask`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), signal,
    body: JSON.stringify({ question, zone, previous: history.slice(-3) }),
  });
  if (!r.ok) throw new Error(`preguntas ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
  const reader = r.body.getReader(); const dec = new TextDecoder();
  const clean = (t) => t.replace(/\n?\[\[(rechazo|error)\]\]/g, '').trim();
  let full = '', buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const t = dec.decode(value, { stream: true });
    full += t; buf += t;
    onText(clean(full));
    let m;
    while ((m = buf.match(/^([\s\S]*?[.!?…])(\s+)/)) && m[1].trim().length >= 12) { const s = clean(m[1]); if (s) onSentence(s); buf = buf.slice(m[0].length); }
  }
  const rest = clean(buf); if (rest) onSentence(rest);
  if (/\[\[rechazo\]\]/.test(full)) return { refused: true };
  if (/\[\[error\]\]/.test(full) && !clean(full)) throw new Error('preguntas: error del modelo');
  const text = clean(full);
  history.push({ q: question, a: text }); if (history.length > 6) history.shift();
  return { text };
}

// ---------------------------------------------------------------------------
// Micrófono: graba hasta que dejas de hablar y lo transcribe en el servidor
// ---------------------------------------------------------------------------
export const canRecord = () => !!(api && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
export async function record({ onLevel, maxMs = 9000, silenceMs = 1300, waitMs = 6000 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = []; rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = AC ? new AC() : null; let an = null, data = null;
  if (ctx) { const src = ctx.createMediaStreamSource(stream); an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an); data = new Uint8Array(an.fftSize); }
  let heard = false, cancelled = false; const t0 = performance.now(); let lastLoud = t0;
  const done = new Promise((res) => { rec.onstop = () => res(cancelled ? null : new Blob(chunks, { type: (rec.mimeType || mime || 'audio/mp4').split(';')[0] })); });
  let iv = 0;
  const stop = () => {
    clearInterval(iv);
    if (rec.state !== 'inactive') rec.stop();
    stream.getTracks().forEach((t) => t.stop());
    if (ctx) ctx.close().catch(() => {});
  };
  // Con setInterval y no requestAnimationFrame: durante la sesión de RA la ventana no recibe fotogramas.
  iv = setInterval(() => {
    const now = performance.now();
    if (an) {
      an.getByteTimeDomainData(data); let s = 0;
      for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; s += x * x; }
      const rms = Math.sqrt(s / data.length); if (onLevel) onLevel(rms);
      if (rms > 0.035) { heard = true; lastLoud = now; }
    } else heard = true;
    if ((heard && an && now - lastLoud > silenceMs) || now - t0 > maxMs || (!heard && now - t0 > waitMs)) stop();
  }, 60);
  rec.start(250);
  return { stop, cancel: () => { cancelled = true; stop(); }, done, heard: () => heard };
}
export async function transcribe(blob) {
  const r = await fetch(`${api}/stt`, { method: 'POST', headers: headers({ 'Content-Type': blob.type || 'audio/mp4' }), body: blob });
  if (!r.ok) throw new Error(`transcripción ${r.status}`);
  const d = await r.json();
  return String(d.text || '').trim();
}
