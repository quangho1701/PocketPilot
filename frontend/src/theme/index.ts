import type { ViewStyle } from 'react-native';

export const COLORS = {
  ink: '#102A43',
  inkStrong: '#071B2D',
  navy: '#0B2B40',
  navySoft: '#123A52',
  teal: '#0F766E',
  tealDark: '#0B5D57',
  mint: '#DDF5ED',
  mintSoft: '#EFFAF6',
  sky: '#E8F3F8',
  amber: '#D97706',
  amberSoft: '#FFF6DF',
  coral: '#D95D4F',
  coralSoft: '#FFF0ED',
  background: '#F4F7F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAF9',
  text: '#102A43',
  textSecondary: '#627386',
  textMuted: '#94A3B1',
  border: '#DDE6E4',
  borderStrong: '#C8D5D2',
  success: '#147D64',
  error: '#C2413B',
  errorSoft: '#FFF0EE',
} as const;

export const CARD_SHADOW: ViewStyle = {
  shadowColor: '#082131',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 20,
  elevation: 3,
};

export const SOFT_SHADOW: ViewStyle = {
  shadowColor: '#082131',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
};

export const RADII = {
  small: 10,
  medium: 16,
  large: 22,
  pill: 999,
} as const;
