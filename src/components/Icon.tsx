export type IconName =
  | 'plus' | 'x' | 'trash' | 'eye' | 'eye-off' | 'fit' | 'locate' | 'lock' | 'unlock'
  | 'upload' | 'cursor' | 'point' | 'line' | 'polygon' | 'rect' | 'draw'
  | 'copy' | 'check' | 'sun' | 'moon' | 'auto' | 'file' | 'globe' | 'arrow-right' | 'swap' | 'settings'
  | 'github' | 'circle' | 'chevron' | 'ruler' | 'area' | 'compass';

interface IconProps {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 14 }: IconProps) {
  const c = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'plus': return <svg {...c}><path d="M8 3v10M3 8h10" /></svg>;
    case 'x': return <svg {...c}><path d="M4 4l8 8M12 4l-8 8" /></svg>;
    case 'trash': return <svg {...c}><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4l.5 9a1 1 0 001 1h3a1 1 0 001-1L11 4" /></svg>;
    case 'eye': return <svg {...c}><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" /></svg>;
    case 'eye-off': return <svg {...c}><path d="M2 2l12 12M6.7 6.7a2 2 0 002.8 2.8M4.5 4.5C2.4 5.8 1 8 1 8s2.5 5 7 5c1.3 0 2.5-.4 3.5-1M8 3c4.5 0 7 5 7 5s-.6 1.2-1.7 2.4" /></svg>;
    case 'fit': return <svg {...c}><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" /></svg>;
    case 'locate': return <svg {...c}><path d="M8 14s4-3.4 4-7a4 4 0 10-8 0c0 3.6 4 7 4 7z" /><circle cx="8" cy="7" r="1.5" /></svg>;
    case 'lock': return <svg {...c}><rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5 7V5a3 3 0 016 0v2" /></svg>;
    case 'unlock': return <svg {...c}><rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5 7V5a3 3 0 015.9-.8" /></svg>;
    case 'upload': return <svg {...c}><path d="M8 11V3M5 6l3-3 3 3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1" /></svg>;
    case 'cursor': return <svg {...c}><path d="M3 2l5 12 2-5 5-2z" /></svg>;
    case 'point': return <svg {...c}><circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="5.5" /></svg>;
    case 'line': return <svg {...c}><circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="13" cy="4" r="1.5" fill="currentColor" stroke="none" /><path d="M3 12L13 4" /></svg>;
    case 'polygon': return <svg {...c}><path d="M3 6l5-3 5 3-2 7h-6z" /></svg>;
    case 'rect': return <svg {...c}><rect x="3" y="4" width="10" height="8" /></svg>;
    case 'draw': return <svg {...c}><path d="M2 14l4-1 7-7-3-3-7 7-1 4z" /></svg>;
    case 'copy': return <svg {...c}><rect x="5" y="5" width="8" height="9" rx="1" /><path d="M3 10V3a1 1 0 011-1h6" /></svg>;
    case 'check': return <svg {...c}><path d="M3 8l3 3 7-7" /></svg>;
    case 'sun': return <svg {...c}><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" /></svg>;
    case 'moon': return <svg {...c}><path d="M8 2a4 4 0 006 6 6 6 0 11-6-6z" /></svg>;
    case 'auto': return <svg {...c}><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5v11" /><path d="M8 2.5a5.5 5.5 0 010 11" fill="currentColor" stroke="none" /></svg>;
    case 'file': return <svg {...c}><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /></svg>;
    case 'globe': return <svg {...c}><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6c-2-2-3-4-3-6s1-4 3-6z" /></svg>;
    case 'arrow-right': return <svg {...c}><path d="M3 8h10M9 4l4 4-4 4" /></svg>;
    case 'swap': return <svg {...c}><path d="M3 5h9M9 2l3 3-3 3M13 11H4M7 8l-3 3 3 3" /></svg>;
    case 'settings': return <svg {...c}><circle cx="8" cy="8" r="2" /><path d="M12.5 8a4.5 4.5 0 00-.08-.83l1.4-1.1-1.4-2.4-1.66.66a4.5 4.5 0 00-1.44-.83L9 1.75H7l-.32 1.75a4.5 4.5 0 00-1.44.83L3.58 3.67l-1.4 2.4 1.4 1.1A4.5 4.5 0 003.5 8a4.5 4.5 0 00.08.83l-1.4 1.1 1.4 2.4 1.66-.66c.42.34.9.63 1.44.83L7 14.25h2l.32-1.75c.54-.2 1.02-.49 1.44-.83l1.66.66 1.4-2.4-1.4-1.1c.05-.27.08-.55.08-.83z" /></svg>;
    case 'circle': return <svg {...c}><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" /></svg>;
    case 'chevron': return <svg {...c}><path d="M6 4l4 4-4 4" /></svg>;
    case 'ruler': return <svg {...c}><path d="M2.5 11.5l9-9 2 2-9 9z" /><path d="M5 9l1 1M7 7l1 1M9 5l1 1" /></svg>;
    case 'area': return <svg {...c}><path d="M3 5l5-2 5 3-2 7H5z" /><path d="M6 7h4M6 10h3" /></svg>;
    case 'compass': return <svg {...c}><circle cx="8" cy="8" r="6" /><path d="M10.5 5.5l-1.6 3.4-3.4 1.6 1.6-3.4z" /><circle cx="8" cy="8" r=".6" fill="currentColor" stroke="none" /></svg>;
    case 'github': return <svg {...c} fill="currentColor" stroke="none"><path fillRule="evenodd" clipRule="evenodd" d="M8 .5C3.58.5 0 4.08 0 8.5c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.34c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.22.82 1.22.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.77-.2-3.64-.89-3.64-3.95 0-.87.31-1.58.82-2.14-.08-.2-.36-1.01.08-2.11 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.91.08 2.11.51.56.82 1.27.82 2.14 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8.004 8.004 0 0016 8.5C16 4.08 12.42.5 8 .5z" /></svg>;
    default: return null;
  }
}
