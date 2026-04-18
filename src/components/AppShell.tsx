import type { ReactNode } from 'react';
import { useContext } from 'react';
import { Icon } from './Icon';
import { ThemeCtx, type ThemeMode } from './ThemeCtx';

export type Tab = 'visualizer' | 'converter';

interface AppShellProps {
  tab: Tab;
  setTab: (t: Tab) => void;
  rightMeta?: ReactNode;
}

export function AppShell({ tab, setTab, rightMeta }: AppShellProps) {
  const { theme, setTheme } = useContext(ThemeCtx);
  const sub =
    tab === 'visualizer'
      ? 'Layer-based geometry viewer & editor'
      : 'Transform format & coordinate systems';

  return (
    <div className="app-header">
      <div className="header-row">
        <div className="brand">
          <div className="brand-mark" />
          <span>GeoTools</span>
          <span className="brand-sub">{sub}</span>
        </div>
        <div className="header-right">
          {rightMeta && <div className="header-meta">{rightMeta}</div>}
          <div className="theme-toggle" title="Theme">
            {(['light', 'dark', 'auto'] as ThemeMode[]).map((t) => (
              <button
                key={t}
                className={theme === t ? 'active' : ''}
                onClick={() => setTheme(t)}
                aria-label={t}
              >
                <Icon name={t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'auto'} size={12} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="header-row tabs-row">
        <div className="tabs">
          <button className={`tab ${tab === 'visualizer' ? 'active' : ''}`} onClick={() => setTab('visualizer')}>
            Visualizer
          </button>
          <button className={`tab ${tab === 'converter' ? 'active' : ''}`} onClick={() => setTab('converter')}>
            Converter
          </button>
        </div>
      </div>
    </div>
  );
}
