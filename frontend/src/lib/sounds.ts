// Web Audio API sound engine — no files, no CDN, works offline
// All sounds are synthesized from oscillators + gain envelopes

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext();
  }
  return ctx;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.3,
  startDelay = 0,
) {
  const ac = getCtx();
  const osc  = ac.createOscillator();
  const gain = ac.createGain();

  osc.connect(gain);
  gain.connect(ac.destination);

  osc.type      = type;
  osc.frequency.setValueAtTime(frequency, ac.currentTime + startDelay);

  const t = ac.currentTime + startDelay;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export const sounds = {
  // Venta completada — ka-ching: acorde mayor ascendente
  sale() {
    playTone(523, 0.12, 'triangle', 0.25, 0);      // C5
    playTone(659, 0.12, 'triangle', 0.25, 0.10);   // E5
    playTone(784, 0.22, 'triangle', 0.30, 0.20);   // G5
    playTone(1047, 0.35, 'triangle', 0.22, 0.32);  // C6
  },

  // Código escaneado — beep corto y limpio
  scan() {
    playTone(1800, 0.08, 'square', 0.12, 0);
    playTone(2200, 0.10, 'square', 0.10, 0.07);
  },

  // Producto agregado al carrito — pop suave
  add() {
    playTone(880, 0.06, 'sine', 0.18, 0);
    playTone(1100, 0.08, 'sine', 0.12, 0.05);
  },

  // Error / stock agotado — tono bajo descendente
  error() {
    playTone(300, 0.15, 'sawtooth', 0.15, 0);
    playTone(220, 0.20, 'sawtooth', 0.12, 0.13);
  },

  // Escáner cerrado / cancelado
  cancel() {
    playTone(440, 0.10, 'sine', 0.12, 0);
    playTone(330, 0.15, 'sine', 0.10, 0.08);
  },
};
