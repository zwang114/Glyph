export type EditorTool = 'pixel' | 'line' | 'rect' | 'fill' | 'eraser';

export type MirrorMode = 'none' | 'horizontal' | 'vertical' | 'both';

export type PixelShape = 'square' | 'circle' | 'diamond' | 'triangle' | 'metaball';

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}
