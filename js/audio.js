/* =====================================================================
   EduCraft — Chiptune audio (Web Audio, no files)
   A 4-channel NES-style synth: pulse lead, pulse arp, triangle bass,
   noise drums, driven by a lookahead step sequencer. Tracks are tiny
   note strings, so adding a tune is a one-liner. iOS requires a user
   gesture before sound: call Audio.unlock() from a tap handler.
   ===================================================================== */
(function () {
  'use strict';
  let ctx = null, master, musicGain, sfxGain, noiseBuf, distIn;
  let muted = false; try { muted = localStorage.getItem('educraft.mute') === '1'; } catch (e) { /* ignore */ }
  let current = null, timer = null, nextTime = 0, step = 0;
  const LOOKAHEAD = 0.12, TICK = 25;

  const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  function midi(n) { const m = /^([A-G][#b]?)(\d)$/.exec(n); return 12 * (parseInt(m[2], 10) + 1) + NOTE[m[1]]; }
  function freq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // ---------- tracks ----------
  // lead/arp notes are per 16th step; '-' = rest, '.' = hold previous. roots = chord root per bar (8 steps).
  const TRACKS = {
    title:  { bpm: 140, roots: ['C3', 'A2', 'F2', 'G2'],
      lead: 'C5 . E5 . G5 . . . A5 . G5 . E5 . . . F5 . A5 . C6 . . . G5 . E5 . C5 . . .', drums: 'K-H-S-H-K-H-S-HH' },
    world1: { bpm: 160, roots: ['C3', 'A2', 'F2', 'G2'],
      lead: 'E5 . G5 . A5 . G5 E5 . D5 . C5 . D5 . E5 . E5 . G5 A5 B5 . A5 G5 E5 . D5 . C5 . . .', drums: 'K-H-S-H-K-H-S-HH' },
    world2: { bpm: 150, roots: ['E2', 'C3', 'D3', 'B2'],
      lead: 'E4 . . G4 . . B4 . A4 . G4 . E4 . . . D4 . . F#4 . . A4 . B4 . A4 . G4 . . .', drums: 'K--HS--HK--HS-HH' },
    world3: { bpm: 172, roots: ['A2', 'F2', 'G2', 'E2'],
      lead: 'A5 . A5 . C6 . B5 A5 G5 . . E5 . G5 . A5 . . . F5 . E5 . D5 . C5 . D5 . E5 . . .', drums: 'KKH-S-H-K-HKS-HH' },
    world4: { bpm: 165, roots: ['D3', 'B2', 'G2', 'A2'],
      lead: 'D5 . F#5 . A5 . D6 . C#6 . A5 . F#5 . . . B5 . A5 . F#5 . D5 . E5 . F#5 . A5 . . .', drums: 'K-H-S-H-K-H-S-HH' },
    boss:   { bpm: 182, roots: ['E2', 'E2', 'C3', 'B2'],
      lead: 'E5 . E5 . F5 . E5 . D#5 . E5 . B4 . . . E5 . G5 . F#5 . F5 . E5 . D5 . B4 . . .', drums: 'KKH-S-HKK-H-S-SS' },
    metal:  { bpm: 200, metal: true, roots: ['E2', 'E2', 'G2', 'F2', 'E2', 'E2', 'Bb2', 'A2'],
      lead: 'E5 . E5 G5 E5 . D5 E5 Bb4 . A4 . G4 . Bb4 . E5 . E5 G5 E5 . D5 E5 G5 . Bb5 . A5 G5 E5 .', drums: 'KKSKKKSKKKSKKKSS' },
    victory: { bpm: 150, roots: ['C3', 'G2'], once: true,
      lead: 'C5 . E5 . G5 . C6 . G5 . C6 . . . . .', drums: 'K-S-K-S-K-SSK---' },
  };

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.45; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.7; sfxGain.connect(master);
    // distortion chain for the metal track
    const ws = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 6); } ws.curve = curve; ws.oversample = '2x';
    distIn = ctx.createGain(); distIn.gain.value = 1; const distOut = ctx.createGain(); distOut.gain.value = 0.22; distIn.connect(ws); ws.connect(distOut); distOut.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function unlock() { if (!ensure()) return; if (ctx.state === 'suspended') ctx.resume(); }

  // ---------- voices ----------
  function pulse(f, t, dur, vol, out, type) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out || sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }
  function sweep(f0, f1, t, dur, vol, type, out) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(out || sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(t, dur, vol, hp, out) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp ? 6000 : 1800;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(out || sfxGain); s.start(t); s.stop(t + dur + 0.02);
  }

  // ---------- sequencer ----------
  function parse(str) { return str.trim().split(/\s+/); }
  function schedule() {
    if (!current) return;
    const tr = current, spb = 60 / tr.bpm / 4; // seconds per 16th
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      const i = step % tr.leadArr.length;
      if (tr.once && step >= tr.leadArr.length) { stop(); return; }
      const t = nextTime;
      // lead
      const n = tr.leadArr[i];
      const bar = Math.floor(i / 8) % tr.roots.length, root = midi(tr.roots[bar]);
      if (tr.metal) {
        if (n !== '-' && n !== '.') { let len = 1; for (let k = i + 1; k < tr.leadArr.length && tr.leadArr[k] === '.'; k++) len++; pulse(freq(midi(n)), t, spb * len * 0.95, 0.5, distIn, 'sawtooth'); pulse(freq(midi(n)) * 1.005, t, spb * len * 0.95, 0.4, distIn, 'sawtooth'); }
        // palm-muted power-chord chugs on every 16th
        pulse(freq(root), t, spb * 0.55, 0.6, distIn, 'sawtooth'); pulse(freq(root + 7), t, spb * 0.55, 0.4, distIn, 'sawtooth');
      } else {
        if (n !== '-' && n !== '.') { let len = 1; for (let k = i + 1; k < tr.leadArr.length && tr.leadArr[k] === '.'; k++) len++; pulse(freq(midi(n)), t, spb * len * 0.95, 0.09, musicGain, 'square'); }
        // bass: root / octave alternating eighths
        if (i % 2 === 0) pulse(freq(root + ((i % 4) === 2 ? 12 : 0)), t, spb * 1.8, 0.16, musicGain, 'triangle');
        // arp: root, 5th, octave on 16ths, quiet
        const arpN = [root + 12, root + 19, root + 24, root + 19][i % 4];
        pulse(freq(arpN), t, spb * 0.8, 0.028, musicGain, 'square');
      }
      // drums
      const dch = tr.drums[i % tr.drums.length];
      if (dch === 'K') sweep(150, 40, t, 0.12, 0.5, 'sine', musicGain);
      else if (dch === 'S') { noise(t, 0.12, 0.35, false, musicGain); pulse(180, t, 0.08, 0.12, musicGain, 'triangle'); }
      else if (dch === 'H') noise(t, 0.03, 0.18, true, musicGain);
      nextTime += spb; step++;
    }
  }
  function play(name) {
    if (!ctx) return; // nothing until the first tap unlocks audio
    const tr = TRACKS[name]; if (!tr) return;
    if (current && current.name === name) return;
    stop();
    current = Object.assign({ name, leadArr: parse(tr.lead) }, tr);
    step = 0; nextTime = ctx.currentTime + 0.05;
    timer = setInterval(schedule, TICK); schedule();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; current = null; }
  function playing() { return current ? current.name : null; }

  // ---------- SFX ----------
  const SFX = {
    swing: (t) => { noise(t, 0.08, 0.25, true); sweep(900, 300, t, 0.08, 0.08, 'square'); },
    hit: (t) => { sweep(520, 160, t, 0.09, 0.18, 'square'); noise(t, 0.05, 0.2, false); },
    hurt: (t) => { sweep(220, 60, t, 0.25, 0.25, 'square'); noise(t, 0.15, 0.3, false); },
    shoot: (t) => { sweep(1200, 500, t, 0.1, 0.12, 'square'); },
    fire: (t) => { noise(t, 0.2, 0.25, false); sweep(400, 120, t, 0.2, 0.1, 'sawtooth'); },
    explode: (t) => { noise(t, 0.4, 0.5, false); sweep(120, 30, t, 0.35, 0.4, 'sine'); },
    coin: (t) => { pulse(988, t, 0.07, 0.18); pulse(1319, t + 0.07, 0.18, 0.18); },
    correct: (t) => { [523, 659, 784, 1047].forEach((f, i) => pulse(f, t + i * 0.07, 0.14, 0.16)); },
    wrong: (t) => { sweep(300, 150, t, 0.25, 0.18, 'square'); sweep(280, 140, t + 0.12, 0.3, 0.18, 'square'); },
    portal: (t) => { sweep(200, 1600, t, 0.5, 0.15, 'triangle'); [660, 880, 1320].forEach((f, i) => pulse(f, t + 0.3 + i * 0.08, 0.16, 0.1)); },
    chest: (t) => { [523, 659, 784, 1047, 1319].forEach((f, i) => pulse(f, t + i * 0.06, 0.12, 0.14)); },
    heart: (t) => { pulse(784, t, 0.08, 0.14); pulse(1047, t + 0.08, 0.12, 0.14); },
    buy: (t) => { pulse(659, t, 0.08, 0.14); pulse(880, t + 0.08, 0.08, 0.14); pulse(1319, t + 0.16, 0.16, 0.14); },
    roar: (t) => { sweep(80, 200, t, 0.5, 0.4, 'sawtooth'); noise(t, 0.5, 0.3, false); sweep(200, 60, t + 0.5, 0.5, 0.4, 'sawtooth'); },
    tap: (t) => { pulse(880, t, 0.04, 0.1); },
    thunder: (t) => { noise(t, 0.6, 0.7, false); sweep(90, 30, t, 0.6, 0.6, 'sawtooth'); noise(t + 0.15, 0.4, 0.4, true); },
    teleport: (t) => { sweep(1800, 200, t, 0.18, 0.15, 'square'); sweep(200, 1800, t + 0.18, 0.18, 0.15, 'square'); },
    charge: (t) => { sweep(200, 1400, t, 0.7, 0.12, 'sawtooth'); },
    riddle: (t) => { [392, 523, 659].forEach((f, i) => pulse(f, t + i * 0.1, 0.25, 0.12, null, 'triangle')); },
  };
  function sfx(name) { if (!ctx || muted) return; const f = SFX[name]; if (f) f(ctx.currentTime); }

  function setMuted(m) { muted = !!m; try { localStorage.setItem('educraft.mute', muted ? '1' : '0'); } catch (e) { /* ignore */ } if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02); }
  function toggleMute() { setMuted(!muted); return muted; }
  function isMuted() { return muted; }

  window.Audio2 = { unlock, play, stop, playing, sfx, toggleMute, isMuted, setMuted };
})();
