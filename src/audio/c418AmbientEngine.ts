/**
 * c418AmbientEngine.ts — C418 / Minecraft Ambient Soundtrack
 *
 * Generative background atmosphere for the C418 sound profile.
 * Runs independently of pixel playback — no shared state with c418Engine.ts.
 *
 * Layers:
 *   1. Cave Hum      — ultra-low brown noise through narrow bandpass, barely audible
 *   2. Night Crickets — high filtered white noise with slow pulse, Minecraft night feel
 *   3. Distant Piano  — sparse random pentatonic sine-plonk notes, every 8–20s
 *   4. Ambient Chime  — single soft bell note fading from silence, every 30–60s
 *   5. Animal Sounds  — synthetic cow, pig, chicken at random long intervals
 */

import { getCtx } from './audioEngine';

// ─── Pentatonic pitch set (C3–C5, same as c418Engine) ────────────────────────

const C418_PENTATONIC_MIDI = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72];

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const PENTATONIC_HZ = C418_PENTATONIC_MIDI.map(midiToHz);

function randPentatonic(): number {
  return PENTATONIC_HZ[Math.floor(Math.random() * PENTATONIC_HZ.length)];
}

// ─── Module-level teardown state ─────────────────────────────────────────────

let c418AmbientMasterGain: GainNode | null = null;
let c418AmbientCtx: AudioContext | null = null;
let c418AmbientRunning = false;

const activeOscillators: OscillatorNode[] = [];
const activeBufferSources: AudioBufferSourceNode[] = [];
const activeIntervals: ReturnType<typeof setInterval>[] = [];
const activeTimers:    ReturnType<typeof setTimeout>[]  = [];

function trackOsc(o: OscillatorNode)            { activeOscillators.push(o); }
function trackSrc(s: AudioBufferSourceNode)     { activeBufferSources.push(s); }
function trackInterval(id: ReturnType<typeof setInterval>) { activeIntervals.push(id); }
function trackTimer(id: ReturnType<typeof setTimeout>)     { activeTimers.push(id); }

// ─── Noise helpers ────────────────────────────────────────────────────────────

function makeWhiteNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function makeBrownNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    prev = Math.max(-1, Math.min(1, prev + (Math.random() * 2 - 1) * 0.02));
    d[i] = prev * 0.08;
  }
  return buf;
}

// ─── Layer 1: Cave Hum ────────────────────────────────────────────────────────
// Ultra-low brown noise through a very narrow bandpass at ~55Hz.
// Barely audible — the subconscious presence of being underground.

function buildCaveHum(ctx: AudioContext, dest: GainNode) {
  const t = ctx.currentTime;

  const src = ctx.createBufferSource();
  src.buffer = makeBrownNoise(ctx, 3);
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(55, t);
  bp.Q.setValueAtTime(4.0, t);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(120, t);
  lp.Q.setValueAtTime(0.5, t);

  const layerGain = ctx.createGain();
  layerGain.gain.setValueAtTime(0.22, t);

  src.connect(bp);
  bp.connect(lp);
  lp.connect(layerGain);
  layerGain.connect(dest);

  src.start(t);
  trackSrc(src);

  // Very slowly breathes between 50Hz and 65Hz
  let up = true;
  const id = setInterval(() => {
    if (!c418AmbientRunning) return;
    const now = ctx.currentTime;
    bp.frequency.exponentialRampToValueAtTime(up ? 65 : 50, now + 6);
    up = !up;
  }, 6000);
  trackInterval(id);
}

// ─── Layer 2: Cave Wind ───────────────────────────────────────────────────────
// Very gentle mid-low brown noise through a slowly drifting bandpass —
// like distant air moving through stone passages. No pulse, no rhythm.
// Sits just above the cave hum, completely unobtrusive.

function buildCaveWind(ctx: AudioContext, dest: GainNode) {
  const t = ctx.currentTime;

  // White noise — flat spectrum means the bandpass actually has energy to pass
  const src = ctx.createBufferSource();
  src.buffer = makeWhiteNoise(ctx, 3);
  src.loop = true;

  // Wide bandpass centered around 180Hz — low wind whoosh, not hiss
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(180, t);
  bp.Q.setValueAtTime(0.5, t); // wide Q so plenty of energy gets through

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(500, t);
  lp.Q.setValueAtTime(0.5, t);

  const layerGain = ctx.createGain();
  layerGain.gain.setValueAtTime(0.18, t);

  src.connect(bp);
  bp.connect(lp);
  lp.connect(layerGain);
  layerGain.connect(dest);

  src.start(t);
  trackSrc(src);

  // Extremely slow drift — bandpass wanders between 140Hz and 240Hz over ~20s
  let up = true;
  const id = setInterval(() => {
    if (!c418AmbientRunning) return;
    const now = ctx.currentTime;
    bp.frequency.exponentialRampToValueAtTime(up ? 240 : 140, now + 10);
    up = !up;
  }, 10000);
  trackInterval(id);
}

// ─── Layer 3: Distant Piano ───────────────────────────────────────────────────
// Sparse random pentatonic sine-plonk notes — the same voice character as
// the c418Engine circle shape but quieter and infrequent.
// Fires every 8–20 seconds with a random note from the pentatonic set.

function firePianoNote(ctx: AudioContext, dest: GainNode, freq: number, atTime: number) {
  const attack = 0.012;
  const decay  = 2.0; // long natural decay

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, atTime);
  osc1.detune.setValueAtTime(4, atTime);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, atTime);

  const env1 = ctx.createGain();
  env1.gain.setValueAtTime(0.0001, atTime);
  env1.gain.linearRampToValueAtTime(0.055, atTime + attack);
  env1.gain.exponentialRampToValueAtTime(0.0001, atTime + attack + decay);

  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.0001, atTime);
  env2.gain.linearRampToValueAtTime(0.008, atTime + attack);
  env2.gain.exponentialRampToValueAtTime(0.0001, atTime + attack + 0.5);

  // Gentle LPF — tape veil
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(2200, atTime);
  lpf.Q.setValueAtTime(0.4, atTime);

  osc1.connect(env1); env1.connect(lpf);
  osc2.connect(env2); env2.connect(lpf);
  lpf.connect(dest);

  const stopAt = atTime + attack + decay + 0.1;
  osc1.start(atTime); osc1.stop(stopAt);
  osc2.start(atTime); osc2.stop(atTime + attack + 0.6);

  trackOsc(osc1);
  trackOsc(osc2);
}

function schedulePianoNote(ctx: AudioContext, dest: GainNode) {
  if (!c418AmbientRunning) return;

  const freq = randPentatonic();
  // Occasionally play a soft two-note phrase (30% chance)
  firePianoNote(ctx, dest, freq, ctx.currentTime + 0.05);
  if (Math.random() < 0.3) {
    const freq2 = randPentatonic();
    firePianoNote(ctx, dest, freq2, ctx.currentTime + 0.05 + 0.6 + Math.random() * 0.4);
  }

  const nextDelay = 8000 + Math.random() * 12000;
  trackTimer(setTimeout(() => schedulePianoNote(ctx, dest), nextDelay));
}

function buildDistantPiano(ctx: AudioContext, dest: GainNode) {
  const layerGain = ctx.createGain();
  layerGain.gain.setValueAtTime(0.9, ctx.currentTime); // scaled by individual note gains
  layerGain.connect(dest);

  // First note fires after a short random delay so it doesn't hit on profile switch
  const initialDelay = 4000 + Math.random() * 8000;
  trackTimer(setTimeout(() => schedulePianoNote(ctx, layerGain), initialDelay));
}

// ─── Layer 4: Ambient Chime ───────────────────────────────────────────────────
// A single soft bell note that fades in from silence every 30–60 seconds.
// Very slow attack (800ms), long decay — like the "Sweden" intro opening note.

function fireAmbientChime(ctx: AudioContext, dest: GainNode) {
  if (!c418AmbientRunning) return;

  const freq   = randPentatonic() * 2; // high register
  const t      = ctx.currentTime + 0.1;
  const attack = 0.8;
  const decay  = 3.5;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  osc.detune.setValueAtTime(3, t);

  // Faint octave partial
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, t);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(0.045, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);

  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.0001, t);
  env2.gain.linearRampToValueAtTime(0.008, t + attack * 0.5);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + attack + 0.8);

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(3000, t);
  lpf.Q.setValueAtTime(0.5, t);

  osc.connect(env);   env.connect(lpf);
  osc2.connect(env2); env2.connect(lpf);
  lpf.connect(dest);

  const stopAt = t + attack + decay + 0.1;
  osc.start(t);  osc.stop(stopAt);
  osc2.start(t); osc2.stop(t + attack + 1.0);
  trackOsc(osc);
  trackOsc(osc2);

  const nextDelay = 30000 + Math.random() * 30000;
  trackTimer(setTimeout(() => fireAmbientChime(ctx, dest), nextDelay));
}

function buildAmbientChime(ctx: AudioContext, dest: GainNode) {
  const initialDelay = 15000 + Math.random() * 20000;
  trackTimer(setTimeout(() => fireAmbientChime(ctx, dest), initialDelay));
}

// ─── Layer 5: Animal Sounds ───────────────────────────────────────────────────
// Synthetic Minecraft animal calls — cow, pig, chicken — at sparse intervals.
// All modeled with oscillator + noise combinations to evoke rather than copy.

function fireCow(ctx: AudioContext, dest: GainNode, t: number) {
  // "Moo" — low sawtooth through a slowly closing LPF, then a higher moo
  const baseFreq = 90;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(baseFreq, t);
  osc.frequency.linearRampToValueAtTime(baseFreq * 0.85, t + 0.5); // droops down

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(800, t);
  lpf.frequency.exponentialRampToValueAtTime(300, t + 0.5);
  lpf.Q.setValueAtTime(2.0, t);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(0.09, t + 0.06);
  env.gain.setValueAtTime(0.09, t + 0.35);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);

  osc.connect(lpf); lpf.connect(env); env.connect(dest);
  osc.start(t); osc.stop(t + 0.6);
  trackOsc(osc);
}

function firePig(ctx: AudioContext, dest: GainNode, t: number) {
  // "Oink" — short nasal squeak, two pulses
  [0, 0.18].forEach((offset) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const f = 380 + Math.random() * 60;
    osc.frequency.setValueAtTime(f, t + offset);
    osc.frequency.exponentialRampToValueAtTime(f * 1.15, t + offset + 0.09);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, t + offset);
    bp.Q.setValueAtTime(3.0, t + offset);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t + offset);
    env.gain.linearRampToValueAtTime(0.07, t + offset + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.11);

    osc.connect(bp); bp.connect(env); env.connect(dest);
    osc.start(t + offset); osc.stop(t + offset + 0.14);
    trackOsc(osc);
  });
}

function fireChicken(ctx: AudioContext, dest: GainNode, t: number) {
  // "Bawk" — three short staccato chirps rising in pitch
  [0, 0.12, 0.22].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const f = 500 + i * 120;
    osc.frequency.setValueAtTime(f, t + offset);
    osc.frequency.exponentialRampToValueAtTime(f * 1.3, t + offset + 0.07);

    const noise = ctx.createBufferSource();
    noise.buffer = makeWhiteNoise(ctx, 0.12);

    const noiseBp = ctx.createBiquadFilter();
    noiseBp.type = 'bandpass';
    noiseBp.frequency.setValueAtTime(f * 2, t + offset);
    noiseBp.Q.setValueAtTime(5.0, t + offset);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, t + offset);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t + offset);
    env.gain.linearRampToValueAtTime(0.06, t + offset + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.09);

    osc.connect(env);
    noise.connect(noiseBp); noiseBp.connect(noiseGain); noiseGain.connect(env);
    env.connect(dest);

    osc.start(t + offset); osc.stop(t + offset + 0.10);
    noise.start(t + offset); noise.stop(t + offset + 0.12);
    trackOsc(osc);
    trackSrc(noise);
  });
}

type AnimalFn = (ctx: AudioContext, dest: GainNode, t: number) => void;
const ANIMALS: AnimalFn[] = [fireCow, firePig, fireChicken];

function scheduleAnimal(ctx: AudioContext, dest: GainNode) {
  if (!c418AmbientRunning) return;

  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  animal(ctx, dest, ctx.currentTime + 0.05);

  const nextDelay = 18000 + Math.random() * 24000; // every 18–42s
  trackTimer(setTimeout(() => scheduleAnimal(ctx, dest), nextDelay));
}

function buildAnimalSounds(ctx: AudioContext, dest: GainNode) {
  const layerGain = ctx.createGain();
  layerGain.gain.setValueAtTime(0.85, ctx.currentTime);
  layerGain.connect(dest);

  const initialDelay = 8000 + Math.random() * 12000;
  trackTimer(setTimeout(() => scheduleAnimal(ctx, layerGain), initialDelay));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startC418Ambient(): void {
  const ctx = getCtx();
  if (c418AmbientRunning && c418AmbientCtx === ctx) return;

  c418AmbientCtx    = ctx;
  c418AmbientRunning = true;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(1.0, now + 3.0); // 3s fade-in
  master.connect(ctx.destination);
  c418AmbientMasterGain = master;

  buildCaveHum(ctx, master);
  buildCaveWind(ctx, master);
  buildDistantPiano(ctx, master);
  buildAmbientChime(ctx, master);
  buildAnimalSounds(ctx, master);
}

export function stopC418Ambient(): void {
  c418AmbientRunning = false;

  // Clear all scheduled timers and intervals first
  activeIntervals.forEach(clearInterval);
  activeIntervals.length = 0;
  activeTimers.forEach(clearTimeout);
  activeTimers.length = 0;

  // Fade out master gain then disconnect everything
  if (c418AmbientMasterGain && c418AmbientCtx) {
    const now = c418AmbientCtx.currentTime;
    const gain = c418AmbientMasterGain;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0.0001, now + 2.0);

    setTimeout(() => {
      activeOscillators.forEach(o => { try { o.stop(); o.disconnect(); } catch { /* already stopped */ } });
      activeOscillators.length = 0;
      activeBufferSources.forEach(s => { try { s.stop(); s.disconnect(); } catch { /* already stopped */ } });
      activeBufferSources.length = 0;
      gain.disconnect();
      c418AmbientMasterGain = null;
      c418AmbientCtx = null;
    }, 2200);
  }
}
