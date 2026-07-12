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

// --- Animales: parámetros base por tipo ---
interface AnimalVoice { type: OscillatorType; f0: number; f1: number; dur: number; filt?: number; }
const VOICE: Record<string, AnimalVoice> = {
  cow: { type: 'sawtooth', f0: 240, f1: 150, dur: 0.7, filt: 900 },
  pig: { type: 'sawtooth', f0: 220, f1: 180, dur: 0.28, filt: 1200 },
  chicken: { type: 'square', f0: 900, f1: 1300, dur: 0.09 },
  sheep: { type: 'sawtooth', f0: 360, f1: 300, dur: 0.5, filt: 1400 },
  frog: { type: 'square', f0: 150, f1: 120, dur: 0.16, filt: 700 },
  monkey: { type: 'square', f0: 520, f1: 820, dur: 0.12 },
  bat: { type: 'sine', f0: 4200, f1: 6200, dur: 0.07 },
  villager: { type: 'sine', f0: 250, f1: 210, dur: 0.3, filt: 1100 },
};

function animalSound(type: string, event: 'idle' | 'hurt' | 'death', vol: number): void {
  if (!ctx) return;
  const v = VOICE[type] || VOICE.villager;
  const t = now();
  if (event === 'idle') {
    if (type === 'chicken') { tone('square', 900, 1200, t, 0.08, 0.12 * vol); tone('square', 1100, 1400, t + 0.12, 0.07, 0.10 * vol); }
    else if (type === 'monkey') { tone('square', 520, 820, t, 0.1, 0.12 * vol); tone('square', 600, 900, t + 0.14, 0.09, 0.10 * vol); }
    else if (type === 'frog') { tone('square', 150, 120, t, 0.16, 0.14 * vol, 700); tone('square', 150, 110, t + 0.2, 0.14, 0.12 * vol, 700); }
    else tone(v.type, v.f0, v.f1, t, v.dur, 0.14 * vol, v.filt);
  } else if (event === 'hurt') {
    tone(v.type, v.f0 * 1.15, v.f0 * 0.6, t, Math.min(0.22, v.dur * 0.6), 0.2 * vol, v.filt);
    noise(t, 0.06, 0.08 * vol, 'bandpass', 1200, 1);
  } else { // death
    tone(v.type, v.f0, v.f0 * 0.4, t, v.dur * 1.3, 0.22 * vol, v.filt);
    tone(v.type, v.f0 * 0.5, v.f0 * 0.25, t + 0.05, v.dur * 1.2, 0.16 * vol, v.filt);
    noise(t, 0.18, 0.08 * vol, 'lowpass', 1400, 0.8);
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
