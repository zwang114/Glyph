import type { PixelShape } from '../types/editor';
import { useCanvasStore } from '../stores/canvasStore';

// Shared AudioContext (reuses the one from useClickSound if already created)
let ctx: AudioContext | null = null;

// Master bus for scheduled glyph playback. Every note connects here (instead
// of directly to `context.destination`) so stopPlayback() can silence the
// whole sequence — including notes whose oscillators have already been
// .start()'d but haven't reached their scheduled .stop() yet — by ramping
// the bus to 0 and disconnecting.
let sequenceBus: GainNode | null = null;
let sequenceCompressor: DynamicsCompressorNode | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/**
 * Lazily (re)create the sequence bus so each playGlyph has a fresh bus.
 * Signal path: notes → sequenceBus (gain) → compressor → destination.
 * The compressor catches dense chords before they clip the output.
 */
function getSequenceBus(context: AudioContext): GainNode {
  if (!sequenceBus) {
    sequenceBus = context.createGain();
    sequenceBus.gain.setValueAtTime(1, context.currentTime);
    sequenceCompressor = context.createDynamicsCompressor();
    sequenceCompressor.threshold.setValueAtTime(-18, context.currentTime);
    sequenceCompressor.knee.setValueAtTime(6, context.currentTime);
    sequenceCompressor.ratio.setValueAtTime(4, context.currentTime);
    sequenceCompressor.attack.setValueAtTime(0.003, context.currentTime);
    sequenceCompressor.release.setValueAtTime(0.12, context.currentTime);
    sequenceBus.connect(sequenceCompressor);
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
    case 'metaball': return 'sine'; // FM modulated below
    case 'star': return 'sine';     // AM modulated below
  }
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
  const releaseTime = Math.max(0.06, Math.min(duration * 0.4, 0.22));
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

  if (shape === 'star') {
    // AM synthesis: carrier modulated by a low-freq sine → bell-like
    const carrier = context.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, t);

    const modFreq = 6;
    const modGain = context.createGain();
    modGain.gain.setValueAtTime(0.5, t);
    const mod = context.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(modFreq, t);
    mod.connect(modGain);
    modGain.connect(masterGain.gain);

    carrier.connect(masterGain);
    carrier.start(t);
    carrier.stop(oscStop);
    mod.start(t);
    mod.stop(oscStop);
  } else if (shape === 'metaball') {
    // FM synthesis: modulator at 2x carrier frequency
    const carrier = context.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, t);

    const modFreqVal = freq * 2;
    const modDepth = context.createGain();
    modDepth.gain.setValueAtTime(freq * 0.8, t);
    modDepth.gain.exponentialRampToValueAtTime(freq * 0.05, envelopeEnd);
    const mod = context.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(modFreqVal, t);
    mod.connect(modDepth);
    modDepth.connect(carrier.frequency);

    carrier.connect(masterGain);
    carrier.start(t);
    carrier.stop(oscStop);
    mod.start(t);
    mod.stop(oscStop);
  } else {
    const osc = context.createOscillator();
    osc.type = shapeToOscType(shape);
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(masterGain);
    osc.start(t);
    osc.stop(oscStop);
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
let playheadRaf: number | null = null;

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
  onEnd?: () => void
) {
  stopPlayback();
  try {
    const context = getCtx();
    const bus = getSequenceBus(context);
    const colDuration = 60 / bpm;
    // Audio-clock time at which column `firstCol` is heard.
    const now = context.currentTime + 0.05;
    const firstCol = Math.max(0, Math.floor(startCol));
    // How far ahead of the playhead we schedule each column. Must be long
    // enough to survive a dropped frame or a slow rAF tick, short enough
    // that live edits feel responsive. ~60ms is the standard web-audio
    // lookahead.
    const lookahead = 0.06;

    // Track which columns we've already scheduled in the current pass so
    // the tick doesn't schedule the same column twice.
    let lastScheduledCol = firstCol - 1;

    const scheduleColumn = (col: number) => {
      // Re-read the current frame every time so live edits are honored.
      const frame = useCanvasStore.getState().canvases[canvasId];
      if (!frame) return;
      if (col < 0 || col >= frame.gridWidth) return;
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

      let voices = 0;
      for (let row = 0; row < gridHeight; row++) {
        if (isRunStart(row, col)) voices++;
      }
      if (voices === 0) return;
      const voiceGain = gain / Math.sqrt(voices);

      for (let row = 0; row < gridHeight; row++) {
        if (!isRunStart(row, col)) continue;

        // Walk right to find the full extent of this run: consecutive
        // same-shape cells until a gap or shape change.
        const here = shapeAt(row, col)!;
        let runEnd = col;
        while (
          runEnd + 1 < gridWidth &&
          shapeAt(row, runEnd + 1) === here
        ) {
          runEnd += 1;
        }
        const runLength = runEnd - col + 1;

        // 95% of the run span gives a tiny gap at the end — audible as a
        // fresh attack when the next re-trigger segment (or adjacent note)
        // begins. Makes dense patterns feel rhythmic instead of slurred.
        const noteDuration = runLength * colDuration * 0.95;

        const freq = rowToHz(row, gridHeight);
        playNote(freq, here, voiceGain, safeStart, noteDuration, context, bus);
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

      onPlayheadUpdate?.(playheadCol);

      const reachedEnd = colFloat >= gridWidth;
      if (!reachedEnd) {
        playheadRaf = requestAnimationFrame(tick);
      } else if (loop) {
        playGlyph(canvasId, bpm, 0, true, onPlayheadUpdate, onEnd);
      } else {
        onEnd?.();
      }
    };
    playheadRaf = requestAnimationFrame(tick);
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
  if (playheadRaf !== null) {
    cancelAnimationFrame(playheadRaf);
    playheadRaf = null;
  }
}
