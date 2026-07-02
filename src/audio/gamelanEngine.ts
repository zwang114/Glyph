/**
 * gamelanEngine.ts — Gamelan / Music Box Sound Profile
 *
 * Bronze metallophones, deep gongs, kalimba plucks, and music-box sparkle.
 * Delicate, chiming, percussive — a small gamelan ensemble heard through a
 * warm room. Bright attack transients over long consonant ring-outs.
 *
 * Compatibility contract (shared with every other profile so any mix of
 * shapes and canvases stays musical):
 *   - Pitches quantized to C major pentatonic C3–C5 (same table as
 *     PENTATONIC_C3_C5 in audioEngine.ts)
 *   - Each shape voice occupies its own register band
 *   - Caller normalizes gain by 1/√(voice count)
 *   - All voices route through one compressed master bus
 *
 * Registered in soundProfiles.ts — no changes needed to audioEngine.ts.
 */

import { getCtx } from './audioEngine';
import type { PixelShape } from '../types/editor';

// ─── Pitch mapping ────────────────────────────────────────────────────────────

// C major pentatonic C3->C5 — identical to PENTATONIC_C3_C5 in audioEngine.ts.
const GAMELAN_PENTATONIC = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72];

function gamelanRowToHz(row: number, gridHeight: number): number {
  const t = row / Math.max(1, gridHeight - 1);
  const idx = Math.round((1 - t) * (GAMELAN_PENTATONIC.length - 1));
  return 440 * Math.pow(2, (GAMELAN_PENTATONIC[idx] - 69) / 12);
}

// ─── Master bus (lazy singleton) ─────────────────────────────────────────────
//
// All gamelan voices route here instead of ctx.destination directly.
// Chain: voices → masterIn → airLpf → compressor → destination
//
// airLpf at 7000Hz: keeps the bell brightness but shaves harsh top
// compressor: prevents dense strummed columns from clipping

let gamelanMasterBus: GainNode | null = null;
let gamelanMasterCtx: AudioContext | null = null;

function getGamelanMasterBus(ctx: AudioContext): GainNode {
  if (gamelanMasterCtx !== ctx || !gamelanMasterBus) {
    gamelanMasterCtx = ctx;
    const now = ctx.currentTime;

    const masterIn = ctx.createGain();
    masterIn.gain.setValueAtTime(1.0, now);

    const airLpf = ctx.createBiquadFilter();
    airLpf.type = 'lowpass';
    airLpf.frequency.setValueAtTime(7000, now);
    airLpf.Q.setValueAtTime(0.4, now);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-8, now);
    comp.knee.setValueAtTime(10, now);
    comp.ratio.setValueAtTime(3, now);
    comp.attack.setValueAtTime(0.005, now);
    comp.release.setValueAtTime(0.35, now);

    masterIn.connect(airLpf);
    airLpf.connect(comp);
    comp.connect(ctx.destination);

    gamelanMasterBus = masterIn;
  }
  return gamelanMasterBus!;
}

// ─── Shared reverb bus (lazy singleton) ──────────────────────────────────────
//
// Brighter and airier than the C418 reverb — bells live in their shimmer.
//   4 taps: 50/110/190/290ms, low per-tap feedback so the tail decays ~1.2s
//   Reverb LPF at 4500Hz — bright shimmer without harshness
//   Routes into the master bus (not destination directly)

let gamelanReverbBus: GainNode | null = null;
let gamelanReverbCtx: AudioContext | null = null;

function getGamelanReverb(ctx: AudioContext): GainNode {
  if (gamelanReverbCtx !== ctx || !gamelanReverbBus) {
    gamelanReverbCtx = ctx;
    const now = ctx.currentTime;
    const masterBus = getGamelanMasterBus(ctx);

    const mixBus = ctx.createGain();
    mixBus.gain.setValueAtTime(1.0, now);

    const tapTimes    = [0.05, 0.11, 0.19, 0.29];
    const tapFeedback = [0.22, 0.18, 0.14, 0.11];
    const tapMix      = [0.16, 0.14, 0.12, 0.10];

    const inputBus = ctx.createGain();
    inputBus.gain.setValueAtTime(1.0, now);

    tapTimes.forEach((dt, i) => {
      const delay = ctx.createDelay(0.5);
      delay.delayTime.setValueAtTime(dt, now);

      const fb = ctx.createGain();
      fb.gain.setValueAtTime(tapFeedback[i], now);

      const tapOut = ctx.createGain();
      tapOut.gain.setValueAtTime(tapMix[i], now);

      inputBus.connect(delay);
      delay.connect(tapOut);
      tapOut.connect(mixBus);
      delay.connect(fb);
      fb.connect(delay);
    });

    const reverbLpf = ctx.createBiquadFilter();
    reverbLpf.type = 'lowpass';
    reverbLpf.frequency.setValueAtTime(4500, now);
    reverbLpf.Q.setValueAtTime(0.5, now);

    mixBus.connect(reverbLpf);
    reverbLpf.connect(masterBus);

    gamelanReverbBus = inputBus;
  }
  return gamelanReverbBus!;
}

// ─── Signal chain helper ──────────────────────────────────────────────────────

/**
 * Wire a voice output into dry (master bus via filter) and wet (reverb send).
 * Returns the pre-filter gain node that oscillators connect into.
 */
function makeGamelanChain(
  ctx: AudioContext,
  reverbSend: number,
  filterSetup: (f: BiquadFilterNode) => void,
): GainNode {
  const t = ctx.currentTime;
  const masterBus = getGamelanMasterBus(ctx);

  const voiceOut = ctx.createGain();
  voiceOut.gain.setValueAtTime(1.0, t);

  const filter = ctx.createBiquadFilter();
  filterSetup(filter);

  voiceOut.connect(filter);
  filter.connect(masterBus);

  const reverbBus = getGamelanReverb(ctx);
  const sendGain = ctx.createGain();
  sendGain.gain.setValueAtTime(reverbSend, t);
  voiceOut.connect(sendGain);
  sendGain.connect(reverbBus);

  return voiceOut;
}

// ── Shape voices ──────────────────────────────────────────────────────────────
//
// Register plan — each voice occupies a distinct frequency band and attack character:
//   Triangle  → Deep gong        — freq * 0.5, slow bloom, long ring, low register
//   Square    → Saron / metallophone — freq,    bright metal strike, mid register
//   Circle    → Kalimba          — freq,        soft thumb pluck, mid register
//   Star      → Bowed shimmer    — freq,        slow attack, sustained, mid register
//   Diamond   → Gendér bell      — freq * 2,    mallet strike, upper-mid register
//   Cross     → Music box        — freq * 4,    high sparkle, pure decay, top register

/**
 * Triangle → Deep gong. One octave down — the low anchor of the ensemble.
 * Slow bloom into a long ring with softly beating inharmonic partials.
 * Run length extends the ring rather than sustaining flat (gongs decay).
 */
function playGamelanTriangle(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  const gongFreq = freq * 0.5;
  const attack   = 0.030; // mallet bloom, not a click
  const ring     = dur != null ? Math.min(3.0, 1.4 + dur * 0.6) : 1.8;

  const voiceOut = makeGamelanChain(ctx, 0.14, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t); // dark bronze body
    f.Q.setValueAtTime(0.4, t);
  });

  // Fundamental + two inharmonic partials — the beating "wow" of a gong.
  // Partial ratios ×1.19 / ×1.71 are within a whole tone of consonant
  // intervals and decay fast, so stacked gongs never clash.
  const partials: [number, number, number][] = [
    // [freq ratio, gain ratio, decay portion of ring]
    [1.0, 1.0, 1.0],
    [1.19, 0.30, 0.5],
    [1.71, 0.16, 0.3],
  ];
  for (const [ratio, gRatio, decayPortion] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(gongFreq * ratio, t);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(gain * 1.3 * gRatio, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + ring * decayPortion);
    osc.connect(env); env.connect(voiceOut);
    osc.start(t); osc.stop(t + attack + ring * decayPortion + 0.05);
  }
}

/**
 * Square → Saron / metallophone. Fundamental register — the melodic
 * workhorse. Hard bronze strike with a fast-decaying metallic partial,
 * body sustains gently for merged runs.
 */
function playGamelanSquare(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  const attack      = 0.003;
  const decay       = 0.22;
  const sustainGain = gain * 0.45;
  const release     = 0.45;
  const hold        = dur != null ? Math.max(0, dur - attack - decay - release) : 0.3;
  const releaseAt   = t + attack + decay + hold;
  const stopAt      = releaseAt + release + 0.05;

  const voiceOut = makeGamelanChain(ctx, 0.22, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3800, t); // bright bronze
    f.Q.setValueAtTime(0.6, t);
  });

  // Body — the struck bar
  const osc1 = ctx.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(freq, t);
  const env1 = ctx.createGain();
  env1.gain.setValueAtTime(0.0001, t);
  env1.gain.linearRampToValueAtTime(gain * 1.1, t + attack);
  env1.gain.exponentialRampToValueAtTime(sustainGain, t + attack + decay);
  env1.gain.setValueAtTime(sustainGain, releaseAt);
  env1.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  osc1.connect(env1); env1.connect(voiceOut);

  // Metallic clang partial at ×2.76 — decays fast, reads as the strike
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2.76, t);
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.0001, t);
  env2.gain.linearRampToValueAtTime(gain * 0.35, t + attack);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + attack + 0.15);
  osc2.connect(env2); env2.connect(voiceOut);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(t + attack + 0.2);
}

/**
 * Circle → Kalimba. Fundamental register — warm thumb-piano pluck.
 * Round sine body with a brief octave "pling" on the attack; short-mid
 * decay, run length adds a gentle sustain like a damped tine.
 */
function playGamelanCircle(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  const attack = 0.004;
  const decay  = dur != null ? Math.min(1.2, 0.45 + dur * 0.4) : 0.55;
  const stopAt = t + attack + decay + 0.05;

  const voiceOut = makeGamelanChain(ctx, 0.16, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t); // woody warmth
    f.Q.setValueAtTime(0.5, t);
  });

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, t);
  const env1 = ctx.createGain();
  env1.gain.setValueAtTime(0.0001, t);
  env1.gain.linearRampToValueAtTime(gain * 1.2, t + attack);
  env1.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  osc1.connect(env1); env1.connect(voiceOut);

  // Octave pling — the bright tick of the tine, gone in 90ms
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, t);
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.0001, t);
  env2.gain.linearRampToValueAtTime(gain * 0.30, t + attack);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  osc2.connect(env2); env2.connect(voiceOut);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(t + 0.12);
}

/**
 * Star → Bowed shimmer. Fundamental register — the sustained voice of the
 * set: two detuned sines under slow tremolo, like a bowed gong or singing
 * bowl. Slow attack so it swells beneath the struck voices.
 */
function playGamelanStar(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  const attack      = 0.12; // bowed swell
  const sustainGain = gain * 0.7;
  const release     = 0.6;
  const hold        = dur != null ? Math.max(0.2, dur - attack) : 0.6;
  const releaseAt   = t + attack + hold;
  const stopAt      = releaseAt + release + 0.05;

  const voiceOut = makeGamelanChain(ctx, 0.26, (f) => {
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq * 2, t); // glassy midband focus
    f.Q.setValueAtTime(0.8, t);
  });

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(sustainGain, t + attack);
  env.gain.setValueAtTime(sustainGain, releaseAt);
  env.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  env.connect(voiceOut);

  const oscA = ctx.createOscillator();
  oscA.type = 'sine';
  oscA.frequency.setValueAtTime(freq, t);
  oscA.detune.setValueAtTime(-5, t);
  const oscB = ctx.createOscillator();
  oscB.type = 'sine';
  oscB.frequency.setValueAtTime(freq, t);
  oscB.detune.setValueAtTime(+5, t);
  oscA.connect(env);
  oscB.connect(env);

  // Slow tremolo — the breathing of a bowed bowl
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(1.4, t);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(sustainGain * 0.25, t);
  lfo.connect(lfoGain);
  lfoGain.connect(env.gain);

  oscA.start(t); oscA.stop(stopAt);
  oscB.start(t); oscB.stop(stopAt);
  lfo.start(t); lfo.stop(stopAt);
}

/**
 * Diamond → Gendér bell. One octave up — soft mallet on a thin bronze key
 * over a bamboo resonator. Warm fundamental with the ×3.87 vibraphone-family
 * shimmer partial.
 */
function playGamelanDiamond(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  const bellFreq    = freq * 2;
  const attack      = 0.004;
  const decay       = 0.35;
  const sustainGain = gain * 0.35;
  const release     = 0.5;
  const hold        = dur != null ? Math.max(0, dur - attack - decay - release) : 0.25;
  const releaseAt   = t + attack + decay + hold;
  const stopAt      = releaseAt + release + 0.05;

  const voiceOut = makeGamelanChain(ctx, 0.30, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t);
    f.Q.setValueAtTime(0.5, t);
  });

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(bellFreq, t);
  const env1 = ctx.createGain();
  env1.gain.setValueAtTime(0.0001, t);
  env1.gain.linearRampToValueAtTime(gain * 1.0, t + attack);
  env1.gain.exponentialRampToValueAtTime(sustainGain, t + attack + decay);
  env1.gain.setValueAtTime(sustainGain, releaseAt);
  env1.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  osc1.connect(env1); env1.connect(voiceOut);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(bellFreq * 3.87, t);
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.0001, t);
  env2.gain.linearRampToValueAtTime(gain * 0.15, t + attack);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + attack + 0.18);
  osc2.connect(env2); env2.connect(voiceOut);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(t + attack + 0.22);
}

/**
 * Cross → Music box. Two octaves up — the delicate top sparkle.
 * Pure exponential decay (music boxes don't sustain); run length gently
 * extends the ring like a damper pedal. High reverb send for shimmer.
 */
function playGamelanCross(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  const boxFreq = freq * 4;
  const attack  = 0.003;
  const decay   = dur != null ? Math.min(2.0, 0.6 + dur * 0.5) : 0.9;
  const stopAt  = t + attack + decay + 0.05;

  const voiceOut = makeGamelanChain(ctx, 0.38, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(6500, t);
    f.Q.setValueAtTime(0.4, t);
  });

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(boxFreq, t);
  const env1 = ctx.createGain();
  env1.gain.setValueAtTime(0.0001, t);
  env1.gain.linearRampToValueAtTime(gain * 0.9, t + attack);
  env1.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  osc1.connect(env1); env1.connect(voiceOut);

  // Metallic tine partial ×2.76 — decays in the first third
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(boxFreq * 2.76, t);
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.0001, t);
  env2.gain.linearRampToValueAtTime(gain * 0.20, t + attack);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay * 0.3);
  osc2.connect(env2); env2.connect(voiceOut);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(t + attack + decay * 0.35);
}

// ─── Ambient bed ──────────────────────────────────────────────────────────────
//
// A quiet room for the ensemble: soft filtered-noise air plus a distant gong
// swell every 9–15s on a low pentatonic root. Starts when the connector snaps
// in, stops when it detaches. Idempotent — safe to call either repeatedly.

let ambientRunning = false;
let ambientNodes: { air: AudioBufferSourceNode; airGain: GainNode } | null = null;
let ambientTimer: ReturnType<typeof setTimeout> | null = null;

export function startGamelanAmbient(): void {
  if (ambientRunning) return;
  ambientRunning = true;
  try {
    const ctx = getCtx();
    const masterBus = getGamelanMasterBus(ctx);
    const now = ctx.currentTime;

    // Room air — looped noise through a dark bandpass, barely audible.
    const seconds = 2;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const air = ctx.createBufferSource();
    air.buffer = buf;
    air.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.setValueAtTime(400, now);
    airFilter.Q.setValueAtTime(0.4, now);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, now);
    airGain.gain.linearRampToValueAtTime(0.012, now + 2.0); // whisper-quiet
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(masterBus);
    air.start(now);
    ambientNodes = { air, airGain };

    // Distant gong — low C or G, soft and far away, on a slow random cycle.
    const gongMidi = [36, 43, 48]; // C2, G2, C3
    const scheduleGong = () => {
      if (!ambientRunning) return;
      try {
        const midi = gongMidi[Math.floor(Math.random() * gongMidi.length)];
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        // Reuse the triangle (gong) voice at very low gain — same timbre
        // as the playable gong so the bed and the instrument feel related.
        playGamelanTriangle(ctx, freq * 2, 0.05, ctx.currentTime + 0.05);
      } catch { /* ignore */ }
      ambientTimer = setTimeout(scheduleGong, 9000 + Math.random() * 6000);
    };
    ambientTimer = setTimeout(scheduleGong, 2500);
  } catch {
    // ignore audio errors
  }
}

export function stopGamelanAmbient(): void {
  ambientRunning = false;
  if (ambientTimer !== null) {
    clearTimeout(ambientTimer);
    ambientTimer = null;
  }
  if (ambientNodes) {
    try {
      const ctx = getCtx();
      const t = ctx.currentTime;
      ambientNodes.airGain.gain.cancelScheduledValues(t);
      ambientNodes.airGain.gain.setValueAtTime(ambientNodes.airGain.gain.value, t);
      ambientNodes.airGain.gain.linearRampToValueAtTime(0.0001, t + 0.4);
      const { air, airGain } = ambientNodes;
      setTimeout(() => {
        try { air.stop(); } catch { /* ignore */ }
        try { air.disconnect(); } catch { /* ignore */ }
        try { airGain.disconnect(); } catch { /* ignore */ }
      }, 500);
    } catch {
      // ignore audio errors
    }
    ambientNodes = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Play a gamelan note for the given shape.
 * Registered in soundProfiles.ts — called by audioEngine routing.
 */
export function playGamelanNote(
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
    const freq = gamelanRowToHz(row, gridHeight);
    const baseGain = 0.10 + density * 0.18;
    const gain = baseGain / Math.sqrt(voiceCount ?? 1);
    const dur  = noteDuration;

    switch (shape) {
      case 'circle':   playGamelanCircle(ctx, freq, gain, t, dur);   break;
      case 'square':   playGamelanSquare(ctx, freq, gain, t, dur);   break;
      case 'diamond':  playGamelanDiamond(ctx, freq, gain, t, dur);  break;
      case 'triangle': playGamelanTriangle(ctx, freq, gain, t, dur); break;
      case 'star':     playGamelanStar(ctx, freq, gain, t, dur);     break;
      case 'cross':    playGamelanCross(ctx, freq, gain, t, dur);    break;
      default: {
        const masterBus = getGamelanMasterBus(ctx);
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
