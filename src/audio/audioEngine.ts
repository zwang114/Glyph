import type { PixelShape } from '../types/editor';
import { useCanvasStore } from '../stores/canvasStore';
import { getProfile, DEFAULT_PROFILE_ID } from './soundProfiles';

let _activeProfileId: string = DEFAULT_PROFILE_ID;
export function setSoundProfile(id: string): void {
  _activeProfileId = id;
}

// Shared AudioContext (reuses the one from useClickSound if already created)
let ctx: AudioContext | null = null;

// Master bus for scheduled glyph playback. Every note connects here (instead
// of directly to `context.destination`) so stopPlayback() can silence the
// whole sequence — including notes whose oscillators have already been
// .start()'d but haven't reached their scheduled .stop() yet — by ramping
// the bus to 0 and disconnecting.
let sequenceBus: GainNode | null = null;
let sequenceCompressor: DynamicsCompressorNode | null = null;

export function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/**
 * Lazily (re)create the sequence bus so each playGlyph has a fresh bus.
 *
 * Signal chain:
 *   notes → bus → lowpass → compressor → destination  (dry)
 *   notes → bus → lowpass → preDelay (22ms) → compressor  (one reflection)
 *
 * The lowpass rolls off above ~8kHz for tape warmth. The single non-feedback
 * pre-delay adds subtle room presence without any ringing or energy buildup.
 * Compressor keeps dense chords from clipping.
 */
function getSequenceBus(context: AudioContext): GainNode {
  if (!sequenceBus) {
    const t = context.currentTime;

    sequenceBus = context.createGain();
    sequenceBus.gain.setValueAtTime(1, t);

    // Gentle air shelf — rolls off only above ~8kHz
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(8000, t);
    lowpass.Q.setValueAtTime(0.5, t);

    sequenceCompressor = context.createDynamicsCompressor();
    sequenceCompressor.threshold.setValueAtTime(-18, t);
    sequenceCompressor.knee.setValueAtTime(6, t);
    sequenceCompressor.ratio.setValueAtTime(4, t);
    sequenceCompressor.attack.setValueAtTime(0.003, t);
    sequenceCompressor.release.setValueAtTime(0.12, t);

    // Non-feedback pre-delay — a single early reflection at ~22ms.
    // No feedback loop means no resonator ringing after notes stop; the
    // reflection simply decays to silence the moment the dry signal does.
    // This adds subtle room depth without any echo buildup or pulsing throb.
    const preDelay = context.createDelay(0.1);
    preDelay.delayTime.setValueAtTime(0.022, t);
    const preDelayGain = context.createGain();
    preDelayGain.gain.setValueAtTime(0.18, t); // quiet reflection — presence not echo

    // Signal path:
    //   bus → lowpass → compressor → destination  (dry)
    //   bus → lowpass → preDelay → preDelayGain → compressor  (one reflection)
    sequenceBus.connect(lowpass);
    lowpass.connect(sequenceCompressor);           // dry path
    lowpass.connect(preDelay);
    preDelay.connect(preDelayGain);
    preDelayGain.connect(sequenceCompressor);      // single reflection
    sequenceCompressor.connect(context.destination);
  }
  return sequenceBus;
}

// C major pentatonic from C3 (MIDI 48) to C5 (MIDI 72).
// Degrees: C D E G A — no semitone pairs, so dense vertical stacks
// stay consonant (no minor-second / minor-ninth clashes that the old
// chromatic mapping produced when a whole column was filled).
const PENTATONIC_C3_C5 = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72];

// Row → MIDI note, quantized to the pentatonic scale above.
// Top row = C5 (highest), bottom row = C3 (lowest). With a 32-row
// canvas and 11 pentatonic degrees, adjacent rows either share a note
// or jump by one scale degree — tolerant of sketchy drawing without
// ever producing a dissonant interval.
function rowToHz(row: number, gridHeight: number): number {
  const t = row / Math.max(1, gridHeight - 1);
  // `1 - t` inverts the axis so row 0 lands on the TOP of the scale.
  const idx = Math.round((1 - t) * (PENTATONIC_C3_C5.length - 1));
  const midi = PENTATONIC_C3_C5[idx];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Shape → oscillator type + optional modulation
type OscType = OscillatorType;

function shapeToOscType(shape: PixelShape): OscType {
  switch (shape) {
    case 'square': return 'square';
    case 'circle': return 'sine';
    case 'diamond': return 'sawtooth';
    case 'triangle': return 'triangle';
    case 'cross': return 'triangle'; // only used by the generic path — cross has its own branch
    case 'star': return 'sine';      // AM modulated below
  }
}

/**
 * Shared 0.5s mono noise buffer, generated lazily and cached. Used as the
 * pick/excitation burst at the front of each guitar note.
 */
let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(context: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const length = Math.floor(context.sampleRate * 0.5);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function playNote(
  freq: number,
  shape: PixelShape,
  gain: number,
  startTime: number,
  duration: number,
  context: AudioContext,
  destination: AudioNode = context.destination
) {
  const t = startTime;
  // Proper ADSR so long sustained notes (merged horizontal runs) actually
  // hold their level instead of fading out mid-note.
  //
  //   A — attack     : ~12ms exponential ramp to peak gain
  //   D — decay      : 120ms fall to sustain level (80% of peak)
  //   S — sustain    : hold flat until `duration` elapses
  //   R — release    : exponential ramp to silence
  //
  // For short notes (duration < attack+decay) the sustain phase collapses
  // to nothing, which is musically correct — tiny notes still get a full
  // attack+release arc without a weird plateau.
  const attack = 0.012;
  const decay = 0.12;
  const sustainLevel = gain * 0.8;
  const releaseTime = Math.max(0.04, Math.min(duration * 0.15, 0.08));
  const envelopeEnd = t + duration + releaseTime;
  // Oscillators stop AFTER the envelope has ramped the gain to silence,
  // so the hard stop never cuts a live waveform.
  const oscStop = envelopeEnd + 0.03;

  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(0.0001, t);
  // Exponential attack reads as more musical than linear.
  masterGain.gain.exponentialRampToValueAtTime(gain, t + attack);
  // Decay to the sustain plateau. Clamp the decay endpoint to `duration`
  // so a very short note still reaches sustain before release kicks in.
  const sustainStart = Math.min(t + attack + decay, t + duration);
  masterGain.gain.exponentialRampToValueAtTime(sustainLevel, sustainStart);
  // Hold the sustain level flat until the release. This is the line that
  // makes long merged-run notes actually sound sustained instead of
  // decaying to half-volume by their midpoint (old behavior).
  masterGain.gain.setValueAtTime(sustainLevel, t + duration);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, envelopeEnd);

  // Short high-pass to tame DC offset and sub-rumble from FM/AM modulation
  // swings — another common source of low-frequency "pop" at note boundaries.
  const hpf = context.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.setValueAtTime(60, t);
  hpf.Q.setValueAtTime(0.707, t);

  masterGain.connect(hpf);
  hpf.connect(destination);

  if (shape === 'circle') {
    // ── Bright lo-fi piano ────────────────────────────────────────────
    // Sine fundamental + octave harmonic + brief sparkle transient at 3×
    // (two octaves + a fifth). The transient decays in 80ms so it reads
    // as attack shimmer, not a persistent overtone.
    const fundamental = context.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(freq, t);

    const octave = context.createOscillator();
    octave.type = 'sine';
    octave.frequency.setValueAtTime(freq * 2, t);

    const octaveGain = context.createGain();
    octaveGain.gain.setValueAtTime(0.28, t); // raised from 0.18

    // Sparkle transient — 3× freq (two octaves + fifth), fast decay
    const sparkle = context.createOscillator();
    sparkle.type = 'sine';
    sparkle.frequency.setValueAtTime(freq * 3, t);
    const sparkleGain = context.createGain();
    sparkleGain.gain.setValueAtTime(0.08, t);
    sparkleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);

    fundamental.connect(masterGain);
    octave.connect(octaveGain);
    octaveGain.connect(masterGain);
    sparkle.connect(sparkleGain);
    sparkleGain.connect(masterGain);

    fundamental.start(t); fundamental.stop(oscStop);
    octave.start(t); octave.stop(oscStop);
    sparkle.start(t); sparkle.stop(t + 0.1);

  } else if (shape === 'square') {
    // ── Warm mid-range keys ───────────────────────────────────────────
    // Triangle body (richer than sine, cleaner than square) + fixed
    // mid-range lowpass for presence + quiet octave-up sine for sparkle.
    const body = context.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(freq, t);

    // Octave-up sine adds brightness and presence without buzz
    const bright = context.createOscillator();
    bright.type = 'sine';
    bright.frequency.setValueAtTime(freq * 2, t);
    const brightGain = context.createGain();
    brightGain.gain.setValueAtTime(0.15, t);

    // Fixed mid-range lowpass — no closing ramp, stays open and present
    const thump = context.createBiquadFilter();
    thump.type = 'lowpass';
    thump.frequency.setValueAtTime(2200, t);
    thump.Q.setValueAtTime(0.5, t);

    body.connect(thump);
    thump.connect(masterGain);
    bright.connect(brightGain);
    brightGain.connect(masterGain);

    body.start(t); body.stop(oscStop);
    bright.start(t); bright.stop(oscStop);

  } else if (shape === 'diamond') {
    // ── Lo-fi keys (Rhodes-ish) ───────────────────────────────────────
    // Triangle (warm body) + very quiet filtered sawtooth (the bell-like
    // tine buzz of a Rhodes). Lowpass closes quickly so it mellows out.
    const tine = context.createOscillator();
    tine.type = 'triangle';
    tine.frequency.setValueAtTime(freq, t);

    const buzz = context.createOscillator();
    buzz.type = 'sawtooth';
    buzz.frequency.setValueAtTime(freq, t);

    const buzzGain = context.createGain();
    buzzGain.gain.setValueAtTime(0.18, t); // raised from 0.12 — more bell-like brightness

    // Tine filter — stays more open for bright lo-fi character
    const toneFilter = context.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.setValueAtTime(freq * 9, t);   // raised from freq * 6
    toneFilter.frequency.exponentialRampToValueAtTime(freq * 7, t + 0.3); // raised from freq * 5
    toneFilter.Q.setValueAtTime(2.0, t); // raised from 1.4 — resonant peak on attack

    tine.connect(toneFilter);
    buzz.connect(buzzGain);
    buzzGain.connect(toneFilter);
    toneFilter.connect(masterGain);

    tine.start(t); tine.stop(oscStop);
    buzz.start(t); buzz.stop(oscStop);

  } else if (shape === 'triangle') {
    // ── Vibraphone / marimba ──────────────────────────────────────────
    // Sine at root + sine at 4x (the characteristic metallic overtone of
    // mallet percussion). The overtone decays faster than the fundamental
    // to mimic the way a mallet strike rings then settles.
    const root = context.createOscillator();
    root.type = 'sine';
    root.frequency.setValueAtTime(freq, t);

    const bell = context.createOscillator();
    bell.type = 'sine';
    bell.frequency.setValueAtTime(freq * 4.0, t);

    const bellGain = context.createGain();
    bellGain.gain.setValueAtTime(0.28, t);
    // Overtone decays in ~120ms, root sustains normally
    bellGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    root.connect(masterGain);
    bell.connect(bellGain);
    bellGain.connect(masterGain);

    root.start(t); root.stop(oscStop);
    bell.start(t); bell.stop(t + 0.15);

  } else if (shape === 'star') {
    // ── Airy pad ─────────────────────────────────────────────────────
    // Very slow AM (0.5Hz) so the modulation reads as gentle breathing /
    // tremolo rather than the 6Hz flutter of the old version.
    // Two detuned carriers make it wide and ethereal.
    const carrier1 = context.createOscillator();
    carrier1.type = 'sine';
    carrier1.frequency.setValueAtTime(freq, t);
    carrier1.detune.setValueAtTime(-6, t);

    const carrier2 = context.createOscillator();
    carrier2.type = 'sine';
    carrier2.frequency.setValueAtTime(freq, t);
    carrier2.detune.setValueAtTime(+6, t);

    const carrierMix = context.createGain();
    carrierMix.gain.setValueAtTime(0.5, t);
    carrier1.connect(carrierMix);
    carrier2.connect(carrierMix);

    // Tremolo via AM — 2Hz for classic lo-fi chord pad movement
    const lfo = context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(2.0, t); // raised from 0.5 — classic tremolo range
    const lfoGain = context.createGain();
    lfoGain.gain.setValueAtTime(0.3, t); // raised from 0.2 — more pronounced movement
    lfo.connect(lfoGain);
    lfoGain.connect(masterGain.gain);

    // Subtle highpass on carrier mix — keeps the pad from muddying low end
    // when stacked with bass or keys in a strummed column.
    const padHpf = context.createBiquadFilter();
    padHpf.type = 'highpass';
    padHpf.frequency.setValueAtTime(200, t);
    padHpf.Q.setValueAtTime(0.5, t);
    carrierMix.connect(padHpf);
    padHpf.connect(masterGain);

    carrier1.start(t); carrier1.stop(oscStop);
    carrier2.start(t); carrier2.stop(oscStop);
    lfo.start(t); lfo.stop(oscStop);

  } else if (shape === 'cross') {
    // ── Reverb guitar ────────────────────────────────────────────────
    // Re-write the envelope for this voice: a fast attack + long
    // exponential decay (a plucked string doesn't sustain flat — it
    // decays immediately from peak). Override the earlier ADSR schedule
    // so the voice truly decays.
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(0.0001, t);
    masterGain.gain.exponentialRampToValueAtTime(gain * 1.05, t + 0.006); // quick pluck
    // Tighter ring tail — shorter min/max so the cross voice settles
    // cleanly in strummed columns without ringing over other shapes.
    const ringTail = Math.max(0.5, Math.min(1.0, duration + 0.4));
    masterGain.gain.exponentialRampToValueAtTime(0.0001, t + ringTail);

    // Body: triangle (warm fundamental) + saw (string buzz), detuned
    // unison for the shimmer of two slightly out-of-tune strings.
    const detune = 6;
    const tri1 = context.createOscillator();
    tri1.type = 'triangle';
    tri1.frequency.setValueAtTime(freq, t);
    tri1.detune.setValueAtTime(-detune, t);
    const tri2 = context.createOscillator();
    tri2.type = 'triangle';
    tri2.frequency.setValueAtTime(freq, t);
    tri2.detune.setValueAtTime(+detune, t);
    const saw = context.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(freq, t);

    // Body mix — triangles louder than saw (saw adds the buzz character
    // without dominating the tone).
    const bodyMix = context.createGain();
    bodyMix.gain.setValueAtTime(0.55, t);
    const sawMix = context.createGain();
    sawMix.gain.setValueAtTime(0.22, t);

    tri1.connect(bodyMix);
    tri2.connect(bodyMix);
    saw.connect(sawMix);

    // Pick noise burst — a tiny slice of highpassed noise at the attack
    // gives the "thwack" of a pick against string. Envelopes out in ~40ms.
    const noise = context.createBufferSource();
    noise.buffer = getNoiseBuffer(context);
    const noiseHpf = context.createBiquadFilter();
    noiseHpf.type = 'highpass';
    noiseHpf.frequency.setValueAtTime(1800, t);
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(gain * 0.3, t + 0.003); // reduced from 0.45
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    noise.connect(noiseHpf);
    noiseHpf.connect(noiseGain);

    // Tone filter — lowpass that snaps open at the attack then settles
    // down. Makes the pluck sound bright-then-warm like a guitar body.
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.setValueAtTime(1.1, t);
    tone.frequency.setValueAtTime(Math.max(1400, freq * 4), t);
    tone.frequency.exponentialRampToValueAtTime(
      Math.max(900, freq * 2.4),
      t + 0.25
    );

    // Route: [body + saw + noise] → tone filter → masterGain (→ hpf → dest)
    bodyMix.connect(tone);
    sawMix.connect(tone);
    noiseGain.connect(tone);
    tone.connect(masterGain);

    const cStop = t + ringTail + 0.05;
    tri1.start(t); tri1.stop(cStop);
    tri2.start(t); tri2.stop(cStop);
    saw.start(t); saw.stop(cStop);
    noise.start(t); noise.stop(t + 0.06);
  } else {
    // Fallback — plain sine for any future shape not yet assigned a voice.
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(masterGain);
    osc.start(t); osc.stop(oscStop);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/** Play a single pixel note immediately (draw feedback). */
export function playPixel(
  row: number,
  gridHeight: number,
  shape: PixelShape,
  density: number
) {
  const profile = getProfile(_activeProfileId);
  if (profile?.notePlayerFn) {
    profile.notePlayerFn(row, gridHeight, shape, density, undefined, 1);
    return;
  }
  try {
    const context = getCtx();
    const freq = rowToHz(row, gridHeight);
    const gain = 0.15 + density * 0.25;
    playNote(freq, shape, gain, context.currentTime, 0.12, context);
  } catch {
    // ignore audio errors
  }
}

// Scheduled node stop handles so we can cancel playback
let scheduledStops: (() => void)[] = [];
let playbackTimeout: ReturnType<typeof setTimeout> | null = null;
// One rAF handle per active canvas so stopPlayback can kill them all.
const playheadRafs: Map<string, number> = new Map();

/**
 * Live column scheduler. Instead of baking the entire sequence at Play
 * time, each column is scheduled ~60ms ahead once the playhead approaches
 * it — and the frame is re-read from the canvas store on every scheduling
 * step. So new pixels, shape changes, and density changes applied during
 * playback are picked up as the playhead reaches their column (next loop
 * for columns already passed).
 *
 * `canvasId` identifies which frame to read every tick.
 * `bpm` is frozen at start; change it via the store's toggleLooping-style
 * restart if you want it live.
 */
export function playGlyph(
  canvasId: string,
  bpm: number,
  startCol: number = 0,
  loop: boolean = false,
  onPlayheadUpdate?: (col: number) => void,
  onEnd?: () => void,
  // Shared audio-clock origin so multiple canvases started together stay
  // in perfect sync. Pass the same value to all playGlyph calls in a batch.
  sharedNow?: number
) {
  // Cancel any existing rAF for this specific canvas (not all canvases).
  const existingRaf = playheadRafs.get(canvasId);
  if (existingRaf !== undefined) cancelAnimationFrame(existingRaf);
  playheadRafs.delete(canvasId);
  try {
    const context = getCtx();
    const bus = getSequenceBus(context);
    const colDuration = 60 / bpm;
    // Audio-clock time at which column `firstCol` is heard.
    // Use the shared origin if provided so all canvases are phase-locked.
    const now = sharedNow ?? (context.currentTime + 0.05);
    const firstCol = Math.max(0, Math.floor(startCol));
    // How far ahead of the playhead we schedule each column. Must be long
    // enough to survive a dropped frame or a slow rAF tick, short enough
    // that live edits feel responsive. ~60ms is the standard web-audio
    // lookahead.
    const lookahead = 0.06;

    // Track which columns we've already scheduled in the current pass so
    // the tick doesn't schedule the same column twice.
    let lastScheduledCol = firstCol - 1;
    // Throttle playhead position writes to ~30fps so the canvas redraw
    // subscription doesn't fire every frame. 60fps redraws saturate the
    // main thread in production builds when combined with mouse input.
    let lastPlayheadUpdateAt = 0;

    const scheduleColumn = (col: number) => {
      // Re-read the current frame every time so live edits are honored.
      const frame = useCanvasStore.getState().canvases[canvasId];
      if (!frame) return;
      if (col < 0 || col >= frame.gridWidth) return;
      // Muted canvas: the playhead still advances (tick handles that), but no
      // notes are scheduled. Toggling mute mid-playback cleanly silences
      // from the next scheduled column onward.
      if (frame.muted) return;
      const { pixels, pixelShapes, pixelShape, pixelDensity, gridHeight, gridWidth } = frame;
      const gain = 0.2 + pixelDensity * 0.25;
      const startTime = now + (col - firstCol) * colDuration;
      // If we've already slipped past this column's start time, play it
      // immediately rather than scheduling in the past (which would cause
      // the browser to play everything instantly and pile up).
      const safeStart = Math.max(startTime, context.currentTime + 0.005);

      // ── Voice count for per-column 1/√n gain ────────────────────────────
      // A cell only counts as a voice if it STARTS a run at this column,
      // i.e. the pixel to its left is either off or a different shape.
      // Otherwise the note is already sustaining from an earlier column and
      // shouldn't be re-summed here.
      const shapeAt = (row: number, c: number): PixelShape | null => {
        if (!pixels[row]?.[c]) return null;
        return pixelShapes?.[row]?.[c] ?? pixelShape;
      };
      // A cell is a run-start if its left neighbor is off or a different
      // shape (or it's at column 0). A continuous same-shape horizontal run
      // is one sustained note, no matter how long.
      const isRunStart = (row: number, c: number): boolean => {
        const here = shapeAt(row, c);
        if (!here) return false;
        if (c === 0) return true;
        return shapeAt(row, c - 1) !== here;
      };

      // ── Collect all run-start voices for this column ──────────────────────
      // Each entry records the row, shape, and pre-computed run duration so
      // the strum logic below can group by shape without re-walking the grid.
      interface Voice {
        row: number;
        shape: PixelShape;
        noteDuration: number;
      }
      const columnVoices: Voice[] = [];
      for (let row = 0; row < gridHeight; row++) {
        if (!isRunStart(row, col)) continue;
        const here = shapeAt(row, col)!;
        let runEnd = col;
        while (runEnd + 1 < gridWidth && shapeAt(row, runEnd + 1) === here) {
          runEnd += 1;
        }
        const runLength = runEnd - col + 1;
        // 95% of the run span gives a tiny gap at the end — audible as a
        // fresh attack when the next re-trigger segment begins.
        columnVoices.push({ row, shape: here, noteDuration: runLength * colDuration * 0.95 });
      }

      if (columnVoices.length === 0) return;

      // 1/√n gain scaling across ALL voices in the column (unchanged).
      const voiceGain = gain / Math.sqrt(columnVoices.length);

      // ── Per-shape strum groups ─────────────────────────────────────────────
      // Group voices by shape. Groups with 2+ members get a strum offset +
      // micro jitter. Single-voice groups (or solo shapes) fire at safeStart
      // with no offset — same as before.
      const shapeGroups = new Map<PixelShape, Voice[]>();
      for (const v of columnVoices) {
        const group = shapeGroups.get(v.shape) ?? [];
        group.push(v);
        shapeGroups.set(v.shape, group);
      }

      for (const [, group] of shapeGroups) {
        const shouldStrum = group.length >= 2;

        // Strum order: bottom-to-top (highest row index fires first → upward strum).
        // Sort descending by row so index 0 in the sorted array = bottom of canvas.
        if (shouldStrum) {
          group.sort((a, b) => b.row - a.row);
        }

        group.forEach((v, strumIdx) => {
          // Relative strum offset: voice 0 fires at safeStart, each subsequent
          // voice fires 18ms later. Total spread = (N-1) * 0.018s regardless
          // of where on the grid the voices sit.
          const strumOffset = shouldStrum ? strumIdx * 0.018 : 0;
          // ±4ms humanization jitter — makes the timing feel played, not programmed.
          const jitter = shouldStrum ? (Math.random() - 0.5) * 0.008 : 0;
          const noteStart = safeStart + strumOffset + jitter;

          const activeProfile = getProfile(_activeProfileId);
          if (activeProfile?.notePlayerFn) {
            activeProfile.notePlayerFn(v.row, gridHeight, v.shape, pixelDensity, noteStart, columnVoices.length, v.noteDuration);
          } else {
            const freq = rowToHz(v.row, gridHeight);
            playNote(freq, v.shape, voiceGain, noteStart, v.noteDuration, context, bus);
          }
        });
      }
    };

    // Drive the playhead via rAF, synced to the audio clock. Each tick:
    //   1. compute the fractional column the playhead is at,
    //   2. if we're close enough to a not-yet-scheduled column, schedule it,
    //   3. publish the playhead position for the canvas overlay.
    const tick = () => {
      const frame = useCanvasStore.getState().canvases[canvasId];
      if (!frame) return;
      const gridWidth = frame.gridWidth;
      const elapsed = context.currentTime - now;
      const colFloat = firstCol + elapsed / colDuration;
      const playheadCol = Math.max(firstCol, Math.min(gridWidth, colFloat));

      // Schedule any columns whose start time is within the lookahead
      // window and that we haven't scheduled yet.
      const lookaheadCol = firstCol + (elapsed + lookahead) / colDuration;
      while (
        lastScheduledCol + 1 < gridWidth &&
        lastScheduledCol + 1 <= lookaheadCol
      ) {
        lastScheduledCol += 1;
        scheduleColumn(lastScheduledCol);
      }

      const nowMs = performance.now();
      if (nowMs - lastPlayheadUpdateAt >= 33) {
        lastPlayheadUpdateAt = nowMs;
        onPlayheadUpdate?.(playheadCol);
      }

      const reachedEnd = colFloat >= gridWidth;
      if (!reachedEnd) {
        playheadRafs.set(canvasId, requestAnimationFrame(tick));
      } else if (loop) {
        // On loop, advance `now` by exactly one sequence length so the next
        // pass starts phase-locked to the beat grid — no drift accumulation.
        const nextNow = now + gridWidth * colDuration;
        playGlyph(canvasId, bpm, 0, true, onPlayheadUpdate, onEnd, nextNow);
      } else {
        playheadRafs.delete(canvasId);
        onEnd?.();
      }
    };
    playheadRafs.set(canvasId, requestAnimationFrame(tick));
  } catch {
    // ignore
  }
}

/** Stop any in-progress playback (cancels scheduled notes + rAF + timeout). */
export function stopPlayback() {
  // Silence the sequence bus: ramp to 0 in ~10ms to avoid a click, then
  // disconnect so any oscillators still scheduled to ring in the future
  // produce nothing audible.
  if (sequenceBus && ctx) {
    const t = ctx.currentTime;
    try {
      sequenceBus.gain.cancelScheduledValues(t);
      sequenceBus.gain.setValueAtTime(sequenceBus.gain.value, t);
      sequenceBus.gain.linearRampToValueAtTime(0, t + 0.01);
    } catch { /* ignore */ }
    const busToKill = sequenceBus;
    const compToKill = sequenceCompressor;
    // Disconnect after the short fade so the node is fully detached.
    setTimeout(() => {
      try { busToKill.disconnect(); } catch { /* ignore */ }
      try { compToKill?.disconnect(); } catch { /* ignore */ }
    }, 20);

    sequenceBus = null;
    sequenceCompressor = null;
  }
  for (const stop of scheduledStops) {
    try { stop(); } catch { /* ignore */ }
  }
  scheduledStops = [];
  if (playbackTimeout !== null) {
    clearTimeout(playbackTimeout);
    playbackTimeout = null;
  }
  for (const rafId of playheadRafs.values()) {
    cancelAnimationFrame(rafId);
  }
  playheadRafs.clear();
}
