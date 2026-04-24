export type ShortcutScope = 'global' | 'editor';

export interface ShortcutDef {
  id: string;
  keys: string;
  label: string;
  scope: ShortcutScope;
  category: 'tools' | 'edit' | 'view' | 'navigation';
}

export const SHORTCUTS: ShortcutDef[] = [
  // Tools
  { id: 'tool.pixel',  keys: 'B', label: 'Pixel / Brush tool', scope: 'editor', category: 'tools' },
  { id: 'tool.line',   keys: 'L', label: 'Line tool',          scope: 'editor', category: 'tools' },
  { id: 'tool.rect',   keys: 'R', label: 'Rectangle tool',     scope: 'editor', category: 'tools' },
  { id: 'tool.fill',   keys: 'F', label: 'Fill tool',          scope: 'editor', category: 'tools' },
  { id: 'tool.eraser', keys: 'E', label: 'Eraser tool',        scope: 'editor', category: 'tools' },

  // Edit
  { id: 'edit.undo', keys: 'mod+Z',       label: 'Undo', scope: 'global', category: 'edit' },
  { id: 'edit.redo', keys: 'mod+Shift+Z', label: 'Redo', scope: 'global', category: 'edit' },

  // View
  { id: 'view.grid',    keys: 'G', label: 'Toggle grid',        scope: 'editor', category: 'view' },
  { id: 'view.metrics', keys: 'M', label: 'Toggle metrics',     scope: 'editor', category: 'view' },
  { id: 'view.onion',   keys: 'O', label: 'Toggle onion skin',  scope: 'editor', category: 'view' },

  // Navigation
  { id: 'nav.escape',       keys: 'Esc',         label: 'Deselect canvas',        scope: 'editor', category: 'navigation' },
  { id: 'nav.delete',       keys: 'Delete',      label: 'Delete selected canvas', scope: 'editor', category: 'navigation' },
  { id: 'nav.pan',          keys: 'Space+drag',  label: 'Pan workspace',          scope: 'editor', category: 'navigation' },
  { id: 'nav.duplicateTab', keys: 'Alt+drag',    label: 'Duplicate canvas (tab)', scope: 'editor', category: 'navigation' },
  { id: 'nav.zoom',         keys: 'Scroll',      label: 'Zoom workspace',         scope: 'editor', category: 'navigation' },
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function formatKey(keys: string): string {
  return keys
    .replace(/mod\+/g, isMac ? '⌘' : 'Ctrl+')
    .replace(/Shift\+/g, isMac ? '⇧' : 'Shift+')
    .replace(/Alt\+/g, isMac ? '⌥' : 'Alt+');
}

export function getShortcutsByCategory() {
  const groups: Record<string, ShortcutDef[]> = {};
  for (const s of SHORTCUTS) {
    (groups[s.category] ??= []).push(s);
  }
  return groups;
}
