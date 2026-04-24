import { createContext } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
}

export const ThemeCtx = createContext<ThemeContextValue>({
  theme: 'auto',
  setTheme: () => {},
});
