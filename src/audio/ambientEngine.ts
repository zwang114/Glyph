/**
 * ambientEngine.ts — Forest Ambient Soundtrack System
 *
 * Fully generative, melodic ambient soundtrack inspired by a calm forest
 * with magical sprites. Runs independently of audioEngine.ts — no shared
 * state, no interference with pixel playback.
 *
 * Layers:
 *   1. Forest Bed   — brown noise, slowly breathing lowpass
 *   2. Running Water — white noise, wobbling bandpass LFO
 *   3. Bird Calls   — sporadic melodic sine sweeps
 *   4. Sprites      — pentatonic fairy chimes, occasionally clustered
 *   5. Mushroom Pulse — subliminal deep pulse, every 9-14 seconds
 */

import { getCtx } from './audioEngine';

// ─── Melodic pitch sets ───────────────────────────────────────────────────────

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Birds: bright upper pentatonic — C5 E5 G5 A5 C6
const BIRD_FREQS = [72, 76, 79, 81, 84].map(midiToHz);

// Sprites: full C major pentatonic C4-C6
const SPRITE_FREQS = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84].map(midiToHz);

// Mushroom: root and fifth only — A1, E2
const MUSHROOM_FREQS = [33, 40].map(midiToHz);

// ─── Module-level teardown state ─────────────────────────────────────────────

let masterGain: GainNode | null = null;
let ambientCtx: AudioContext | null = null;
let running = false;

const activeOscillators: OscillatorNode[] = [];
const activeBufferSources: AudioBufferSourceNode[] = [];
const activeIntervals: ReturnType<typeof setInterval>[] = [];
const activeTimers: ReturnType<typeof setTimeout>[] = [];

function trackOsc(o: OscillatorNode) { activeOscillators.push(o); }
function trackSrc(s: AudioBufferSourceNode) { activeBufferSources.push(s); }
function trackInterval(id: ReturnType<typeof setInterval>) { activeIntervals.push(id); }
function trackTimer(id: ReturnType<typeof setTimeout>) { activeTimers.push(id); }

// ─── Noise buffers ────────────────────────────────────────────────────────────

function makeWhiteNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function makeBrownNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let prev = 0;
  for (let i = 0; i < length; i++) {
    prev = Math.max(-1, Math.min(1, prev + (Math.random() * 2 - 1) * 0.02));
    data[i] = prev * 0.08;
  }
  return buf;
}

// ─── Layer 1: Forest Bed ─────────────────────────────────────────────────────

function buildForestBed(ctx: AudioContext, dest: GainNode) {
  const t = ctx.currentTime;

  const src = ctx.createBufferSource();
  src.buffer = makeBrownNoiseBuffer(ctx, 2);
  src.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(380, t);
  lp.Q.setValueAtTime(0.6, t);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(750, t);
  bp.Q.setValueAtTime(2.0, t);

  const layerGain = ctx.createGain();
  layerGain.gain.setValueAtTime(0.18, t);

  src.connect(lp);
  lp.connect(bp);
  bp.connect(layerGain);
  layerGain.connect(dest);

  src.start(t);
  trackSrc(src);

  let breatheUp = true;
  const breatheId = setInterval(() => {
    if (!running) return;
    const now = ctx.currentTime;
    const target = breatheUp ? 440 : 320;
    lp.frequency.exponentialRampToValueAtTime(target, now + 4);
    breatheUp = !breatheUp;
  }, 4000);
  trackInterval(breatheId);
}

// ─── Layer 2: Running Water ───────────────────────────────────────────────────

function buildWater(ctx: AudioContext, dest: GainNode) {
  const t = ctx.currentTime;

  const src = ctx.createBufferSource();
  src.buffer = makeWhiteNoiseBuffer(ctx, 2);
  src.loop = true;

  const bp1 = ctx.createBiquadFilter();
  bp1.type = 'bandpass';
  bp1.frequency.setValueAtTime(700, t);
  bp1.Q.setValueAtTime(3.5, t);

  const bp2 = ctx.createBiquadFilter();
  bp2.type = 'bandpass';
  bp2.frequency.setValueAtTime(1400, t);
  bp2.Q.setValueAtTime(2.0, t);

  const sparkleGain = ctx.createGain();
  sparkleGain.gain.setValueAtTime(0.4, t);

  const layerGain = ctx.createGain();
  layerGain.gain.setValueAtTime(0.12, t);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.25, t);
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.setValueAtTime(120, t);
  lfo.connect(lfoDepth);
  lfoDepth.connect(bp1.frequency);

  src.connect(bp1);
  bp1.connect(layerGain);
  src.connect(bp2);
  bp2.connect(sparkleGain);
  sparkleGain.connect(layerGain);
  layerGain.connect(dest);

  src.start(t);
  lfo.start(t);

  trackSrc(src);
  trackOsc(lfo);
}

// ─── Layer 3: Bird Calls ──────────────────────────────────────────────────────

function fireChirp(ctx: AudioContext, dest: GainNode, freq: number, atTime: number) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, atTime);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, atTime);
  env.gain.linearRampToValueAtTime(0.22, atTime + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.128);

  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.setValueAtTime(1200, atTime);

  osc.connect(env);
  env.connect(hpf);
  hpf.connect(dest);

  osc.start(atTime);
  osc.stop(atTime + 0.15);
  trackOsc(osc);
}

function scheduleChirp(ctx: AudioContext, dest: GainNode) {
  if (!running) return;

  const freq = BIRD_FREQS[Math.floor(Math.random() * BIRD_FREQS.length)];
  const t = ctx.currentTime + 0.02;

  fireChirp(ctx, dest, freq, t);

  if (Math.random() < 0.3) {
    fireChirp(ctx, dest, freq * 0.841, t + 0.18);
  }

  if (Math.random() < 0.15) {
    fireChirp(ctx, dest, freq, t);
    fireChirp(ctx, dest, freq * 0.841, t + 0.09);
    fireChirp(ctx, dest, freq * 0.667, t + 0.18);
  }

  const nextDelay = 2800 + Math.random() * 4200 + (Math.random() - 0.5) * 800;
  const tid = setTimeout(() => scheduleChirp(ctx, dest), nextDelay);
  trackTimer(tid);
}

function buildBirds(ctx: AudioContext, dest: GainNode) {
  const layerGain = ctx.createGain();
  layerGain.gain.setValueAtTime(0.14, ctx.currentTime);
  layerGain.connect(dest);

  const tid = setTimeout(() => scheduleChirp(ctx, layerGain), 1200 + Math.random() * 2000);
  trackTimer(tid);
}

// ─── Layer 4: Sprites / Fairies ───────────────────────────────────────────────

function fireSprite(ctx: AudioContext, dest: GainNode, freq: number, atTime: number) {
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, atTime);

  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(freq * 2.01, atTime);

  const vibrato = ctx.createOscillator();
  vibrato.type = 'sine';
  vibrato.frequency.setValueAtTime(5.5, atTime);
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.setValueAtTime(14, atTime);
  vibrato.connect(vibratoDepth);
  vibratoDepth.connect(osc1.detune);

  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.18, atTime);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.08, atTime);

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, atTime);
  voiceGain.gain.exponentialRampToValueAtTime(1.0, atTime + 0.006);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.006 + 0.18);

  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.setValueAtTime(800, atTime);

  osc1.connect(g1); g1.connect(voiceGain);
  osc2.connect(g2); g2.connect(voiceGain);
  voiceGain.connect(hpf);
  hpf.connect(dest);

  if (Math.random() < 0.2) {
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(freq * 4, atTime);
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.04, atTime);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.04);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(dest);
    shimmer.start(atTime);
    shimmer.stop(atTime + 0.05);
    trackOsc(shimmer);
  }

  const stopAt = atTime + 0.006 + 0.18 + 0.13;
  osc1.start(atTime); osc1.stop(stopAt);
  osc2.start(atTime); osc2.stop(stopAt);
  vibrato.start(atTime); vibrato.stop(stopAt);

  trackOsc(osc1);
  trackOsc(osc2);
  trackOsc(vibrato);
}

function scheduleSpriteEvent(ctx: AudioContext, dest: GainNode) {
  if (!running) return;

  const noteCount = Math.floor(Math.random() * 4) + 1;
  const ascending = Math.random() < 0.5;

  const shuffled = [...SPRITE_FREQS].sort(() => Math.random() - 0.5).slice(0, noteCount);
  shuffled.sort((a, b) => ascending ? a - b : b - a);

  const spacing = 0.06 + Math.random() * 0.06;
  shuffled.forEach((freq, i) => {
    const atTime = ctx.currentTime + 0.02 + i * spacing;
    fireSprite(ctx, dest, freq, atTime);
  });

  if (Math.random() < 0.25) {
    const clusterCount = Math.floor(Math.random() * 2) + 2;
    for (let c = 1; c < clusterCount; c++) {
      const clusterDelay = c * (120 + Math.random() * 160);
      const tid = setTimeout(() => {
        if (!running) return;
        const f = SPRITE_FREQS[Math.floor(Math.random() * SPRITE_FREQS.length)];
        fireSprite(ctx, dest, f, ctx.currentTime + 0.02);
      }, clusterDelay);
      trackTimer(tid);
    }
    const nextDelay = 6000 + Math.random() * 4000;
    const tid = setTimeout(() => scheduleSpriteEvent(ctx, dest), nextDelay);
    trackTimer(tid);
  } else {
    const nextDelay = 3000 + Math.random() * 5000;
    const tid = setTimeout(() => scheduleSpriteEvent(ctx, dest), nextDelay);
    trackTimer(tid);
  }
}

function buildSprites(ctx: AudioContext, dest: GainNode) {
  const layerGain = ctx.createGain();
  layerGain.gain.setValueAtTime(0.16, ctx.currentTime);
  layerGain.connect(dest);

  const tid = setTimeout(() => scheduleSpriteEvent(ctx, layerGain), 500 + Math.random() * 1500);
  trackTimer(tid);
}

// ─── Layer 5: Mushroom Pulse ──────────────────────────────────────────────────

function firePulse(ctx: AudioContext, dest: GainNode, includeFifth: boolean) {
  const t = ctx.currentTime + 0.02;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(120, t);

  const freqs = includeFifth ? MUSHROOM_FREQS : [MUSHROOM_FREQS[0]];
  freqs.forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.06, t + 0.8);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.8 + 1.2);

    osc.connect(env);
    env.connect(lp);

    osc.start(t);
    osc.stop(t + 0.8 + 1.2 + 0.1);
    trackOsc(osc);
  });

  lp.connect(dest);
}

function schedulePulse(ctx: AudioContext, dest: GainNode, triggerCount: number) {
  if (!running) return;

  firePulse(ctx, dest, triggerCount % 3 === 0);

  const nextDelay = 9000 + Math.random() * 5000;
  const tid = setTimeout(() => schedulePulse(ctx, dest, triggerCount + 1), nextDelay);
  trackTimer(tid);
}

function buildMushroom(ctx: AudioContext, dest: GainNode) {
  const layerGain = ctx.createGain();
  layerGain.gain.setValueAtTime(1, ctx.currentTime);
  layerGain.connect(dest);

  const tid = setTimeout(() => schedulePulse(ctx, layerGain, 1), 4000 + Math.random() * 4000);
  trackTimer(tid);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startAmbient(): void {
  stopAmbient();

  running = true;
  const ctx = getCtx();
  ambientCtx = ctx;

  masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 3);
  masterGain.connect(ctx.destination);

  buildForestBed(ctx, masterGain);
  buildWater(ctx, masterGain);
  buildBirds(ctx, masterGain);
  buildSprites(ctx, masterGain);
  buildMushroom(ctx, masterGain);
}

export function stopAmbient(): void {
  running = false;

  for (const id of activeTimers) clearTimeout(id);
  activeTimers.length = 0;
  for (const id of activeIntervals) clearInterval(id);
  activeIntervals.length = 0;

  // Reset buses so they're rebuilt on the next AudioContext
  forestReverbBus = null;
  forestReverbCtx = null;
  forestMasterBus = null;
  forestMasterCtx = null;

  if (masterGain && ambientCtx) {
    const gain = masterGain;
    const t = ambientCtx.currentTime;

    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 2);
    } catch { /* ignore */ }

    setTimeout(() => {
      for (const osc of activeOscillators) {
        try { osc.stop(); } catch { /* already stopped */ }
        try { osc.disconnect(); } catch { /* ignore */ }
      }
      activeOscillators.length = 0;
      for (const src of activeBufferSources) {
        try { src.stop(); } catch { /* already stopped */ }
        try { src.disconnect(); } catch { /* ignore */ }
      }
      activeBufferSources.length = 0;
      try { gain.disconnect(); } catch { /* ignore */ }
    }, 2200);

    masterGain = null;
    ambientCtx = null;
  }
}

export function setAmbientVolume(value: number): void {
  if (!masterGain || !ambientCtx) return;
  masterGain.gain.linearRampToValueAtTime(
    Math.max(0, Math.min(1, value)),
    ambientCtx.currentTime + 0.1
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Forest shape-to-sound mapping
//
// Each shape is a completely different instrument family from its default
// audioEngine.ts counterpart. All use C major pentatonic via forestRowToHz()
// so multi-shape columns stay consonant. Every voice is a single fundamental
// pitch — the row-based mapping handles all inter-voice harmonic relationships.
//
// Called from audioEngine.ts playPixel() and scheduleColumn() when
// soundProfile === 'forest'.
// ─────────────────────────────────────────────────────────────────────────────

import type { PixelShape } from '../types/editor';

// C major pentatonic C3->C5 — identical to PENTATONIC_C3_C5 in audioEngine.ts.
const FOREST_PENTATONIC = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72];

/** Same algorithm as rowToHz() in audioEngine.ts. Top row = C5, bottom = C3. */
function forestRowToHz(row: number, gridHeight: number): number {
  const t = row / Math.max(1, gridHeight - 1);
  const idx = Math.round((1 - t) * (FOREST_PENTATONIC.length - 1));
  const midi = FOREST_PENTATONIC[idx];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Convert a pentatonic scale index (clamped) to Hz. */
function pentatonicIdxToHz(idx: number): number {
  const clamped = Math.max(0, Math.min(FOREST_PENTATONIC.length - 1, idx));
  return 440 * Math.pow(2, (FOREST_PENTATONIC[clamped] - 69) / 12);
}

/** Return the pentatonic scale index for a row. */
function rowToScaleIdx(row: number, gridHeight: number): number {
  const t = row / Math.max(1, gridHeight - 1);
  return Math.round((1 - t) * (FOREST_PENTATONIC.length - 1));
}

// ─── Forest master bus (lazy, rebuilt per AudioContext) ──────────────────────
//
// All forest voices route into this instead of ctx.destination directly.
// The compressor catches linear summing from dense columns (8–32 simultaneous
// voices) before it reaches the destination and clips.
//
// Signal chain: voices → forestMasterBus → compressor → ctx.destination

let forestMasterBus: GainNode | null = null;
let forestMasterCtx: AudioContext | null = null;

function getForestMasterBus(ctx: AudioContext): GainNode {
  if (forestMasterCtx !== ctx || !forestMasterBus) {
    forestMasterCtx = ctx;
    const now = ctx.currentTime;

    const masterIn = ctx.createGain();
    masterIn.gain.setValueAtTime(1.0, now);

    // Transparent limiter: high threshold so quiet voices pass through
    // unaffected; only engages when multiple voices sum toward clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-12, now); // starts compressing at -12dBFS
    comp.knee.setValueAtTime(6, now);        // soft knee — gradual onset
    comp.ratio.setValueAtTime(8, now);       // 8:1 above threshold
    comp.attack.setValueAtTime(0.003, now);  // 3ms — fast enough to catch transients
    comp.release.setValueAtTime(0.25, now);  // 250ms — slow enough not to pump

    masterIn.connect(comp);
    comp.connect(ctx.destination);

    forestMasterBus = masterIn;
  }
  return forestMasterBus!;
}

// ─── Shared reverb bus (lazy, rebuilt per AudioContext) ───────────────────────

let forestReverbBus: GainNode | null = null;
let forestReverbCtx: AudioContext | null = null;

/**
 * Builds (or returns cached) the multi-tap delay reverb bus.
 * Returns the bus input node — wire voices into it via a send gain.
 *
 * Signal chain:
 *   inputBus → feedbackGain ─┬→ delay(40ms)  → tapFb(0.55) ─┬→ mixBus
 *                            ├→ delay(90ms)  → tapFb(0.42) ─┤
 *                            └→ delay(170ms) → tapFb(0.31) ─┘
 *                                                             └→ feedbackGain (loop)
 *   mixBus → lpf(breathing,~0.1Hz LFO) → highShelf(-9dB@8kHz) → limiter → dest
 */
function getForestReverb(ctx: AudioContext): GainNode {
  if (forestReverbCtx !== ctx || !forestReverbBus) {
    forestReverbCtx = ctx;
    const now = ctx.currentTime;
    const masterBus = getForestMasterBus(ctx);

    const feedbackGain = ctx.createGain();
    // 0.28: prevents super-linear accumulation on dense columns
    feedbackGain.gain.setValueAtTime(0.28, now);

    const mixBus = ctx.createGain();
    mixBus.gain.setValueAtTime(1.0, now);

    const tapTimes  = [0.04, 0.09, 0.17];
    const tapLevels = [0.55, 0.42, 0.31];

    tapTimes.forEach((dt, i) => {
      const delay = ctx.createDelay(0.5);
      delay.delayTime.setValueAtTime(dt, now);

      const tapFb = ctx.createGain();
      tapFb.gain.setValueAtTime(tapLevels[i], now);

      feedbackGain.connect(delay);
      delay.connect(tapFb);
      tapFb.connect(mixBus);
      tapFb.connect(feedbackGain); // feedback loop
    });

    // Reverb LPF: warm dark tail. A very slow LFO (~0.1Hz) breathes the
    // cutoff between 3200Hz and 5200Hz — gives the reverb organic life.
    const reverbLpf = ctx.createBiquadFilter();
    reverbLpf.type = 'lowpass';
    reverbLpf.frequency.setValueAtTime(4200, now);
    reverbLpf.Q.setValueAtTime(0.5, now);

    const breathLfo = ctx.createOscillator();
    breathLfo.type = 'sine';
    breathLfo.frequency.setValueAtTime(0.1, now);
    const breathDepth = ctx.createGain();
    breathDepth.gain.setValueAtTime(1000, now); // ±1000Hz around 4200Hz centre
    breathLfo.connect(breathDepth);
    breathDepth.connect(reverbLpf.frequency);
    breathLfo.start(now);

    // Global high-shelf cut: rolls off everything above 8kHz by -9dB.
    // Applies to the entire forest profile output (dry + reverb tail).
    const highShelf = ctx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.setValueAtTime(8000, now);
    highShelf.gain.setValueAtTime(-9, now);

    // Soft-limiter: catches runaway accumulation on dense columns
    // without killing the reverb tail character.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-14, now);
    limiter.knee.setValueAtTime(3, now);
    limiter.ratio.setValueAtTime(12, now);
    limiter.attack.setValueAtTime(0.001, now);
    limiter.release.setValueAtTime(0.1, now);

    mixBus.connect(reverbLpf);
    reverbLpf.connect(highShelf);
    highShelf.connect(limiter);
    limiter.connect(masterBus); // reverb tail feeds the master bus, not dest directly

    const inputBus = ctx.createGain();
    inputBus.gain.setValueAtTime(1.0, now);
    inputBus.connect(feedbackGain);

    forestReverbBus = inputBus;
  }

  return forestReverbBus!;
}

/**
 * Wire a voice output node into both the dry destination and the reverb send.
 * Also applies the per-voice filter inline.
 * Returns the pre-filter gain node that oscillators/sources connect into.
 */
function makeForestChain(
  ctx: AudioContext,
  reverbSend: number,
  filterSetup: (f: BiquadFilterNode) => void,
): GainNode {
  const t = ctx.currentTime;
  const masterBus = getForestMasterBus(ctx);

  const voiceOut = ctx.createGain();
  voiceOut.gain.setValueAtTime(1.0, t);

  // Per-voice filter (HPF / LPF / BP as specified by each shape)
  const filter = ctx.createBiquadFilter();
  filterSetup(filter);

  // High-shelf on the dry path: rolls off harshness above 8kHz
  const dryShelf = ctx.createBiquadFilter();
  dryShelf.type = 'highshelf';
  dryShelf.frequency.setValueAtTime(8000, t);
  dryShelf.gain.setValueAtTime(-9, t);

  // Dry path: voice → filter → shelf → master bus (→ compressor → destination)
  voiceOut.connect(filter);
  filter.connect(dryShelf);
  dryShelf.connect(masterBus);

  // Reverb send: voice → sendGain → reverb bus (→ ... → master bus)
  const reverbBus = getForestReverb(ctx);
  const sendGain = ctx.createGain();
  sendGain.gain.setValueAtTime(reverbSend, t);
  voiceOut.connect(sendGain);
  sendGain.connect(reverbBus);

  return voiceOut;
}

// ── Shape voices ──────────────────────────────────────────────────────────────

/**
 * Circle → Kalimba / Thumb Piano
 * Plucked metal tine — inharmonic ratios, pure percussive decay, no vibrato.
 * HPF 300Hz | Reverb 0.6
 */
function playForestCircle(
  ctx: AudioContext,
  freq: number,
  gain: number,
  t: number,
  dur?: number,
) {
  const attack      = 0.006;
  const decay       = 0.15;
  const sustainGain = gain * 0.65;
  const release     = 0.40;
  const tineDecay   = 0.4;
  const hold        = dur != null ? Math.max(0, dur - attack - decay - release) : 0.6;
  const releaseAt   = t + attack + decay + hold;
  const stopAt      = releaseAt + release + 0.05;

  const voiceOut = makeForestChain(ctx, 0.6, (f) => {
    f.type = 'highpass';
    f.frequency.setValueAtTime(300, t);
  });

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, t);

  const env1 = ctx.createGain();
  env1.gain.setValueAtTime(0.0001, t);
  env1.gain.linearRampToValueAtTime(gain, t + attack);
  env1.gain.exponentialRampToValueAtTime(sustainGain, t + attack + decay);
  env1.gain.setValueAtTime(sustainGain, releaseAt);
  env1.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);

  osc1.connect(env1);
  env1.connect(voiceOut);

  // Osc 2: first inharmonic partial — freq * 5.4, decays at tineDecay rate
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 5.4, t);

  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.0001, t);
  env2.gain.linearRampToValueAtTime(gain * 0.22, t + attack);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + attack + tineDecay);

  osc2.connect(env2);
  env2.connect(voiceOut);

  // Osc 3: second inharmonic ring — freq * 8.9, decays with osc2
  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 8.9, t);

  const env3 = ctx.createGain();
  env3.gain.setValueAtTime(0.0001, t);
  env3.gain.linearRampToValueAtTime(gain * 0.10, t + attack);
  env3.gain.exponentialRampToValueAtTime(0.0001, t + attack + tineDecay);

  osc3.connect(env3);
  env3.connect(voiceOut);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(t + attack + tineDecay + 0.05);
  osc3.start(t); osc3.stop(t + attack + tineDecay + 0.05);
}

/**
 * Square → Pan Flute Breath
 * Breathy pitched noise — narrow bandpass filters pitch the noise to sing.
 * LPF on final mix | Reverb 0.65
 */
function playForestSquare(
  ctx: AudioContext,
  freq: number,
  gain: number,
  t: number,
  dur?: number,
) {
  const attack      = 0.06;
  const decay       = 0.12;
  const sustainGain = gain * 0.7;
  const release     = 0.3;
  const hold        = dur != null ? Math.max(0, dur - attack - decay - release) : 0.4;
  const releaseAt   = t + attack + decay + hold;
  const stopAt      = releaseAt + release + 0.05;
  const duration    = releaseAt - t + release; // for noise buffer sizing

  // Flute fundamental lives ~2 octaves up for pan flute register
  const fluteFreq = freq * 4;

  const voiceOut = makeForestChain(ctx, 0.65, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(fluteFreq * 2.5, t);
    f.Q.setValueAtTime(0.5, t);
  });

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(sustainGain, t + attack + decay);
  env.gain.setValueAtTime(sustainGain, releaseAt);
  env.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  env.connect(voiceOut);

  // Noise source — the breath
  const noiseLen = Math.max(1, Math.ceil(ctx.sampleRate * (duration + 0.1)));
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = false;

  // Narrow bandpass 1 — pitches the noise to the flute fundamental
  const bp1 = ctx.createBiquadFilter();
  bp1.type = 'bandpass';
  bp1.frequency.setValueAtTime(fluteFreq, t);
  bp1.Q.setValueAtTime(12.0, t);

  // Narrow bandpass 2 — second harmonic, adds airiness
  const bp2 = ctx.createBiquadFilter();
  bp2.type = 'bandpass';
  bp2.frequency.setValueAtTime(fluteFreq * 2, t);
  bp2.Q.setValueAtTime(9.0, t);
  const bp2Gain = ctx.createGain();
  bp2Gain.gain.setValueAtTime(0.4, t);

  // Pitch reinforcement sine — anchors the pitch so it doesn't feel ambiguous
  const pitchSine = ctx.createOscillator();
  pitchSine.type = 'sine';
  pitchSine.frequency.setValueAtTime(fluteFreq, t);
  const sineGain = ctx.createGain();
  sineGain.gain.setValueAtTime(0.15, t);

  noise.connect(bp1); bp1.connect(env);
  noise.connect(bp2); bp2.connect(bp2Gain); bp2Gain.connect(env);
  pitchSine.connect(sineGain); sineGain.connect(env);

  noise.start(t); noise.stop(stopAt);
  pitchSine.start(t); pitchSine.stop(stopAt);
}

/**
 * Square helper — need to register noise source for cleanup
 * (noise is a BufferSourceNode not an OscillatorNode, handled inline above)
 */

/**
 * Diamond → Crystal Singing Bowl
 * Pure tone that emerges slowly — no attack transient, slow swell, huge reverb.
 * BP at freq*2 Q2.5 | Reverb 0.8
 */
function playForestDiamond(
  ctx: AudioContext,
  freq: number,
  gain: number,
  t: number,
  dur?: number,
) {
  const attack      = 0.4;
  const sustainGain = gain * 0.9;
  const release     = 1.2;
  const hold        = dur != null ? Math.max(0, dur - attack - release) : 0.0;
  const releaseAt   = t + attack + hold;
  const stopAt      = releaseAt + release + 0.05;

  const bowlFreq = freq * 2; // one octave up — bowl register

  const voiceOut = makeForestChain(ctx, 0.8, (f) => {
    f.type = 'bandpass';
    f.frequency.setValueAtTime(bowlFreq, t);
    f.Q.setValueAtTime(2.5, t);
  });

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(sustainGain, t + attack);
  env.gain.setValueAtTime(sustainGain, releaseAt);
  env.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);

  // Tremolo: 2.2Hz, depth 0.12 * gain — the ringing of the bowl
  const tremLfo = ctx.createOscillator();
  tremLfo.type = 'sine';
  tremLfo.frequency.setValueAtTime(2.2, t);
  const tremDepth = ctx.createGain();
  tremDepth.gain.setValueAtTime(gain * 0.12, t);
  tremLfo.connect(tremDepth);
  tremDepth.connect(env.gain);

  env.connect(voiceOut);

  // Osc 1: pure sine at bowl freq
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(bowlFreq, t);

  // Shimmer LFO: 0.7Hz, 3 cents — almost imperceptible bowl resonance
  const shimLfo = ctx.createOscillator();
  shimLfo.type = 'sine';
  shimLfo.frequency.setValueAtTime(0.7, t);
  const shimDepth = ctx.createGain();
  shimDepth.gain.setValueAtTime(3, t);
  shimLfo.connect(shimDepth);
  shimDepth.connect(osc1.detune);

  // Osc 2: distant overtone partial at freq*3, gain 0.08
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 3, t);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.08, t);

  osc1.connect(env);
  osc2.connect(g2); g2.connect(env);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(stopAt);
  shimLfo.start(t); shimLfo.stop(stopAt);
  tremLfo.start(t); tremLfo.stop(stopAt);
}

/**
 * Triangle → Taiko Drum
 * Deep drum thump — pitch drop envelope, noise burst transient, pure decay.
 * LPF 400Hz Q0.5 | Reverb 0.45
 */
function playForestTriangle(
  ctx: AudioContext,
  freq: number,
  gain: number,
  t: number,
) {
  const attack = 0.008;
  const decay  = 0.6;
  const stopAt = t + attack + decay + 0.05;

  const drumFreq = freq * 0.25; // two octaves down — deep taiko body

  const voiceOut = makeForestChain(ctx, 0.45, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t);
    f.Q.setValueAtTime(0.5, t);
  });

  // Drum tone: pitch drops from freq*0.4 to drumFreq over 40ms (struck head)
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  env.connect(voiceOut);

  // Osc 1: fundamental body
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq * 0.4, t);          // start high
  osc1.frequency.exponentialRampToValueAtTime(drumFreq, t + 0.04); // drop to pitch

  // Osc 2: drum head mid harmonic, gain 0.4
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 0.8, t);          // start high
  osc2.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.04);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.4, t);

  osc1.connect(env);
  osc2.connect(g2); g2.connect(env);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(stopAt);

  // Noise burst — the thump transient
  const noiseLen = Math.ceil(ctx.sampleRate * 0.08);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;

  const noiseLpf = ctx.createBiquadFilter();
  noiseLpf.type = 'lowpass';
  noiseLpf.frequency.setValueAtTime(200, t);
  noiseLpf.Q.setValueAtTime(1.0, t);

  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.0001, t);
  noiseEnv.gain.linearRampToValueAtTime(gain * 0.3, t + 0.005);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.005 + 0.06);

  noiseSrc.connect(noiseLpf);
  noiseLpf.connect(noiseEnv);
  noiseEnv.connect(voiceOut);

  noiseSrc.start(t); noiseSrc.stop(t + 0.09);
}

/**
 * Star → Ocarina
 * Warm, hollow, vocal-like — single pitch, slow vibrato that grows, pitch bends up.
 * LPF at freq*3 Q0.7 | Reverb 0.55
 */
function playForestStar(
  ctx: AudioContext,
  freq: number,
  gain: number,
  t: number,
  dur?: number,
) {
  const attack      = 0.12;
  const decay       = 0.2;
  const sustainGain = gain * 0.8;
  const release     = 0.4;
  const hold        = dur != null ? Math.max(0, dur - attack - decay - release) : 0.3;
  const releaseAt   = t + attack + decay + hold;
  const stopAt      = releaseAt + release + 0.05;

  const voiceOut = makeForestChain(ctx, 0.55, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 3, t);
    f.Q.setValueAtTime(0.7, t);
  });

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(sustainGain, t + attack + decay);
  env.gain.setValueAtTime(sustainGain, releaseAt);
  env.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  env.connect(voiceOut);

  // Osc 1: triangle — ocarina body
  const osc1 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(freq * 0.96, t);   // start slightly flat
  osc1.frequency.linearRampToValueAtTime(freq, t + 0.18); // bend up to pitch

  // Vibrato fades in over 500ms: gain ramps 0 → 9 cents
  const vibLfo = ctx.createOscillator();
  vibLfo.type = 'sine';
  vibLfo.frequency.setValueAtTime(4.5, t);
  const vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, t);
  vibDepth.gain.linearRampToValueAtTime(9, t + 0.5);
  vibLfo.connect(vibDepth);
  vibDepth.connect(osc1.detune);

  // Osc 2: sine at same freq — adds purity, gain 0.4
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 0.96, t);
  osc2.frequency.linearRampToValueAtTime(freq, t + 0.18);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.4, t);

  osc1.connect(env);
  osc2.connect(g2); g2.connect(env);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(stopAt);
  vibLfo.start(t); vibLfo.stop(stopAt);
}

/**
 * Cross → Wind Chime Cluster
 * 3 bells from neighboring pentatonic scale degrees, staggered 0/40/90ms.
 * Each bell: sine + inharmonic partials, pure exponential 1.8s decay.
 * Reverb 0.75
 */
function playForestCross(
  ctx: AudioContext,
  freq: number,
  gain: number,
  t: number,
  scaleIdx: number,
) {
  // Pick 3 neighboring scale degrees (within ±2 steps, deduplicated)
  const offsets = [-2, -1, 0, 1, 2];
  const shuffled = offsets.sort(() => Math.random() - 0.5);
  const chosen = [shuffled[0], shuffled[1], shuffled[2]];
  const delays  = [0, 0.04, 0.09];

  chosen.forEach((offset, i) => {
    const bellFreq = pentatonicIdxToHz(scaleIdx + offset);
    const bellGain = gain * (0.85 + Math.random() * 0.30);
    const bellT    = t + delays[i];

    const attack    = 0.007; // softened 3ms → 7ms: reduces transient spike into reverb
    const bellDecay = 1.8;
    const stopAt    = bellT + attack + bellDecay + 0.05;
    const partialStop = bellT + attack + 0.5 + 0.05; // high partials die at 0.5s

    const voiceOut = makeForestChain(ctx, 0.7, (f) => {
      f.type = 'highpass';
      f.frequency.setValueAtTime(200, bellT);
    });

    // Bell tone envelope — pure exponential decay, no sustain
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, bellT);
    env.gain.linearRampToValueAtTime(bellGain, bellT + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, bellT + attack + bellDecay);
    env.connect(voiceOut);

    // Osc 1: fundamental sine
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(bellFreq, bellT);

    // Osc 2: inharmonic partial at *2.76
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(bellFreq * 2.76, bellT);
    const env2 = ctx.createGain();
    env2.gain.setValueAtTime(0.0001, bellT);
    env2.gain.linearRampToValueAtTime(bellGain * 0.30, bellT + attack);
    env2.gain.exponentialRampToValueAtTime(0.0001, bellT + attack + bellDecay);

    // Osc 3: high inharmonic at *5.4, decays faster (0.5s)
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(bellFreq * 5.4, bellT);
    const env3 = ctx.createGain();
    env3.gain.setValueAtTime(0.0001, bellT);
    env3.gain.linearRampToValueAtTime(bellGain * 0.12, bellT + attack);
    env3.gain.exponentialRampToValueAtTime(0.0001, bellT + attack + 0.5);

    osc1.connect(env);
    osc2.connect(env2); env2.connect(voiceOut);
    osc3.connect(env3); env3.connect(voiceOut);

    osc1.start(bellT); osc1.stop(stopAt);
    osc2.start(bellT); osc2.stop(stopAt);
    osc3.start(bellT); osc3.stop(partialStop);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Play a forest-themed note for the given shape.
 * Called from audioEngine.ts playPixel() and scheduleColumn() when
 * soundProfile === 'forest'.
 *
 * `startTime` — AudioContext time to begin playback. Omit for immediate play.
 */
export function playForestNote(
  row: number,
  gridHeight: number,
  shape: PixelShape,
  density: number,
  startTime?: number,
  voiceCount?: number,
  noteDuration?: number,
): void {
  try {
    const ctx  = getCtx();
    const t    = startTime ?? ctx.currentTime;
    const freq = forestRowToHz(row, gridHeight);
    const baseGain = 0.08 + density * 0.14;
    const gain = baseGain / Math.sqrt(voiceCount ?? 1);
    const idx  = rowToScaleIdx(row, gridHeight);
    const dur  = noteDuration;

    switch (shape) {
      case 'circle':
        playForestCircle(ctx, freq, gain, t, dur);
        break;
      case 'square':
        playForestSquare(ctx, freq, gain, t, dur);
        break;
      case 'diamond':
        playForestDiamond(ctx, freq, gain, t, dur);
        break;
      case 'triangle':
        playForestTriangle(ctx, freq, gain, t); // percussive — no sustain
        break;
      case 'star':
        playForestStar(ctx, freq, gain, t, dur);
        break;
      case 'cross':
        playForestCross(ctx, freq, gain, t, idx); // bell cluster — natural decay
        break;
      default: {
        // Fallback routes through the master bus too
        const masterBus = getForestMasterBus(ctx);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        const env = ctx.createGain();
        env.gain.setValueAtTime(gain, t);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        osc.connect(env); env.connect(masterBus);
        osc.start(t); osc.stop(t + 0.18);
        break;
      }
    }
  } catch {
    // ignore audio errors
  }
}
