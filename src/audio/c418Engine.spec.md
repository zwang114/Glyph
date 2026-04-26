# C418 / Minecraft-Inspired Sound Profile — Implementation Spec

File to create: `src/audio/c418Engine.ts`

A third sound profile evoking C418's Minecraft soundtrack — particularly tracks like "Sweden", "Subwoofer Lullaby", "Wet Hands", and "Mice on Venus". The defining qualities: **muted lo-fi synth pads, soft mallet tones, sparse plucks, deep ambient room reverb, slightly out-of-tune warmth, melancholy stillness**. Everything sits behind a gentle veil — nothing is bright or punchy. The sound is contemplative, lonely, blocky, peaceful.

Each shape gets a synth voice in a **completely different instrument family** from both the default profile and the forest profile. All voices use the **C major pentatonic** scale via `rowToHz()` so multi-shape columns stay consonant.

---

## Integration (already handled by soundProfiles.ts registry)

With the registry refactor already in place, integration is just adding an entry to `SOUND_PROFILES` in `soundProfiles.ts`:

```typescript
{
  id: 'c418',
  label: 'C418',
  notePlayerFn: playC418Note,
  // no startFn / stopFn — no ambient layer, just shape voices
}
```

No changes needed to `audioEngine.ts` or `audioStore.ts` — the registry handles routing automatically.

---

## Shared C418 reverb bus

C418's signature is the deep, slightly washed-out room reverb. Build a heavier reverb than the forest profile:

```typescript
let c418ReverbBus: GainNode | null = null;
```

Reverb signal chain:
- Master c418 gain → splits into dry path + reverb send
- **Reverb send**: four `DelayNode` instances at `0.06s`, `0.13s`, `0.21s`, `0.31s` with feedback gains `0.55`, `0.48`, `0.40`, `0.32`, all routed back into a shared feedback gain at `0.55` — longer tail than forest
- Reverb output → lowpass at `3200Hz` (Q `0.5`) — darker than forest, that "muffled through wool" C418 feeling
- Reverb send level: `0.65` — wetter than forest

Add a master profile lowpass at `5500Hz` (Q `0.4`) over the entire output — this is the lo-fi "tape veil" that sits over everything in C418's work.

Add subtle bitcrushing emulation: route through a `WaveShaper` node with a mild quantization curve (steps of `1/40`) — gives the ghost of an old sample-rate, very subtle, characteristic of C418's lo-fi texture.

---

## Export

```typescript
export function playC418Note(
  row: number,
  gridHeight: number,
  shape: PixelShape,
  density: number,
  startTime?: number
): void
```

Copy `rowToHz()` from `audioEngine.ts`. Use `gain = 0.10 + density * 0.18` — quieter overall, this profile leans on stillness.

---

## Shape voices — C418 character

### Circle → Sine Plonk (Wet Hands lead)
*The signature C418 lead — muted sine bell, soft attack, melancholy and clean.*
- Osc 1: sine at `freq`, gain `1.0`
- Osc 2: sine at `freq * 2`, gain `0.12` — subtle octave overtone
- Slight detune: osc1 detune `+3` cents, no LFO — just a tiny static detune for "out of tune piano" feel
- **Override standard envelope**: attack `15ms` (soft, not sharp), peak gain, exponential decay to `0.0001` over `1.1s`. No sustain
- Lowpass at `2400Hz`, Q `0.4` — softens the top
- **Reverb send: 0.7**
- Character: the "ping" of a Minecraft melody note. Soft, wet, slightly sad

### Square → Muted Pad (Sweden ambient layer)
*Slow, breathy, distant pad — the bed underneath everything in "Sweden".*
- Osc 1: triangle at `freq`, detune `-12` cents, gain `1.0`
- Osc 2: triangle at `freq`, detune `+12` cents, gain `1.0` — wider detune than forest, stronger chorus
- Osc 3: sine at `freq`, gain `0.4` — anchors the pitch behind the detune
- **Very slow attack**: attack `350ms`, decay `200ms`, sustain `0.85`, release `1100ms`
- Slow LFO on filter: sine at `0.4Hz` → modulates lowpass cutoff between `900Hz` and `1400Hz` over the duration
- Static lowpass center at `1100Hz`, Q `0.6`
- **Reverb send: 0.75**
- Character: a held synth pad swelling slowly. Almost vocal. The texture of empty space

### Diamond → Soft Mallet (Subwoofer Lullaby xylophone)
*A muted mallet — like a glockenspiel under a blanket. The sparse melodic notes in "Subwoofer Lullaby".*
- Osc 1: sine at `freq * 2` (one octave up — mallet register)
- Osc 2: sine at `freq * 4`, gain `0.18` — high overtone for the bell quality
- Osc 3: sine at `freq * 6`, gain `0.05` — subtle metallic ring, decays quickly
- Osc 3 envelope: peak at attack, exponential decay to `0.0001` by `t + 0.15`
- **Override standard envelope**: attack `4ms` (sharp mallet strike), exponential decay to `0.0001` over `0.8s`
- Lowpass at `freq * 8`, Q `0.7` — preserves bell quality but softens
- **Reverb send: 0.7**
- Character: a soft mallet hit on a glass or metal bar. The warmth of distance

### Triangle → Sub Pluck (Subwoofer Lullaby bass)
*The deep, fingerstyle bass that walks underneath C418's tracks.*
- Osc 1: sine at `freq * 0.5` (one octave down — bass register)
- Osc 2: triangle at `freq * 0.5`, gain `0.4` — adds finger warmth
- Pitch envelope: start at `freq * 0.52`, ramp to `freq * 0.5` over `40ms` — slight downward settle, like a finger landing on the string
- **Override standard envelope**: attack `12ms`, peak gain, exponential decay to `0.0001` over `1.4s`. No sustain
- Lowpass at `800Hz`, Q `0.5`
- Highpass at `60Hz` — cuts sub-rumble
- **Reverb send: 0.45** — less reverb on bass, keeps it grounded
- Character: a soft fingerstyle bass note in a quiet room

### Star → Harmonic Drone (Mice on Venus shimmer)
*The shimmering high drone that floats over many C418 tracks. Slightly inharmonic, dreamy.*
- Osc 1: sine at `freq * 2`
- Osc 2: sine at `freq * 3.01`, gain `0.4` — slightly inharmonic shimmer partial
- Osc 3: sine at `freq * 5.06`, gain `0.15` — very high inharmonic top
- Slow tremolo on osc2 only: LFO at `0.6Hz` → gain `0.3` → osc2 gain. Just that partial breathes
- **Very slow attack**: attack `500ms`, decay `300ms`, sustain `0.7`, release `1200ms` — emerges from silence
- Highpass at `800Hz` — sits in the upper register
- **Reverb send: 0.85** — most washed-out, feels distant
- Character: a high crystalline shimmer. The ringing of empty air at high altitude

### Cross → Distant Piano Note (Wet Hands main motif)
*A single piano note in an empty room — the most C418 sound there is.*
- Osc 1: sine at `freq`, gain `1.0`
- Osc 2: sine at `freq * 2`, gain `0.20` — first overtone
- Osc 3: sine at `freq * 3`, gain `0.08` — second overtone
- Osc 4: sine at `freq * 4.5`, gain `0.04` — high inharmonic, decays very fast
- All overtones decay faster than fundamental: osc 2 by `0.6s`, osc 3 by `0.3s`, osc 4 by `0.15s` — natural piano decay characteristic
- Slight detune on osc1: `+5` cents — that "slightly out of tune upright" warmth
- **Override standard envelope**: attack `8ms`, peak gain, exponential decay to `0.0001` over `1.6s`. No sustain
- Lowpass at `2800Hz`, Q `0.4`
- **Reverb send: 0.75**
- Character: a single struck piano key in a wooden room. Lonely, warm, melancholic

---

## Shape → instrument contrast table

| Shape    | Default        | Forest              | C418              |
|----------|----------------|---------------------|-------------------|
| Circle   | Lo-fi piano    | Kalimba             | Sine plonk        |
| Square   | Thumb bass     | Pan flute           | Muted pad         |
| Diamond  | Rhodes         | Crystal bowl        | Soft mallet       |
| Triangle | Vibraphone     | Taiko drum          | Sub pluck         |
| Star     | Airy AM pad    | Ocarina             | Harmonic drone    |
| Cross    | Reverb guitar  | Wind chime cluster  | Distant piano     |

Three completely different sonic worlds, all melodically compatible (same pentatonic scale).

---

## Do not change
- `audioEngine.ts` synthesis or architecture
- `ambientEngine.ts` voices or ambient layers
- The strum logic — `noteStart` already carries the offset
- Any canvas, drawing, font, or export logic

---

## Verification

With C418 profile active:
- Single circle → soft sine plonk, like a Wet Hands melody note
- Single square → slow swelling muted pad
- Single diamond → soft mallet hit, glockenspiel-like but distant
- Single triangle → fingerstyle bass note in a quiet room
- Single star → high shimmering inharmonic drone
- Single cross → a single piano note in an empty room
- Full glyph playback → feels like a sparse C418 cue. Slow, melancholic, contemplative. Notes ring out into the room and decay slowly. Everything sits behind a soft tape veil
