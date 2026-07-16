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

// Frecuencia base de cada animal (para daño/muerte con su timbre propio).
function animalBase(type: string): number {
  return type === 'cow' ? 150 : type === 'pig' ? 320 : type === 'chicken' ? 900
    : type === 'sheep' ? 460 : type === 'bat' ? 3200 : type === 'skeleton' ? 240
    : type === 'zombie' ? 150 : type === 'spider' ? 700 : type === 'slime' ? 260
    : type === 'wraith' ? 520 : 300;
}

function animalSound(type: string, event: 'idle' | 'hurt' | 'death', vol: number): void {
  if (!ctx) return;
  const t = now(); const V = vol; const base = animalBase(type);
  if (event === 'hurt') {
    vibTone('sawtooth', base * 1.5, base * 0.6, t, 0.15, 0.22 * V, base * 3 + 400);
    noise(t, 0.05, 0.09 * V, 'bandpass', base * 2 + 300, 1);
    return;
  }
  if (event === 'death') {
    vibTone('sawtooth', base * 1.1, base * 0.3, t, 0.5, 0.22 * V, base * 2.4 + 300, 7, base * 0.05);
    noise(t, 0.25, 0.09 * V, 'lowpass', base * 3 + 400, 0.8);
    return;
  }
  // idle: sonido característico y realista de cada animal
  switch (type) {
    case 'cow': // muuuuu: grave, largo, con caída
      noise(t, 0.05, 0.05 * V, 'bandpass', 500, 1.2);
      vibTone('sawtooth', 150, 92, t + 0.02, 0.9, 0.17 * V, 480, 5, 6);
      vibTone('sine', 74, 50, t + 0.02, 0.9, 0.07 * V, 240);
      break;
    case 'pig': // oink oink oink: nasal, entrecortado
      for (let i = 0; i < 3; i++) { const tt = t + i * 0.14; vibTone('sawtooth', 300, 150, tt, 0.09, 0.16 * V, 1100, 55, 40); noise(tt, 0.06, 0.06 * V, 'bandpass', 950, 2.2); }
      break;
    case 'chicken': // cloc cloc cloc... cocoroc: agudo y percusivo
      for (let i = 0; i < 3; i++) { const tt = t + i * 0.1; noise(tt, 0.03, 0.13 * V, 'bandpass', 1500, 3); vibTone('square', 1200, 900, tt, 0.035, 0.09 * V, 3000); }
      vibTone('square', 700, 1500, t + 0.34, 0.16, 0.12 * V, 3000, 20, 60);
      noise(t + 0.34, 0.1, 0.06 * V, 'bandpass', 2000, 2);
      break;
    case 'sheep': // beeeee: medio, con temblor marcado (balido)
      noise(t, 0.04, 0.06 * V, 'bandpass', 900, 1.5);
      vibTone('sawtooth', 470, 400, t + 0.03, 0.55, 0.15 * V, 1500, 16, 42);
      vibTone('sawtooth', 235, 200, t + 0.03, 0.55, 0.05 * V, 800, 16, 20);
      break;
    case 'bat': // dos chillidos agudos
      vibTone('sine', 5200, 7200, t, 0.05, 0.09 * V);
      vibTone('sine', 4800, 6600, t + 0.07, 0.045, 0.07 * V);
      break;
    // --- Enemigos ---
    case 'skeleton': // castañeteo de huesos
      for (let i = 0; i < 4; i++) { const tt = t + i * 0.07; noise(tt, 0.02, 0.12 * V, 'bandpass', 2200, 6); tone('square', 300, 260, tt, 0.02, 0.05 * V, 2000); }
      break;
    case 'zombie': // gruñido gutural largo
      vibTone('sawtooth', 150, 95, t, 0.6, 0.16 * V, 500, 9, 14);
      noise(t, 0.5, 0.05 * V, 'lowpass', 600, 0.8);
      break;
    case 'spider': // siseo/chasquido rápido
      noise(t, 0.16, 0.12 * V, 'highpass', 4200, 0.7);
      for (let i = 0; i < 3; i++) tone('square', 900, 700, t + i * 0.05, 0.02, 0.05 * V, 3000);
      break;
    case 'slime': // "splat" blando y burbujeante
      vibTone('sine', 260, 120, t, 0.22, 0.15 * V, 700, 22, 60);
      noise(t, 0.12, 0.08 * V, 'lowpass', 900, 0.6);
      break;
    case 'wraith': // gemido etéreo y agudo
      vibTone('sine', 520, 760, t, 0.7, 0.13 * V, 2200, 6, 40);
      vibTone('sine', 780, 1140, t + 0.05, 0.6, 0.06 * V, 3000, 6, 30);
      break;
    default: // aldeano: "hmm"
      vibTone('sine', 200, 165, t, 0.28, 0.12 * V, 800);
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
  else if (p[0] === 'bow') { // disparo del arco: cuerda + silbido de la flecha
    const t = now();
    tone('triangle', 380, 140, t, 0.09, 0.12 * gain, 1400);
    noise(t + 0.01, 0.16, 0.10 * gain, 'highpass', 2600, 0.7);
  }
  else if (p[0] === 'fish') {
    const t = now();
    if (p[1] === 'cast') { noise(t, 0.14, 0.12 * gain, 'lowpass', 900, 0.7); tone('sine', 500, 240, t, 0.1, 0.07 * gain, 800); }
    else { noise(t, 0.18, 0.14 * gain, 'lowpass', 1200, 0.6); tone('sine', 700, 1100, t + 0.05, 0.14, 0.1 * gain, 3000); } // catch: chapoteo + repique
  }
  else if (p[0] === 'player') { // el jugador recibe daño: gruñido grave
    const t = now();
    tone('sawtooth', 260, 150, t, 0.16, 0.16 * gain, 900);
    noise(t, 0.06, 0.08 * gain, 'bandpass', 500, 1.2);
  }
  else if (p[0] === 'cave') { // bajar/subir: retumbo grave con eco (pasos que descienden)
    const t = now();
    if (p[1] === 'descend') { tone('sine', 300, 90, t, 0.9, 0.14 * gain, 600); noise(t, 0.7, 0.06 * gain, 'lowpass', 420, 0.7); tone('sine', 150, 60, t + 0.1, 0.8, 0.06 * gain, 300); }
    else { tone('sine', 110, 320, t, 0.9, 0.13 * gain, 900); noise(t, 0.6, 0.05 * gain, 'lowpass', 700, 0.7); }
  }
}
