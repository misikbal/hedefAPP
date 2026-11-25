export const themes = {
  dark: {
    bg: '#0E1116',
    s1: '#161B22',
    s2: '#1E242D',
    line: '#2A313B',
    line2: '#3A424E',
    nav: '#0B0E12',
    tx: '#ECE8E1',
    tx2: '#C9CDD3',
    mut: '#9AA3AE',
    acc: '#F0A63A',
    accTx: '#F0A63A',
    accDim: '#8A6430',
    onAcc: '#0E1116',
    inv: '#ECE8E1',
    onInv: '#0E1116',
    ok: '#5BB5A2',
    okTx: '#5BB5A2',
    pen: '#E0735A',
    penTx: '#EE8A73',
    penBg: '#2A1A17',
    dil: '#8FA7FF',
    oku: '#E7D7B8',
  },
  light: {
    bg: '#F4F2ED',
    s1: '#FFFFFF',
    s2: '#ECE9E2',
    line: '#DEDAD1',
    line2: '#BDB7AB',
    nav: '#FBFAF7',
    tx: '#16181C',
    tx2: '#3A3F47',
    mut: '#5C636D',
    acc: '#F0A63A',
    accTx: '#9A5A06',
    accDim: '#F4CF97',
    onAcc: '#16181C',
    inv: '#16181C',
    onInv: '#F4F2ED',
    ok: '#3E9A86',
    okTx: '#24705F',
    pen: '#D0573C',
    penTx: '#A8402A',
    penBg: '#FBEAE5',
    dil: '#6F8CF0',
    oku: '#C9AE7E',
  },
} as const;

export type ThemeName = keyof typeof themes;
export type ThemeColors = { readonly [K in keyof (typeof themes)['dark']]: string };

export const radius = { card: 16, cardSm: 14, button: 28, input: 12 } as const;
export const space = { 4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 14: 14, 16: 16, 18: 18, 20: 20 } as const;
/** En küçük dokunma alanı (dp) */
export const HIT = 44;
