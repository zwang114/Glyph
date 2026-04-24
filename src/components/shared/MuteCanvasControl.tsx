import { useClickSound } from '../../hooks/useClickSound';

interface MuteCanvasControlProps {
  /** Current muted state for the target canvas. */
  value: boolean;
  /** True when no canvas is selected — the button renders but writes are no-ops. */
  isDisabled: boolean;
  /** Called with the desired new muted value. */
  onChange: (muted: boolean) => void;
}

/**
 * Per-canvas mute toggle. Models the Character tool visually (same pill panel,
 * same inner black box, same yellow-green accent) but carries a single button
 * that toggles audio on/off for the selected canvas. The playhead still runs
 * when muted — only note scheduling is suppressed in the audio engine.
 */
export function MuteCanvasControl({ value, isDisabled, onChange }: MuteCanvasControlProps) {
  const { playClick } = useClickSound();

  const handleClick = () => {
    if (isDisabled) return;
    playClick();
    onChange(!value);
  };

  return (
    <div className="character-input-box mute-canvas-box">
      <button
        type="button"
        className={`mute-canvas-btn${value ? ' is-muted' : ''}${isDisabled ? ' is-disabled' : ''}`}
        onClick={handleClick}
        aria-pressed={value}
        aria-label={value ? 'Unmute canvas' : 'Mute canvas'}
      >
        {value ? 'MUTED' : 'ON'}
      </button>
    </div>
  );
}
