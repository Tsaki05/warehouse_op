import { useState, useRef, useEffect } from 'react';

/**
 * Autocomplete per magatzems.
 * - multi=false (default): value = null | obj, onChange(obj | null)
 * - multi=true:            value = obj[], onChange(obj[])
 */
export default function MagatzemAutocomplete({
  magatzems = [],
  value,
  onChange,
  multi = false,
  placeholder = 'Cercar magatzem...',
  dark = false,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // normalize selection to array for internal logic
  const selected = multi ? (value || []) : (value ? [value] : []);

  const filtered = magatzems.filter(m => {
    const t = query.toLowerCase();
    if (!t) return true;
    return (m.nom || '').toLowerCase().includes(t) || m.codi_magatzem.toLowerCase().includes(t);
  });

  function toggle(m) {
    if (multi) {
      const exists = selected.find(s => s.codi_magatzem === m.codi_magatzem);
      onChange(exists
        ? selected.filter(s => s.codi_magatzem !== m.codi_magatzem)
        : [...selected, m]
      );
      // keep dropdown open for multi-select
    } else {
      onChange(m);
      setQuery('');
      setOpen(false);
    }
  }

  function clear(e) {
    e.stopPropagation();
    onChange(multi ? [] : null);
    setQuery('');
    setOpen(false);
  }

  const hasValue = multi ? selected.length > 0 : !!value;

  const displayText = (() => {
    if (multi) {
      if (selected.length === 0) return '';
      if (selected.length === 1) return selected[0].nom || selected[0].codi_magatzem;
      return `${selected.length} magatzems`;
    }
    return value ? (value.nom || value.codi_magatzem) : '';
  })();

  const showDropdown = open && (filtered.length > 0 || query.length > 0);

  return (
    <div className={`mag-auto${dark ? ' mag-auto--dark' : ''}`} ref={ref}>
      <div className="mag-auto-wrap">
        <input
          className="mag-auto-input"
          placeholder={displayText || placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {(hasValue || query) && (
          <button type="button" className="mag-auto-clear" onMouseDown={clear} tabIndex={-1}>✕</button>
        )}
      </div>
      {showDropdown && (
        <div className="mag-auto-dropdown">
          {filtered.length === 0 ? (
            <div className="mag-auto-empty">Cap magatzem trobat</div>
          ) : filtered.map(m => {
            const isSel = selected.some(s => s.codi_magatzem === m.codi_magatzem);
            return (
              <div
                key={m.codi_magatzem}
                className={`mag-auto-opt${isSel ? ' mag-auto-opt--sel' : ''}`}
                onMouseDown={() => toggle(m)}
              >
                {multi && (
                  <span className="mag-auto-opt-check">{isSel ? '✓' : ''}</span>
                )}
                <span className="mag-auto-opt-nom">{m.nom || m.codi_magatzem}</span>
                <span className="mag-auto-opt-cod">{m.codi_magatzem}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
