import opentype from 'opentype.js';
import type { FontProject, Glyph } from '../../types/font';
import type { PixelShape } from '../../types/editor';
import { shapeToPathCommands } from '../shapes';

function glyphToPath(
  glyph: Glyph,
  project: FontProject,
  shape: PixelShape,
  density: number
): opentype.Path {
  const path = new opentype.Path();
  const pxSize = project.unitsPerEm / glyph.gridHeight;

  for (let r = 0; r < glyph.gridHeight; r++) {
    for (let c = 0; c < glyph.gridWidth; c++) {
      if (!glyph.pixels[r][c]) continue;

      const cmds = shapeToPathCommands(
        shape, c, r, glyph.gridHeight, pxSize, density, project.descender
      );

      for (const cmd of cmds) {
        switch (cmd.cmd) {
          case 'M': path.moveTo(cmd.args[0], cmd.args[1]); break;
          case 'L': path.lineTo(cmd.args[0], cmd.args[1]); break;
          case 'C': path.curveTo(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3], cmd.args[4], cmd.args[5]); break;
          case 'Q': path.quadTo(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3]); break;
          case 'Z': path.close(); break;
        }
      }
    }
  }

  return path;
}

export function compileFont(
  project: FontProject,
  glyphs: Record<string, Glyph>,
  shape: PixelShape = 'square',
  density: number = 1.0
): opentype.Font {
  const sampleGlyph = Object.values(glyphs)[0];
  const pxSize = project.unitsPerEm / (sampleGlyph?.gridHeight || 32);

  const notdefPath = new opentype.Path();
  notdefPath.moveTo(0, 0);
  notdefPath.lineTo(pxSize * 12, 0);
  notdefPath.lineTo(pxSize * 12, project.unitsPerEm);
  notdefPath.lineTo(0, project.unitsPerEm);
  notdefPath.close();

  const notdefGlyph = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: Math.round(pxSize * 12),
    path: notdefPath,
  });

  const otGlyphs: opentype.Glyph[] = [notdefGlyph];

  for (const glyph of Object.values(glyphs)) {
    const hasPixels = glyph.pixels.some((row) => row.some(Boolean));
    if (!hasPixels) continue;

    const path = glyphToPath(glyph, project, shape, density);
    const advanceWidth = Math.round(glyph.advanceWidth * pxSize);

    otGlyphs.push(
      new opentype.Glyph({
        name: glyph.name,
        unicode: glyph.unicode,
        advanceWidth,
        path,
      })
    );
  }

  return new opentype.Font({
    familyName: project.familyName,
    styleName: project.styleName,
    unitsPerEm: project.unitsPerEm,
    ascender: project.ascender,
    descender: project.descender,
    glyphs: otGlyphs,
  });
}

export function downloadFont(
  project: FontProject,
  glyphs: Record<string, Glyph>,
  format: 'otf' | 'ttf' = 'otf',
  shape: PixelShape = 'square',
  density: number = 1.0
) {
  const font = compileFont(project, glyphs, shape, density);
  const buffer = font.toArrayBuffer();
  const blob = new Blob([buffer], { type: 'font/opentype' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.familyName}-${project.styleName}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generatePreviewUrl(
  project: FontProject,
  glyphs: Record<string, Glyph>,
  shape: PixelShape = 'square',
  density: number = 1.0
): string {
  const font = compileFont(project, glyphs, shape, density);
  const buffer = font.toArrayBuffer();
  const blob = new Blob([buffer], { type: 'font/opentype' });
  return URL.createObjectURL(blob);
}
