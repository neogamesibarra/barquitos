import { gameEvents } from "./engine/events.js";
// sound_synth.js - Sintetizador de audio 100% procedural en Web Audio API.
const AudioCtx = window.AudioContext;
let ctx = null;
let isMuted = false;
let masterVolume = 0.75;

function initAudio() {
  if (!ctx && AudioCtx) {
    try {
      ctx = new AudioCtx();
    } catch (e) {
      console.warn("Web Audio API no soportado:", e);
    }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(error => console.warn("No se pudo reanudar el audio:", error));
  }
}

// Activar contexto de audio al primer clic o tecla (requerido por políticas de navegadores)
window.addEventListener('keydown', initAudio, false);
window.addEventListener('click', initAudio, false);
window.addEventListener('touchstart', initAudio, false);

const cachedNoiseBuffers = {};
function createNoiseBuffer(duration) {
  if (!ctx) return null;
  const durKey = Math.round(duration * 100);
  if (cachedNoiseBuffers[durKey]) {
    return cachedNoiseBuffers[durKey];
  }
  const sampleRate = ctx.sampleRate || 44100;
  const bufferSize = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  cachedNoiseBuffers[durKey] = buffer;
  return buffer;
}

// Limitador de polifonía para evitar saturación de CPU y saturación de audio
const lastSoundTimes = {};
function canPlay(type, cooldownMs) {
  const cd = cooldownMs || 50;
  const now = Date.now();
  if (lastSoundTimes[type] && (now - lastSoundTimes[type] < cd)) {
    return false;
  }
  lastSoundTimes[type] = now;
  return true;
}

function scheduleCleanup(nodes, delaySec) {
  setTimeout(() => {
    if (!nodes) return;
    for (let i = 0; i < nodes.length; i++) {
      try {
        if (nodes[i] && nodes[i].disconnect) nodes[i].disconnect();
      } catch(e) {}
    }
  }, Math.ceil((delaySec + 0.05) * 1000));
}

const SoundSynth = {
  init: initAudio,

  setVolume: (vol) => {
    masterVolume = Math.max(0, Math.min(1, vol));
  },

  getVolume: () => {
    return masterVolume;
  },

  toggleMute: () => {
    isMuted = !isMuted;
    return isMuted;
  },

  isMuted: () => {
    return isMuted;
  },

  playCannon: () => {
    if (!ctx || isMuted || masterVolume <= 0.01) return;
    if (!canPlay('cannon', 50)) return;
    initAudio();
    const now = ctx.currentTime;

    // 1. Tono descendente grave
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.45);

    gain.gain.setValueAtTime(0.8 * masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.46);
    scheduleCleanup([osc, gain], 0.50);

    // 2. Ruido blanco de explosión corto
    const noiseBuf = createNoiseBuffer(0.18);
    if (noiseBuf) {
      const noise = ctx.createBufferSource();
      const noiseGain = ctx.createGain();

      noise.buffer = noiseBuf;
      noiseGain.gain.setValueAtTime(0.6 * masterVolume, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.19);
      scheduleCleanup([noise, noiseGain], 0.22);
    }
  },

  playHit: () => {
    if (!ctx || isMuted || masterVolume <= 0.01) return;
    if (!canPlay('hit', 40)) return;
    initAudio();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.22);

    gain.gain.setValueAtTime(0.7 * masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.23);
    scheduleCleanup([osc, gain], 0.25);
  },

  playPickup: () => {
    if (!ctx || isMuted || masterVolume <= 0.01) return;
    if (!canPlay('pickup', 50)) return;
    initAudio();
    const now = ctx.currentTime;

    // Nota 1: Do5 (523.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.5 * masterVolume, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.13);
    scheduleCleanup([osc1, gain1], 0.15);

    // Nota 2: Mi5 (659.25 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.10);
    gain2.gain.setValueAtTime(0.55 * masterVolume, now + 0.10);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.10);
    osc2.stop(now + 0.33);
    scheduleCleanup([osc2, gain2], 0.35);
  },

  playSplash: () => {
    if (!ctx || isMuted || masterVolume <= 0.01) return;
    if (!canPlay('splash', 60)) return;
    initAudio();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.85);
    gain.gain.setValueAtTime(0.6 * masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.86);
    scheduleCleanup([osc, gain], 0.90);

    const noiseBuf = createNoiseBuffer(0.7);
    if (noiseBuf) {
      const noise = ctx.createBufferSource();
      const noiseGain = ctx.createGain();
      noise.buffer = noiseBuf;
      noiseGain.gain.setValueAtTime(0.4 * masterVolume, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.72);
      scheduleCleanup([noise, noiseGain], 0.75);
    }
  },

  playCountdown: (isFinal) => {
    if (!ctx || isMuted || masterVolume <= 0.01) return;
    initAudio();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const freq = isFinal ? 880 : 440;
    const dur = isFinal ? 0.45 : 0.14;

    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime((isFinal ? 0.7 : 0.5) * masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.01);
  },

  playFanfare: () => {
    if (!ctx || isMuted || masterVolume <= 0.01) return;
    initAudio();
    const now = ctx.currentTime;

    // Notas de Cumpleaños / Fanfarria Triunfal:
    // G4 (392Hz), G4 (392Hz), A4 (440Hz), G4 (392Hz), C5 (523.25Hz), B4 (493.88Hz)
    const notes = [
      { f: 392.00, d: 0.18, pause: 0.03 },
      { f: 392.00, d: 0.18, pause: 0.03 },
      { f: 440.00, d: 0.35, pause: 0.04 },
      { f: 392.00, d: 0.35, pause: 0.04 },
      { f: 523.25, d: 0.38, pause: 0.04 },
      { f: 493.88, d: 0.65, pause: 0.05 }
    ];

    let timeCursor = now;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, timeCursor);

      gain.gain.setValueAtTime(0.65 * masterVolume, timeCursor);
      gain.gain.exponentialRampToValueAtTime(0.001, timeCursor + n.d);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(timeCursor);
      osc.stop(timeCursor + n.d + 0.01);

      timeCursor += n.d + n.pause;
    }
  },

  // Impacto seco contra roca / isla
  playIslandThud: () => {
    if (!ctx || isMuted || masterVolume <= 0.01) return;
    if (!canPlay('thud', 60)) return;
    initAudio();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

    gain.gain.setValueAtTime(0.75 * masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
    scheduleCleanup([osc, gain], 0.18);

    const noiseBuf = createNoiseBuffer(0.08);
    if (noiseBuf) {
      const noise = ctx.createBufferSource();
      const noiseGain = ctx.createGain();
      noise.buffer = noiseBuf;
      noiseGain.gain.setValueAtTime(0.4 * masterVolume, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.09);
      scheduleCleanup([noise, noiseGain], 0.12);
    }
  },

  // Chime mágico para recolección de mejoras globales (Pack-a-Punch / Power-ups)
  playPowerup: () => {
    if (!ctx || isMuted || masterVolume <= 0.01) return;
    if (!canPlay('powerup', 60)) return;
    initAudio();
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    for (let i = 0; i < notes.length; i++) {
      const t = now + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], t);

      gain.gain.setValueAtTime(0.5 * masterVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.23);
      scheduleCleanup([osc, gain], 0.28 + i * 0.07);
    }
  },

  // Cuerno pirata al inicio de cada oleada en Horda Zombie
  playWaveStart: () => {
    if (isMuted || masterVolume <= 0.01) return;
    initAudio();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(174.61, now); // F3
    osc.frequency.linearRampToValueAtTime(196.00, now + 0.25); // G3
    osc.frequency.exponentialRampToValueAtTime(164.81, now + 0.85); // E3

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.6 * masterVolume, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.92);
  },

  // Cuerno de guerra oscuro para advertencia del Galeón Jefe Final
  playBossAlert: () => {
    if (isMuted || masterVolume <= 0.01) return;
    initAudio();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(98.00, now); // G2 muy grave
    osc.frequency.exponentialRampToValueAtTime(82.41, now + 1.3); // E2

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.85 * masterVolume, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.42);
  }
};

gameEvents.on('ship:fired', SoundSynth.playCannon);
gameEvents.on('ship:hit', SoundSynth.playHit);
gameEvents.on('ship:sunk', SoundSynth.playSplash);
gameEvents.on('round:start', SoundSynth.init);
gameEvents.on('round:end', celebrate => { if (celebrate) SoundSynth.playFanfare(); });
gameEvents.on('boss:spawn', SoundSynth.playBossAlert);
gameEvents.on('match:end', SoundSynth.playFanfare);
gameEvents.on('wave:start', SoundSynth.playWaveStart);
gameEvents.on('sound:powerup', SoundSynth.playPowerup);
gameEvents.on('sound:countdown', SoundSynth.playCountdown);
gameEvents.on('effect:island-impact', SoundSynth.playIslandThud);

export { SoundSynth };
