// sound_synth.js - Sintetizador de audio 100% procedural en Web Audio API (ES5 estricto para WebKit / Tizen 2015).
(function(window) {
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var isMuted = false;
  var masterVolume = 0.75;

  function initAudio() {
    if (!ctx && AudioCtx) {
      try {
        ctx = new AudioCtx();
      } catch (e) {
        console.warn("Web Audio API no soportado:", e);
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  // Activar contexto de audio al primer clic o tecla (requerido por políticas de navegadores)
  window.addEventListener('keydown', initAudio, false);
  window.addEventListener('click', initAudio, false);
  window.addEventListener('touchstart', initAudio, false);

  function createNoiseBuffer(duration) {
    if (!ctx) return null;
    var sampleRate = ctx.sampleRate || 44100;
    var bufferSize = sampleRate * duration;
    var buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    var output = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  var SoundSynth = {
    init: initAudio,

    setVolume: function(vol) {
      masterVolume = Math.max(0, Math.min(1, vol));
    },

    getVolume: function() {
      return masterVolume;
    },

    toggleMute: function() {
      isMuted = !isMuted;
      return isMuted;
    },

    isMuted: function() {
      return isMuted;
    },

    playCannon: function() {
      if (!ctx || isMuted || masterVolume <= 0.01) return;
      initAudio();
      var now = ctx.currentTime;

      // 1. Tono descendente grave
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.45);

      gain.gain.setValueAtTime(0.8 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.46);

      // 2. Ruido blanco de explosión corto
      var noiseBuf = createNoiseBuffer(0.18);
      if (noiseBuf) {
        var noise = ctx.createBufferSource();
        var noiseGain = ctx.createGain();

        noise.buffer = noiseBuf;
        noiseGain.gain.setValueAtTime(0.6 * masterVolume, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        noise.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        noise.start(now);
      }
    },

    playHit: function() {
      if (!ctx || isMuted || masterVolume <= 0.01) return;
      initAudio();
      var now = ctx.currentTime;

      var osc = ctx.createOscillator();
      var gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.22);

      gain.gain.setValueAtTime(0.7 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.23);
    },

    playPickup: function() {
      if (!ctx || isMuted || masterVolume <= 0.01) return;
      initAudio();
      var now = ctx.currentTime;

      // Nota 1: Do5 (523.25 Hz)
      var osc1 = ctx.createOscillator();
      var gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.5 * masterVolume, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.13);

      // Nota 2: Mi5 (659.25 Hz)
      var osc2 = ctx.createOscillator();
      var gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.10);
      gain2.gain.setValueAtTime(0.55 * masterVolume, now + 0.10);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.10);
      osc2.stop(now + 0.33);
    },

    playSplash: function() {
      if (!ctx || isMuted || masterVolume <= 0.01) return;
      initAudio();
      var now = ctx.currentTime;

      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.85);
      gain.gain.setValueAtTime(0.6 * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.86);

      var noiseBuf = createNoiseBuffer(0.7);
      if (noiseBuf) {
        var noise = ctx.createBufferSource();
        var noiseGain = ctx.createGain();
        noise.buffer = noiseBuf;
        noiseGain.gain.setValueAtTime(0.4 * masterVolume, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        noise.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);
      }
    },

    playCountdown: function(isFinal) {
      if (!ctx || isMuted || masterVolume <= 0.01) return;
      initAudio();
      var now = ctx.currentTime;

      var osc = ctx.createOscillator();
      var gain = ctx.createGain();

      osc.type = 'sine';
      var freq = isFinal ? 880 : 440;
      var dur = isFinal ? 0.45 : 0.14;

      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime((isFinal ? 0.7 : 0.5) * masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + dur + 0.01);
    },

    playFanfare: function() {
      if (!ctx || isMuted || masterVolume <= 0.01) return;
      initAudio();
      var now = ctx.currentTime;

      // Notas de Cumpleaños / Fanfarria Triunfal:
      // G4 (392Hz), G4 (392Hz), A4 (440Hz), G4 (392Hz), C5 (523.25Hz), B4 (493.88Hz)
      var notes = [
        { f: 392.00, d: 0.18, pause: 0.03 },
        { f: 392.00, d: 0.18, pause: 0.03 },
        { f: 440.00, d: 0.35, pause: 0.04 },
        { f: 392.00, d: 0.35, pause: 0.04 },
        { f: 523.25, d: 0.38, pause: 0.04 },
        { f: 493.88, d: 0.65, pause: 0.05 }
      ];

      var timeCursor = now;
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();

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
    }
  };

  window.SoundSynth = SoundSynth;
})(window);
