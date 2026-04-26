import type { PixelShape } from '../types/editor';
import { startAmbient, stopAmbient, playForestNote } from './ambientEngine';
import { playC418Note } from './c418Engine';
import { startC418Ambient, stopC418Ambient } from './c418AmbientEngine';

export type NotePlayerFn = (
  row: number,
  gridHeight: number,
  shape: PixelShape,
  density: number,
  startTime?: number,
  voiceCount?: number,
  noteDuration?: number,
) => void;

export interface SoundProfile {
  id: string;
  label: string;
  startFn?: () => void;
  stopFn?: () => void;
  notePlayerFn?: NotePlayerFn;
}

// NOTE: the 'forest' id is referenced by name in GlyphEditorView.tsx snap handler.
// If you rename it, update that comparison too.
export const SOUND_PROFILES: SoundProfile[] = [
  {
    id: 'default',
    label: 'Default',
  },
  {
    id: 'forest',
    label: 'Forest',
    startFn: startAmbient,
    stopFn: stopAmbient,
    notePlayerFn: playForestNote,
  },
  {
    id: 'c418',
    label: 'C418',
    startFn: startC418Ambient,
    stopFn: stopC418Ambient,
    notePlayerFn: playC418Note,
  },
  // Add new profiles here — no other files need to change.
];

export function getProfile(id: string): SoundProfile | undefined {
  return SOUND_PROFILES.find(p => p.id === id);
}

export const DEFAULT_PROFILE_ID = SOUND_PROFILES[0].id;
