import type { TextStyle, ViewStyle } from 'react-native';

// PocketPilot editorial ledger system. Fonts gracefully fall back on platforms
// where the supplied design-font files are not installed.
export const FONTS = { display: 'Georgia', body: 'System', mono: 'monospace' } as const;

export const COLORS = {
  parchment: '#EEE4C9', parchmentDeep: '#E6D9B8', ink: '#1E2A32', inkStrong: '#17251D', inkSoft: '#3A4750', navy: '#17251D', navySoft: '#23392E',
  green: '#23392E', greenDeep: '#17251D', oxblood: '#6E2B32', brass: '#A9843F', brassSoft: '#F3E6C6',
  rule: 'rgba(30,42,50,0.28)', surface: '#F8F1DE', surfaceMuted: '#EDE1C5', background: '#EEE4C9',
  text: '#1E2A32', textSecondary: '#3A4750', textMuted: '#667076', border: 'rgba(30,42,50,0.28)', borderStrong: '#1E2A32',
  teal: '#23392E', tealDark: '#17251D', mint: '#DEE6D7', mintSoft: '#E9EEE2', sky: '#E8E1D0',
  amber: '#856404', amberSoft: '#F3E6C6', coral: '#6E2B32', coralSoft: '#F2DEDC',
  success: '#15803D', error: '#B91C1C', errorSoft: '#F2DEDC',
} as const;

export const CARD_SHADOW: ViewStyle = {};
export const SOFT_SHADOW: ViewStyle = {};
export const RADII = { small: 0, medium: 2, large: 2, pill: 2 } as const;
export const TYPE: Record<'display' | 'body' | 'mono', TextStyle> = {
  display: { fontFamily: FONTS.display }, body: { fontFamily: FONTS.body }, mono: { fontFamily: FONTS.mono },
};
