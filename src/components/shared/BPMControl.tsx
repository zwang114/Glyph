import { useEffect, useState } from 'react';
import { useAudioStore } from '../../stores/audioStore';

/**
 * BPM + transport control panel (Figma 77:344).
 *
 * Layout: two 106×106 sections joined by a 16px notched connector (the
 * "canvas" panel shape).
 *   Left card (stacked vertically, 8px gap):
 *     1. BPM number input (black rounded rect, 38px)
 *     2. PLAY / PAUSE pill button (black filled = active style)
 *   Right card (stacked vertically, 8px gap):
 *     1. LOOP pill (outlined = inactive; filled-black when toggled on)
 *     2. RESTART pill (outlined — momentary)
 */
export function BPMControl() {
  const bpm = useAudioStore((s) => s.bpm);
  const setBpm = useAudioStore((s) => s.setBpm);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const isLooping = useAudioStore((s) => s.isLooping);
  const startPlayback = useAudioStore((s) => s.startPlayback);
  const pausePlayback = useAudioStore((s) => s.pausePlayback);
  const resetPlayback = useAudioStore((s) => s.resetPlayback);
  const toggleLooping = useAudioStore((s) => s.toggleLooping);

  // Local string buffer so the user can clear the field and type freely.
  const [draft, setDraft] = useState<string>(String(bpm));
  useEffect(() => {
    setDraft(String(bpm));
  }, [bpm]);

  const commitBpm = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) {
      setBpm(n);
      setDraft(String(useAudioStore.getState().bpm));
    } else {
      setDraft(String(bpm));
    }
  };

  return (
    <div className="bpm-panel-body">
      {/* ── Left card: BPM field + PLAY/PAUSE ────────────────────── */}
      <div className="bpm-section bpm-section--left">
        <div className="bpm-input-box">
          <input
            type="text"
            inputMode="numeric"
            className="bpm-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitBpm}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setBpm(bpm + 1);
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setBpm(bpm - 1);
              }
            }}
          />
          <span className="bpm-input-label">BPM</span>
        </div>
        <button
          type="button"
          className="bpm-pill-btn bpm-pill-btn--filled"
          onClick={isPlaying ? pausePlayback : startPlayback}
        >
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
      </div>

      {/* ── Right card: LOOP + RESTART ───────────────────────────── */}
      <div className="bpm-section bpm-section--right">
        <button
          type="button"
          className={`bpm-pill-btn bpm-pill-btn--outline${
            isLooping ? ' bpm-pill-btn--active' : ''
          }`}
          onClick={toggleLooping}
          aria-pressed={isLooping}
        >
          LOOP
        </button>
        <button
          type="button"
          className="bpm-pill-btn bpm-pill-btn--outline"
          onClick={resetPlayback}
        >
          RESTART
        </button>
      </div>
    </div>
  );
}
