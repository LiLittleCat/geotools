import { AppShell, type Tab } from './AppShell';
import { CrsConverter } from './CrsConverter';
import { FormatConverter } from './FormatConverter';

interface ConverterShellProps {
  tab: Extract<Tab, 'format' | 'crs'>;
  setTab: (t: Tab) => void;
}

function Converter({ module }: { module: Extract<Tab, 'format' | 'crs'> }) {
  return (
    <div className="converter-shell">
      <div className="conv-body">
        {module === 'format' ? <FormatConverter /> : <CrsConverter />}
      </div>
    </div>
  );
}

export function ConverterShell({ tab, setTab }: ConverterShellProps) {
  return (
    <>
      <AppShell tab={tab} setTab={setTab} />
      <Converter module={tab} />
    </>
  );
}
