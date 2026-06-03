import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Autocomplete per magatzems.
 *
 * Modes:
 *  - fetchOptions (recomanat): (query: string) => Promise<Magatzem[]>
 *    Fa fetch del backend cada vegada que l'usuari escriu (debounce 300ms).
 *  - magatzems: Magatzem[]
 *    Llista estàtica pre-carregada, filtratge client-side (mode llegat).
 *
 * - multi=false (default): value = null | obj, onChange(obj | null)
 * - multi=true:            value = obj[], onChange(obj[])
 */
export default function MagatzemAutocomplete({
  fetchOptions,
  magatzems = [],
  value,
  onChange,
  multi = false,
  placeholder = 'Cercar magatzem...',
  dark = false,
}) {
  const [query, setQuery]       = useState('');
  const [open, setOpen]         = useState(false);
  const [options, setOptions]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const ref                     = useRef(null);
  const debounceRef             = useRef(null);

  // Tanca en clic fora
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Fetch quan query canvia (mode async)
  const doFetch = useCallback((q) => {
    if (!fetchOptions) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetchOptions(q)
        .then(setOptions)
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 300);
  }, [fetchOptions]);

  // Fetch inicial quan s'obre
  useEffect(() => {
    if (open && fetchOptions) doFetch(query);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleQueryChange(e) {
    const q = e.target.value;
    setQuery(q);
    setOpen(true);
    if (fetchOptions) doFetch(q);
  }

  // Mode llegat: filtratge client-side
  const filtered = fetchOptions
    ? options
    : magatzems.filter(m => {
        const t = query.toLowerCase();
        if (!t) return true;
        return (m.nom || '').toLowerCase().includes(t) || m.codi_magatzem.toLowerCase().includes(t);
      });

  const selected = multi ? (value || []) : (value ? [value] : []);

  function toggle(m) {
    if (multi) {
      const exists = selected.find(s => s.codi_magatzem === m.codi_magatzem);
      onChange(exists
        ? selected.filter(s => s.codi_magatzem !== m.codi_magatzem)
        : [...selected, m]);
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

  const hasValue  = multi ? selected.length > 0 : !!value;
  const magLabel  = m => m.nom ? `${m.nom} (${m.codi_magatzem})` : m.codi_magatzem;
  const displayText = multi
    ? (selected.length === 0 ? '' : selected.length === 1 ? magLabel(selected[0]) : `${selected.length} magatzems`)
    : (value ? magLabel(value) : '');

  const showDropdown = open && (loading || filtered.length > 0 || query.length > 0);

  return (
    <div className={`mag-auto${dark ? ' mag-auto--dark' : ''}`} ref={ref}>
      <div className="mag-auto-wrap">
        <input
          className="mag-auto-input"
          placeholder={displayText || placeholder}
          value={query}
          onChange={handleQueryChange}
          onFocus={() => setOpen(true)}
        />
        {(hasValue || query) && (
          <button type="button" className="mag-auto-clear" onMouseDown={clear} tabIndex={-1}>✕</button>
        )}
      </div>
      {showDropdown && (
        <div className="mag-auto-dropdown">
          {loading ? (
            <div className="mag-auto-empty">Carregant...</div>
          ) : filtered.length === 0 ? (
            <div className="mag-auto-empty">Cap magatzem trobat</div>
          ) : filtered.map(m => {
            const isSel = selected.some(s => s.codi_magatzem === m.codi_magatzem);
            return (
              <div
                key={m.codi_magatzem}
                className={`mag-auto-opt${isSel ? ' mag-auto-opt--sel' : ''}`}
                onMouseDown={() => toggle(m)}
              >
                {multi && <span className="mag-auto-opt-check">{isSel ? '✓' : ''}</span>}
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
