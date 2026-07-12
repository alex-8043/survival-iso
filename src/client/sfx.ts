// Efectos de sonido procedurales con Web Audio (sin archivos externos):
// romper bloques según el material y sonidos de animales (ambiente / daño /
// muerte). El volumen lo ajusta quien llama según la distancia al jugador.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;

export function initSfx(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.6 : 0;
      master.connect(ctx.destination);
      // buffer de ruido blanco reutilizable (1 s)
      const n = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, n, n);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { ctx = null; }
}

export function setSfxEnabled(on: boolean): void {
  enabled = on;
  if (master) master.gain.value = on ? 0.6 : 0;
}
export function isSfxOn(): boolean { return enabled; }

function now(): number { return ctx ? ctx.currentTime : 0; }

// Oscilador con envolvente ADSR simple.
function tone(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, peak: number, filterHz?: number): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node: AudioNode = g;
  osc.connect(g);
  if (filterHz) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterHz;
    g.connect(f); node = f;
  }
  node.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

// Ráfaga de ruido filtrado (golpes, crujidos).
function noise(t0: number, dur: number, peak: number, filter: BiquadFilterType, hz: number, q = 1): void {
  if (!ctx || !master || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filter; f.frequency.value = hz; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

// --- Romper bloques por material ---
function breakSound(material: string, vol: number, breaking: boolean): void {
  if (!ctx) return;
  const t = now();
  const v = vol * (breaking ? 0.5 : 1); // el "picar" suena más flojo que el "romper"
  switch (material) {
    case 'wood':
      tone('square', 150, 90, t, 0.12, 0.18 * v, 1200);
      noise(t, 0.08, 0.10 * v, 'bandpass', 700, 1.5);
      break;
    case 'stone':
    case 'rock':
    case 'coal':
      noise(t, 0.09, 0.20 * v, 'lowpass', 2600, 1);
      tone('square', 220, 140, t, 0.05, 0.06 * v, 1800);
      break;
    case 'ore':
    case 'iron_ore':
    case 'gold_ore':
    case 'diamond':
      noise(t, 0.08, 0.14 * v, 'lowpass', 2600, 1);
      tone('triangle', 1400, 1900, t + 0.01, 0.10, 0.08 * v);
      break;
    case 'sand':
      noise(t, 0.13, 0.16 * v, 'lowpass', 1600, 0.7);
      break;
    case 'dirt':
    case 'grass':
      noise(t, 0.10, 0.16 * v, 'lowpass', 1100, 0.8);
      tone('sine', 120, 80, t, 0.06, 0.05 * v);
      break;
    case 'snow':
      noise(t, 0.11, 0.12 * v, 'highpass', 3200, 0.6);
      break;
    case 'leaves':
      noise(t, 0.14, 0.09 * v, 'bandpass', 3400, 0.9);
      break;
    default:
      noise(t, 0.10, 0.14 * v, 'lowpass', 1400, 0.8);
  }
}

// --- Animales: síntesis con vibrato para sonidos más realistas ---
// Tono con vibrato opcional (frecuencia oscilante) y filtro paso-bajo.
function vibTone(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, peak: number, filterHz = 0, vibHz = 0, vibDepth = 0): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.min(0.05, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node: AudioNode = g;
  osc.connect(g);
  if (filterHz) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz; g.connect(f); node = f; }
  node.connect(master);
  if (vibHz > 0) {
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = vibHz;
    const ld = ctx.createGain(); ld.gain.value = vibDepth;
    lfo.connect(ld); ld.connect(osc.frequency);
    lfo.start(t0); lfo.stop(t0 + dur + 0.02);
  }
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

function animalSound(type: string, event: 'idle' | 'hurt' | 'death', vol: number): void {
  if (!ctx) return;
  const t = now();
  if (event === 'hurt') {
    vibTone('sawtooth', 520, 190, t, 0.16, 0.2 * vol, 1500);
    noise(t, 0.05, 0.08 * vol, 'bandpass', 1100, 1);
    return;
  }
  if (event === 'death') {
    vibTone('sawtooth', 360, 90, t, 0.5, 0.22 * vol, 1000, 7, 8);
    noise(t, 0.2, 0.08 * vol, 'lowpass', 1200, 0.8);
    return;
  }
  // idle: sonido característico de cada animal
  switch (type) {
    case 'cow': // muuuu
      vibTone('sawtooth', 172, 118, t, 0.75, 0.16 * vol, 620, 6, 5);
      vibTone('sine', 86, 60, t, 0.75, 0.06 * vol, 300);
      break;
    case 'pig': // oink oink (dos gruñidos nasales)
      for (let i = 0; i < 2; i++) { const tt = t + i * 0.17; vibTone('sawtooth', 255, 165, tt, 0.12, 0.16 * vol, 900, 40, 25); noise(tt, 0.05, 0.05 * vol, 'bandpass', 820, 2); }
      break;
    case 'chicken': // bok bok bawk
      vibTone('square', 1050, 960, t, 0.05, 0.12 * vol, 2600);
      vibTone('square', 1000, 900, t + 0.12, 0.05, 0.11 * vol, 2600);
      vibTone('square', 840, 1360, t + 0.25, 0.13, 0.13 * vol, 2600);
      break;
    case 'sheep': // beeee (con vibrato marcado)
      vibTone('sawtooth', 430, 380, t, 0.5, 0.15 * vol, 1600, 13, 34);
      break;
    case 'frog': // croac croac
      for (let i = 0; i < 2; i++) { const tt = t + i * 0.22; vibTone('sawtooth', 135, 120, tt, 0.14, 0.16 * vol, 460, 30, 34); }
      break;
    case 'monkey': // uuh uuh (chillidos ascendentes)
      vibTone('square', 520, 900, t, 0.12, 0.13 * vol, 2400);
      vibTone('square', 560, 1000, t + 0.15, 0.11, 0.12 * vol, 2400);
      break;
    case 'bat': // chillido agudo
      vibTone('sine', 4600, 6400, t, 0.06, 0.1 * vol);
      break;
    default: // aldeano: "hmm"
      vibTone('sine', 210, 178, t, 0.26, 0.12 * vol, 900);
  }
}

// Entrada principal: `sound` con forma "break:wood", "hit:stone",
// "animal:cow:hurt", "animal:frog:idle", "ui:cave".
export function gameSfx(sound: string, gain: number): void {
  if (!enabled || !ctx || gain <= 0.02) return;
  const p = sound.split(':');
  if (p[0] === 'break') breakSound(p[1], gain, false);
  else if (p[0] === 'hit') breakSound(p[1], gain, true);
  else if (p[0] === 'animal') animalSound(p[1], (p[2] as 'idle' | 'hurt' | 'death') || 'idle', gain);
  else if (p[0] === 'ui') {
    const t = now();
    if (p[1] === 'cave') { tone('sine', 320, 180, t, 0.5, 0.12 * gain, 700); noise(t, 0.4, 0.05 * gain, 'lowpass', 500, 0.7); }
    else if (p[1] === 'place') noise(t, 0.06, 0.12 * gain, 'lowpass', 1400, 1);
    else if (p[1] === 'door') tone('square', 200, 140, t, 0.16, 0.12 * gain, 900);
  }
}
