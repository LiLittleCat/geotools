import { useEffect, useState } from 'react';
import { ThemeCtx, type ThemeMode } from './components/ThemeCtx';
import { Visualizer } from './components/Visualizer';
import { ConverterShell } from './components/Converter';
import type { Tab } from './components/AppShell';
import { TWEAKS_DEFAULTS } from './lib/constants';

function App() {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return ((localStorage.getItem('geotools.tab') as Tab) || 'visualizer');
    } catch {
      return 'visualizer';
    }
  });
  useEffect(() => {
    try { localStorage.setItem('geotools.tab', tab); } catch { /* ignore */ }
  }, [tab]);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem('geotools.theme') as ThemeMode) || TWEAKS_DEFAULTS.theme;
    } catch {
      return TWEAKS_DEFAULTS.theme;
    }
  });

  useEffect(() => {
    try { localStorage.setItem('geotools.theme', theme); } catch { /* ignore */ }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'auto' ? (mq.matches ? 'dark' : 'light') : theme;
      document.documentElement.setAttribute('data-theme', resolved);
    };
    apply();
    if (theme === 'auto') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      {tab === 'visualizer'
        ? <Visualizer tab={tab} setTab={setTab} />
        : <ConverterShell tab={tab} setTab={setTab} />}
    </ThemeCtx.Provider>
  );
}

export default App;
