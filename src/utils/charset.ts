export interface CharDef {
  unicode: number;
  name: string;
  char: string;
}

const range = (start: number, end: number): number[] =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i);

const UPPERCASE = range(0x41, 0x5a); // A-Z
const LOWERCASE = range(0x61, 0x7a); // a-z
const DIGITS = range(0x30, 0x39);    // 0-9

const PUNCTUATION = [
  0x20,  // space
  0x21,  // !
  0x22,  // "
  0x27,  // '
  0x28,  // (
  0x29,  // )
  0x2c,  // ,
  0x2d,  // -
  0x2e,  // .
  0x2f,  // /
  0x3a,  // :
  0x3b,  // ;
  0x3f,  // ?
  0x40,  // @
  0x26,  // &
  0x23,  // #
  0x24,  // $
  0x25,  // %
  0x2b,  // +
  0x3d,  // =
  0x5b,  // [
  0x5d,  // ]
  0x7b,  // {
  0x7d,  // }
  0x3c,  // <
  0x3e,  // >
  0x2a,  // *
  0x5e,  // ^
  0x7e,  // ~
  0x60,  // `
  0x7c,  // |
  0x5c,  // \
  0x5f,  // _
];

const UNICODE_NAMES: Record<number, string> = {
  0x20: 'space', 0x21: 'exclam', 0x22: 'quotedbl', 0x23: 'numbersign',
  0x24: 'dollar', 0x25: 'percent', 0x26: 'ampersand', 0x27: 'quotesingle',
  0x28: 'parenleft', 0x29: 'parenright', 0x2a: 'asterisk', 0x2b: 'plus',
  0x2c: 'comma', 0x2d: 'hyphen', 0x2e: 'period', 0x2f: 'slash',
  0x3a: 'colon', 0x3b: 'semicolon', 0x3c: 'less', 0x3d: 'equal',
  0x3e: 'greater', 0x3f: 'question', 0x40: 'at',
  0x5b: 'bracketleft', 0x5c: 'backslash', 0x5d: 'bracketright',
  0x5e: 'asciicircum', 0x5f: 'underscore', 0x60: 'grave',
  0x7b: 'braceleft', 0x7c: 'bar', 0x7d: 'braceright', 0x7e: 'asciitilde',
};

function unicodeName(code: number): string {
  if (UNICODE_NAMES[code]) return UNICODE_NAMES[code];
  if (code >= 0x41 && code <= 0x5a) return String.fromCharCode(code);
  if (code >= 0x61 && code <= 0x7a) return String.fromCharCode(code);
  if (code >= 0x30 && code <= 0x39) return `${String.fromCharCode(code)}`;
  return `uni${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

export const BASIC_LATIN: CharDef[] = [
  ...UPPERCASE,
  ...LOWERCASE,
  ...DIGITS,
  ...PUNCTUATION,
].map((unicode) => ({
  unicode,
  name: unicodeName(unicode),
  char: String.fromCharCode(unicode),
}));

export const BASIC_LATIN_MAP = new Map(
  BASIC_LATIN.map((c) => [c.unicode.toString(16).padStart(4, '0'), c])
);
