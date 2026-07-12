// Música ambiental relajante generada con Web Audio (pads suaves en bucle).
// Sin archivos externos. Debe arrancar tras un gesto del usuario (click en el menú).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: number | null = null;
let on = false;
let step = 0;

// Progresión suave (acordes tipo Am - G - F - C, frecuencias en Hz)
const CHORDS = [
  [220.0, 261.63, 329.63],
  [196.0, 246.94, 293.66],
  [174.61, 220.0, 261.63],
  [261.63, 329.63, 392.0],
];

export function isMusicOn(): boolean {
  return on;
}

export function startMusic(): void {
  if (on) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 2);
    on = true;
    step = 0;
    playChord();
    timer = window.setInterval(playChord, 7000);
  } catch {
    /* audio no disponible */
  }
}

function playChord(): void {
  if (!ctx || !master || !on) return;
  const chord = CHORDS[step % CHORDS.length];
  step++;
  const now = ctx.currentTime;
  for (const f of chord) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const shimmer = ctx.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.value = f * 2;
    const g = ctx.createGain();
    g.gain.value = 0;
    const sg = ctx.createGain();
    sg.gain.value = 0.25;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 850;
    osc.connect(g);
    shimmer.connect(sg);
    sg.connect(g);
    g.connect(filt);
    filt.connect(master);
    g.gain.linearRampToValueAtTime(0.14, now + 1.6);
    g.gain.linearRampToValueAtTime(0.0, now + 7);
    osc.start(now);
    shimmer.start(now);
    osc.stop(now + 7.3);
    shimmer.stop(now + 7.3);
  }
}

export function stopMusic(): void {
  on = false;
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  if (master && ctx) master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
}

export function toggleMusic(): void {
  if (on) stopMusic();
  else startMusic();
}
