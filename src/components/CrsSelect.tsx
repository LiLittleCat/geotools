import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from './Icon';
import {
  CRS_PRESETS_CHINA,
  CRS_PRESETS_COMMON,
  CRS_PRESETS_UTM_NS,
  crsShort,
  resolveCrs,
} from '../lib/proj';

interface CrsSelectOption {
  value: string;
  title: string;
  description: string;
  group: string;
}

function crsKindAndUnits(id: string, label: string): { kind: string; units: string } {
  if (id === 'EPSG:3857' || /utm/i.test(label)) return { kind: 'projected', units: 'meters' };
  return { kind: 'geographic', units: 'degrees' };
}

function normalizedCrsName(id: string, label: string) {
  if (id === 'EPSG:4326') return 'WGS84';
  if (id === 'EPSG:4490') return 'CGCS2000';
  return label
    .replace(/\s*\((lng\/lat|meters?)\)\s*/gi, ' ')
    .replace(/\blng\/lat\b/gi, ' ')
    .replace(/\bmeters?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCrsOption(
  value: string,
  title: string,
  label: string,
  group: string,
): CrsSelectOption {
  const { kind, units } = crsKindAndUnits(title, label);
  return {
    value,
    title,
    description: `${normalizedCrsName(title, label)} · ${kind} · ${units}`,
    group,
  };
}

const CRS_SELECT_GROUPS = [
  {
    label: 'Common',
    options: CRS_PRESETS_COMMON.map((preset) => (
      buildCrsOption(preset.id, preset.id, preset.label, 'Common')
    )),
  },
  {
    label: 'China',
    options: CRS_PRESETS_CHINA.map((preset) => (
      buildCrsOption(preset.id, preset.id, preset.label, 'China')
    )),
  },
  {
    label: 'UTM Zones',
    options: CRS_PRESETS_UTM_NS.map((preset) => (
      buildCrsOption(preset.id, preset.id, preset.label, 'UTM Zones')
    )),
  },
] satisfies { label: string; options: CrsSelectOption[] }[];

const CRS_SELECT_OPTIONS = CRS_SELECT_GROUPS.flatMap((group) => group.options);

function selectedCrsOption(value: string) {
  return (
    CRS_SELECT_OPTIONS.find((option) => option.value === value) ||
    CRS_SELECT_OPTIONS.find((option) => resolveCrs(option.value) === resolveCrs(value))
  );
}

export function CrsSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const selected = selectedCrsOption(value);
  const selectedLabel = selected?.title || crsShort(value);
  const selectedDescription = selected?.description || value;
  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return CRS_SELECT_GROUPS;

    return CRS_SELECT_GROUPS
      .map((group) => ({
        ...group,
        options: group.options.filter((option) => (
          option.title.toLowerCase().includes(query) ||
          option.description.toLowerCase().includes(query) ||
          option.value.toLowerCase().includes(query) ||
          option.group.toLowerCase().includes(query)
        )),
      }))
      .filter((group) => group.options.length > 0);
  }, [search]);
  const resultCount = filteredGroups.reduce((count, group) => count + group.options.length, 0);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 6;
      const maxHeight = 320;
      const below = window.innerHeight - rect.bottom - gap - 8;
      const above = rect.top - gap - 8;
      const openUp = below < 220 && above > below;
      const height = Math.max(180, Math.min(maxHeight, openUp ? above : below));
      setMenuStyle({
        position: 'fixed',
        top: openUp ? Math.max(8, rect.top - height - gap) : rect.bottom + gap,
        left: rect.left,
        width: rect.width,
        maxHeight: height,
      });
    };
    const closeOnOutside = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('click', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('click', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div className="crs-select-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`crs-select-trigger ${open ? 'open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open) setSearch('');
          setOpen((current) => !current);
        }}
      >
        <span className="crs-select-value">
          <span className="crs-select-title">{selectedLabel}</span>
          <span className="crs-select-desc">{selectedDescription}</span>
        </span>
        <span className="crs-select-chevron" aria-hidden="true">
          <Icon name="chevron" size={12} />
        </span>
      </button>
      {open && createPortal(
        <div className="crs-select-menu" ref={menuRef} style={menuStyle}>
          <label className="crs-select-search">
            <span>Search CRS</span>
            <input
              ref={searchRef}
              type="search"
              value={search}
              placeholder="EPSG, UTM zone, Mercator..."
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="crs-select-results-meta">
            {resultCount === 1 ? '1 result' : `${resultCount} results`}
          </div>
          <div className="crs-select-options" role="listbox">
            {filteredGroups.map((group) => (
              <div className="crs-select-group" key={group.label}>
                <div className="crs-select-group-label">{group.label}</div>
                {group.options.map((option) => {
                  const active = option.value === selected?.value;
                  return (
                    <button
                      key={`${group.label}-${option.value}`}
                      type="button"
                      className={`crs-select-option ${active ? 'active' : ''}`}
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <span className="crs-select-option-copy">
                        <span className="crs-select-option-title">{option.title}</span>
                        <span className="crs-select-option-desc">{option.description}</span>
                      </span>
                      {active && <Icon name="check" size={12} />}
                    </button>
                  );
                })}
              </div>
            ))}
            {filteredGroups.length === 0 && (
              <div className="crs-select-empty">No matching CRS</div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
