/**
 * c418Engine.ts — C418 / Minecraft-Inspired Sound Profile
 *
 * Evokes C418's Minecraft soundtrack: muted lo-fi synth pads, soft mallet
 * tones, sparse plucks, deep ambient room reverb, slightly out-of-tune warmth,
 * melancholy stillness. Everything sits behind a gentle tape veil.
 *
 * Registered in soundProfiles.ts — no changes needed to audioEngine.ts.
 */

import { getCtx } from './audioEngine';
import type { PixelShape } from '../types/editor';

// ─── Pitch mapping ────────────────────────────────────────────────────────────

// C major pentatonic C3->C5 — identical to PENTATONIC_C3_C5 in audioEngine.ts.
const C418_PENTATONIC = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72];

function c418RowToHz(row: number, gridHeight: number): number {
  const t = row / Math.max(1, gridHeight - 1);
  const idx = Math.round((1 - t) * (C418_PENTATONIC.length - 1));
  return 440 * Math.pow(2, (C418_PENTATONIC[idx] - 69) / 12);
}

// ─── Master bus (lazy singleton) ─────────────────────────────────────────────
//
// All C418 voices route here instead of ctx.destination directly.
// Chain: voices → masterIn → tapeLpf → bitcrusher → compressor → destination
//
// tapeLpf at 5500Hz: the lo-fi "tape veil" over everything
// bitcrusher (WaveShaper): ghost of old sample-rate, very subtle
// compressor: prevents dense column clipping

let c418MasterBus: GainNode | null = null;
let c418MasterCtx: AudioContext | null = null;

function getC418MasterBus(ctx: AudioContext): GainNode {
  if (c418MasterCtx !== ctx || !c418MasterBus) {
    c418MasterCtx = ctx;
    const now = ctx.currentTime;

    const masterIn = ctx.createGain();
    masterIn.gain.setValueAtTime(1.0, now);

    // Tape veil: gentle lowpass at 5500Hz
    const tapeLpf = ctx.createBiquadFilter();
    tapeLpf.type = 'lowpass';
    tapeLpf.frequency.setValueAtTime(5500, now);
    tapeLpf.Q.setValueAtTime(0.4, now);

    // Bitcrusher emulation: mild quantization (steps of 1/40)
    const steps = 40;
    const crusherCurve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 127) - 1; // -1 to +1
      crusherCurve[i] = Math.round(x * steps) / steps;
    }
    const bitcrusher = ctx.createWaveShaper();
    bitcrusher.curve = crusherCurve;
    bitcrusher.oversample = 'none';

    // Compressor: soft-knee limiter, transparent on sparse columns
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-6, now);
    comp.knee.setValueAtTime(10, now);
    comp.ratio.setValueAtTime(3, now);
    comp.attack.setValueAtTime(0.010, now);
    comp.release.setValueAtTime(0.40, now);

    masterIn.connect(tapeLpf);
    tapeLpf.connect(bitcrusher);
    bitcrusher.connect(comp);
    comp.connect(ctx.destination);

    c418MasterBus = masterIn;
  }
  return c418MasterBus!;
}

// ─── Shared reverb bus (lazy singleton) ──────────────────────────────────────
//
// Heavier and darker than the forest reverb:
//   4 taps: 60/130/210/310ms, feedback 0.55/0.48/0.40/0.32
//   Shared feedback return at 0.30 (safe against accumulation)
//   Reverb LPF at 3200Hz — "muffled through wool"
//   Routes into master bus (not destination directly)

let c418ReverbBus: GainNode | null = null;
let c418ReverbCtx: AudioContext | null = null;

function getC418Reverb(ctx: AudioContext): GainNode {
  if (c418ReverbCtx !== ctx || !c418ReverbBus) {
    c418ReverbCtx = ctx;
    const now = ctx.currentTime;
    const masterBus = getC418MasterBus(ctx);

    const mixBus = ctx.createGain();
    mixBus.gain.setValueAtTime(1.0, now);

    // Each tap is an independent delay line with its own feedback loop.
    const tapTimes    = [0.06, 0.13, 0.21, 0.31];
    const tapFeedback = [0.18, 0.15, 0.12, 0.10]; // low feedback — tail decays in ~1s
    const tapMix      = [0.18, 0.15, 0.12, 0.10]; // total output ≈ 0.55, not 1.75

    const inputBus = ctx.createGain();
    inputBus.gain.setValueAtTime(1.0, now);

    tapTimes.forEach((dt, i) => {
      const delay = ctx.createDelay(0.5);
      delay.delayTime.setValueAtTime(dt, now);

      const fb = ctx.createGain();
      fb.gain.setValueAtTime(tapFeedback[i], now);

      const tapOut = ctx.createGain();
      tapOut.gain.setValueAtTime(tapMix[i], now);

      // Signal flow: input → delay → tapOut → mixBus
      //                         └→ fb → delay (self-feedback per tap)
      inputBus.connect(delay);
      delay.connect(tapOut);
      tapOut.connect(mixBus);
      delay.connect(fb);
      fb.connect(delay);
    });

    // Dark reverb LPF — the "wool" quality
    const reverbLpf = ctx.createBiquadFilter();
    reverbLpf.type = 'lowpass';
    reverbLpf.frequency.setValueAtTime(3200, now);
    reverbLpf.Q.setValueAtTime(0.5, now);

    mixBus.connect(reverbLpf);
    reverbLpf.connect(masterBus);

    c418ReverbBus = inputBus;
  }
  return c418ReverbBus!;
}

// ─── Signal chain helper ──────────────────────────────────────────────────────

/**
 * Wire a voice output into dry (master bus via filter) and wet (reverb send).
 * Returns the pre-filter gain node that oscillators connect into.
 */
function makeC418Chain(
  ctx: AudioContext,
  reverbSend: number,
  filterSetup: (f: BiquadFilterNode) => void,
): GainNode {
  const t = ctx.currentTime;
  const masterBus = getC418MasterBus(ctx);

  const voiceOut = ctx.createGain();
  voiceOut.gain.setValueAtTime(1.0, t);

  const filter = ctx.createBiquadFilter();
  filterSetup(filter);

  voiceOut.connect(filter);
  filter.connect(masterBus);

  const reverbBus = getC418Reverb(ctx);
  const sendGain = ctx.createGain();
  sendGain.gain.setValueAtTime(reverbSend, t);
  voiceOut.connect(sendGain);
  sendGain.connect(reverbBus);

  return voiceOut;
}

// ── Shape voices ──────────────────────────────────────────────────────────────
//
// Register plan — each voice occupies a distinct frequency band and attack character:
//   Triangle  → Acoustic bass   — freq * 0.5, dry thump, low register
//   Square    → Rhodes EP       — freq,        warm sustain, mid register
//   Circle    → Celesta         — freq,        bell plonk, mid register, short decay
//   Star      → String pad      — freq,        slow attack, sustained, mid register
//   Diamond   → Vibraphone      — freq * 2,    mallet strike, upper-mid register
//   Cross     → Music box       — freq * 2,    high sparkle pluck, upper register

/**
 * Triangle → Acoustic bass (Sweden, Subwoofer Lullaby walking bass)
 * One octave down — clean low-end body with a soft finger attack.
 * Very dry — bass needs to stay grounded, not wash in reverb.
 */
function playC418Triangle(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  const bassFreq    = freq * 0.5; // one octave down
  const attack      = 0.010;     // soft finger pluck, not a click
  const decay       = 0.15;
  const sustainGain = gain * 0.80;
  const release     = 0.35;
  const hold        = dur != null ? Math.max(0, dur - attack - decay - release) : 0.6;
  const releaseAt   = t + attack + decay + hold;
  const stopAt      = releaseAt + release + 0.05;

  const voiceOut = makeC418Chain(ctx, 0.08, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(600, t); // warm low-end, no upper harmonics
    f.Q.setValueAtTime(0.4, t);
  });

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(gain * 1.4, t + attack);
  env.gain.exponentialRampToValueAtTime(sustainGain, t + attack + decay);
  env.gain.setValueAtTime(sustainGain, releaseAt);
  env.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  env.connect(voiceOut);

  // Sine body — clean fundamental
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(bassFreq, t);
  osc1.connect(env);

  // Triangle adds just enough warmth / body without brightness
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(bassFreq, t);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.35, t);
  osc2.connect(g2); g2.connect(env);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(stopAt);
}

/**
 * Square → Rhodes electric piano (Minecraft, Clark)
 * Warm tine sound at the fundamental — characteristic FM-like bell body
 * that blooms slightly and sustains. Slightly detuned for the Rhodes "wobble".
 */
function playC418Square(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  const attack      = 0.005; // Rhodes has a fast attack
  const decay       = 0.25;
  const sustainGain = gain * 0.60;
  const release     = 0.55;
  const hold        = dur != null ? Math.max(0, dur - attack - decay - release) : 0.8;
  const releaseAt   = t + attack + decay + hold;
  const stopAt      = releaseAt + release + 0.05;

  const voiceOut = makeC418Chain(ctx, 0.20, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2200, t); // warm but present
    f.Q.setValueAtTime(0.5, t);
  });

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(gain * 1.1, t + attack);
  env.gain.exponentialRampToValueAtTime(sustainGain, t + attack + decay);
  env.gain.setValueAtTime(sustainGain, releaseAt);
  env.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  env.connect(voiceOut);

  // Fundamental tine — sine for the Rhodes body
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, t);
  osc1.detune.setValueAtTime(-4, t); // slight detune for Rhodes warmth
  osc1.connect(env);

  // Octave partial — decays fast, gives the initial "click" of the tine strike
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, t);
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.0001, t);
  env2.gain.linearRampToValueAtTime(gain * 0.35, t + attack);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + attack + 0.30);
  osc2.connect(env2); env2.connect(voiceOut);

  // Inharmonic tine partial at ×2.76 — the characteristic Rhodes bell overtone
  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 2.76, t);
  const env3 = ctx.createGain();
  env3.gain.setValueAtTime(0.0001, t);
  env3.gain.linearRampToValueAtTime(gain * 0.18, t + attack);
  env3.gain.exponentialRampToValueAtTime(0.0001, t + attack + 0.18);
  osc3.connect(env3); env3.connect(voiceOut);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(t + attack + 0.35);
  osc3.start(t); osc3.stop(t + attack + 0.22);
}

/**
 * Circle → Celesta (Sweden, Wet Hands melody)
 * The iconic C418 lead. Bright bell-like plonk at the fundamental,
 * pure exponential decay — celestas don't sustain, they ring and fade.
 * No hold phase regardless of run length.
 */
function playC418Circle(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  // Celesta always decays naturally — run length only slightly extends the ring
  const attack  = 0.006;
  const decay   = dur != null ? Math.min(1.8, 0.8 + dur * 0.4) : 1.2;
  const stopAt  = t + attack + decay + 0.05;

  const voiceOut = makeC418Chain(ctx, 0.32, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t); // celesta is bright but not harsh
    f.Q.setValueAtTime(0.4, t);
  });

  // Fundamental
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, t);
  osc1.detune.setValueAtTime(5, t); // slightly sharp — celesta tuning warmth
  const env1 = ctx.createGain();
  env1.gain.setValueAtTime(0.0001, t);
  env1.gain.linearRampToValueAtTime(gain * 1.1, t + attack);
  env1.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  osc1.connect(env1); env1.connect(voiceOut);

  // Octave — decays faster, gives the bell its initial brightness
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, t);
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.0001, t);
  env2.gain.linearRampToValueAtTime(gain * 0.30, t + attack);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay * 0.45);
  osc2.connect(env2); env2.connect(voiceOut);

  // Inharmonic celesta partial — gives the glassy, slightly metallic quality
  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 3.5, t);
  const env3 = ctx.createGain();
  env3.gain.setValueAtTime(0.0001, t);
  env3.gain.linearRampToValueAtTime(gain * 0.10, t + attack);
  env3.gain.exponentialRampToValueAtTime(0.0001, t + attack + 0.15);
  osc3.connect(env3); env3.connect(voiceOut);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(t + attack + decay * 0.5);
  osc3.start(t); osc3.stop(t + attack + 0.18);
}

/**
 * Star → String pad synth (Mice on Venus, Blind Spots)
 * Slow attack, long sustain, soft release — the held string texture
 * that sits underneath C418's melodies. Mid register, warm LPF.
 */
function playC418Star(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  const attack      = 0.35; // slow bloom — strings don't snap in
  const decay       = 0.20;
  const sustainGain = gain * 0.75;
  const release     = 0.70;
  const hold        = dur != null ? Math.max(0, dur - attack - decay - release) : 0.5;
  const releaseAt   = t + attack + decay + hold;
  const stopAt      = releaseAt + release + 0.05;

  const voiceOut = makeC418Chain(ctx, 0.25, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t); // warm, filtered — no harsh edge
    f.Q.setValueAtTime(0.5, t);
  });

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(sustainGain, t + attack + decay);
  env.gain.setValueAtTime(sustainGain, releaseAt);
  env.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  env.connect(voiceOut);

  // Two detuned saws — string ensemble chorus effect
  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(freq, t);
  osc1.detune.setValueAtTime(-7, t);
  osc1.connect(env);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(freq, t);
  osc2.detune.setValueAtTime(7, t);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.7, t);
  osc2.connect(g2); g2.connect(env);

  // Octave below at low gain — adds body without muddiness
  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 0.5, t);
  const g3 = ctx.createGain();
  g3.gain.setValueAtTime(0.25, t);
  osc3.connect(g3); g3.connect(env);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(stopAt);
  osc3.start(t); osc3.stop(stopAt);
}

/**
 * Diamond → Vibraphone (Subwoofer Lullaby mallet melody)
 * One octave up — the warm vibraphone register. Fast mallet strike,
 * exponential decay with a gentle sustain for held notes.
 */
function playC418Diamond(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  const vibeFreq    = freq * 2; // one octave up — vibraphone register
  const attack      = 0.004;
  const decay       = 0.30;
  const sustainGain = gain * 0.40;
  const release     = 0.40;
  const hold        = dur != null ? Math.max(0, dur - attack - decay - release) : 0.4;
  const releaseAt   = t + attack + decay + hold;
  const stopAt      = releaseAt + release + 0.05;

  const voiceOut = makeC418Chain(ctx, 0.28, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4000, t);
    f.Q.setValueAtTime(0.5, t);
  });

  // Fundamental — the warm tone of the bar
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(vibeFreq, t);
  const env1 = ctx.createGain();
  env1.gain.setValueAtTime(0.0001, t);
  env1.gain.linearRampToValueAtTime(gain * 1.0, t + attack);
  env1.gain.exponentialRampToValueAtTime(sustainGain, t + attack + decay);
  env1.gain.setValueAtTime(sustainGain, releaseAt);
  env1.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  osc1.connect(env1); env1.connect(voiceOut);

  // Vibraphone inharmonic partial at ×3.87 — the characteristic shimmer
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(vibeFreq * 3.87, t);
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.0001, t);
  env2.gain.linearRampToValueAtTime(gain * 0.18, t + attack);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + attack + 0.20);
  osc2.connect(env2); env2.connect(voiceOut);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(t + attack + 0.24);
}

/**
 * Cross → Music box / glockenspiel (Dog, Cat)
 * Two octaves up — the high, delicate, slightly toy-like sparkle.
 * Pure exponential decay, no sustain — music boxes don't hold notes.
 * High reverb send so it shimmers in the room.
 */
function playC418Cross(ctx: AudioContext, freq: number, gain: number, t: number, dur?: number) {
  const boxFreq = freq * 4; // two octaves up — music box register
  // Music box always decays — run length slightly extends ring like a damper pedal
  const attack  = 0.003;
  const decay   = dur != null ? Math.min(2.0, 0.6 + dur * 0.5) : 0.9;
  const stopAt  = t + attack + decay + 0.05;

  const voiceOut = makeC418Chain(ctx, 0.38, (f) => {
    f.type = 'lowpass';
    f.frequency.setValueAtTime(6000, t); // bright but tape-veiled by master LPF
    f.Q.setValueAtTime(0.4, t);
  });

  // Fundamental — pure sine, the clean box tone
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(boxFreq, t);
  const env1 = ctx.createGain();
  env1.gain.setValueAtTime(0.0001, t);
  env1.gain.linearRampToValueAtTime(gain * 1.0, t + attack);
  env1.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  osc1.connect(env1); env1.connect(voiceOut);

  // Inharmonic partial at ×2.76 — the metallic ring of the tine
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(boxFreq * 2.76, t);
  const env2 = ctx.createGain();
  env2.gain.setValueAtTime(0.0001, t);
  env2.gain.linearRampToValueAtTime(gain * 0.22, t + attack);
  env2.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay * 0.3);
  osc2.connect(env2); env2.connect(voiceOut);

  osc1.start(t); osc1.stop(stopAt);
  osc2.start(t); osc2.stop(t + attack + decay * 0.35);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Play a C418-themed note for the given shape.
 * Registered in soundProfiles.ts — called by audioEngine routing.
 */
export function playC418Note(
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
    const freq = c418RowToHz(row, gridHeight);
    const baseGain = 0.10 + density * 0.18;
    const gain = baseGain / Math.sqrt(voiceCount ?? 1);
    const dur  = noteDuration;

    switch (shape) {
      case 'circle':   playC418Circle(ctx, freq, gain, t, dur);   break;
      case 'square':   playC418Square(ctx, freq, gain, t, dur);   break;
      case 'diamond':  playC418Diamond(ctx, freq, gain, t, dur);  break;
      case 'triangle': playC418Triangle(ctx, freq, gain, t, dur); break;
      case 'star':     playC418Star(ctx, freq, gain, t, dur);     break;
      case 'cross':    playC418Cross(ctx, freq, gain, t, dur);    break;
      default: {
        const masterBus = getC418MasterBus(ctx);
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
