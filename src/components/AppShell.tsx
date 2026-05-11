import { useContext } from 'react';
import { Icon } from './Icon';
import { ThemeCtx, type ThemeMode } from './ThemeCtx';

export type Tab = 'visualizer' | 'converter';

interface AppShellProps {
  tab: Tab;
  setTab: (t: Tab) => void;
}

const REPO_URL = 'https://github.com/LiLittleCat/geotools';

export function AppShell({ tab, setTab }: AppShellProps) {
  const { theme, setTheme } = useContext(ThemeCtx);
  const sub =
    tab === 'visualizer'
      ? 'Layer-based geometry viewer & editor'
      : 'Transform format & coordinate systems';

  return (
    <div className="app-header">
      <div className="header-row">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <span>GeoTools</span>
          <span className="brand-sub">{sub}</span>
        </div>
        <div className="header-right">
          <nav className="app-nav" aria-label="Main views">
            <button className={`app-nav-item ${tab === 'visualizer' ? 'active' : ''}`} onClick={() => setTab('visualizer')}>
              Visualizer
            </button>
            <button className={`app-nav-item ${tab === 'converter' ? 'active' : ''}`} onClick={() => setTab('converter')}>
              Converter
            </button>
          </nav>
          <a
            className="header-link"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            title="View on GitHub"
            aria-label="View on GitHub"
          >
            <Icon name="github" size={14} />
          </a>
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
    </div>
  );
}
