import { getShortcutsByCategory, formatKey } from '../../shortcuts/registry';

const CATEGORY_LABELS: Record<string, string> = {
  tools: 'Tools',
  edit: 'Edit',
  view: 'View',
  navigation: 'Navigation',
};

const CATEGORY_ORDER = ['tools', 'edit', 'view', 'navigation'];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutHelpOverlay({ open, onClose }: Props) {
  if (!open) return null;

  const groups = getShortcutsByCategory();

  return (
    <div className="shortcut-overlay-backdrop" onClick={onClose}>
      <div className="shortcut-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-overlay-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="shortcut-overlay-close" onClick={onClose}>
            Esc
          </button>
        </div>
        <div className="shortcut-overlay-body">
          {CATEGORY_ORDER.map((cat) => {
            const items = groups[cat];
            if (!items) return null;
            return (
              <div key={cat} className="shortcut-group">
                <h3 className="shortcut-group-title">{CATEGORY_LABELS[cat]}</h3>
                {items.map((s) => (
                  <div key={s.id} className="shortcut-row">
                    <span className="shortcut-label">{s.label}</span>
                    <kbd className="shortcut-key">{formatKey(s.keys)}</kbd>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div className="shortcut-overlay-footer">
          Press <kbd>?</kbd> to toggle this panel
        </div>
      </div>
    </div>
  );
}
