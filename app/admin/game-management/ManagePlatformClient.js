"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
const Select = dynamic(() => import("react-select"), { ssr: false });

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 38,
    borderColor: state.isFocused ? '#1976d2' : '#ccc',
    boxShadow: 'none',
    '&:hover': { borderColor: state.isFocused ? '#1976d2' : '#999' }
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? '#1976d2'
      : state.isFocused
      ? '#e3f2fd'
      : 'white',
    color: state.isSelected ? 'white' : '#333'
  }),
  placeholder: (base) => ({ ...base, color: '#888' }),
  singleValue: (base) => ({ ...base, color: '#333' }),
  menu: (base) => ({ ...base, zIndex: 10 })
};

function formatName(p) {
  return p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name;
}

export default function ManagePlatformClient({ platforms }) {
  const [selectedOption, setSelectedOption] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [ackClear, setAckClear] = useState(false);

  const options = useMemo(() => platforms.map(p => ({ value: p.id, label: formatName(p), igdbId: p.igdbId })), [platforms]);
  const selected = useMemo(() => {
    if (!selectedOption) return null;
    return platforms.find(p => p.id === selectedOption.value) || null;
  }, [platforms, selectedOption]);

  function handleSync() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setResult({ processed: 0, inserted: 0, updated: 0 });

    const es = new EventSource(`/api/admin/igdb/sync-games/${selected.igdbId}/stream`);
    function cleanup() {
      es.close();
      setLoading(false);
    }

    es.addEventListener('progress', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setResult(prev => ({ ...prev, ...data }));
      } catch {}
    });

    es.addEventListener('total', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setResult(prev => ({ ...prev, total: data.total }));
      } catch {}
    });

    es.addEventListener('done', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setResult(prev => ({ ...prev, ...data }));
      } catch {}
      cleanup();
    });

    es.addEventListener('error', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setError(data?.message || 'Sync error');
      } catch {
        setError('Sync error');
      }
      cleanup();
    });
  }

  function handleResyncClearFirst() {
    if (!selected) return;
    setShowConfirm(true);
    setAckClear(false);
  }

  function startClearThenSync() {
    if (!selected) return;
    setShowConfirm(false);
    setAckClear(false);
    setLoading(true);
    setError(null);
    setResult({ processed: 0, inserted: 0, updated: 0, clear: { total: 0, processed: 0, disconnected: 0, deleted: 0 } });

    const es = new EventSource(`/api/admin/igdb/sync-games/${selected.igdbId}/stream?clear=true`);
    function cleanup() {
      es.close();
      setLoading(false);
    }

    es.addEventListener('clear-progress', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setResult(prev => ({ ...(prev || {}), clear: { ...(prev?.clear || {}), ...data } }));
      } catch {}
    });

    es.addEventListener('clear-done', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setResult(prev => ({ ...(prev || {}), clear: { ...(prev?.clear || {}), ...data, done: true } }));
      } catch {}
    });

    es.addEventListener('progress', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setResult(prev => ({ ...(prev || {}), ...data }));
      } catch {}
    });

    es.addEventListener('total', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setResult(prev => ({ ...(prev || {}), total: data.total }));
      } catch {}
    });

    es.addEventListener('done', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setResult(prev => ({ ...(prev || {}), ...data }));
      } catch {}
      cleanup();
    });

    es.addEventListener('error', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setError(data?.message || 'Sync error');
      } catch {
        setError('Sync error');
      }
      cleanup();
    });
  }

  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span>Select platform</span>
        <Select
          value={selectedOption}
          onChange={(opt) => setSelectedOption(opt)}
          options={options}
          isSearchable
          placeholder="Search or select a platform"
          styles={selectStyles}
          classNamePrefix="select"
        />
      </label>

      {selectedOption && (
        <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 8, fontStyle: 'italic', color: '#555' }}>
            {selected && (
              <>
                Current number of games for {formatName(selected)}: {selected._count?.games ?? 0}
              </>
            )}
          </div>

          <button onClick={handleSync} disabled={loading}>
            {loading ? 'Syncing…' : `Sync games for ${formatName(selected || { name: 'selected platform' })}`}
          </button>
          <button onClick={handleResyncClearFirst} disabled={loading} style={{ marginLeft: 8 }}>
            {loading ? 'Working…' : 'Re-sync (clear first)'}
          </button>
          {result && (
            <div style={{ fontSize: 13, marginTop: 8, display: 'grid', gap: 4 }}>
              {result.clear && (
                <div style={{ padding: '6px 8px', background: '#f6f8fa', borderRadius: 6 , color: '#333', display: 'grid', gap: 4 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Clearing existing data</div>
                  <div>Total to process: {result.clear.total ?? 0}</div>
                  <div>Processed: {result.clear.processed ?? 0}</div>
                  <div>Disconnected: {result.clear.disconnected ?? 0}</div>
                  <div>Deleted (orphans): {result.clear.deleted ?? 0}</div>
                </div>
              )}
              <div>Processed: {result.processed ?? 0}{typeof result.total === 'number' ? ` / ${result.total}` : ''}</div>
              <div>Inserted: {result.inserted ?? 0}</div>
              <div>Updated: {result.updated ?? 0}</div>
              {result.page && <div>Current page: {result.page} ({result.pageCount ?? 0} items)</div>}
            </div>
          )}
          {error && (
            <div style={{ color: 'red', fontSize: 13, marginTop: 8 }}>
              Error: {error}
            </div>
          )}
        </div>
      )}

      {showConfirm && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center' }}>
          <div style={{ background: 'white', padding: 16, borderRadius: 8, width: 'min(480px, 90vw)', display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Re-sync: clear data then import</div>
            <div style={{ fontSize: 14, color: '#444' }}>
              This will remove all existing games and associations for {formatName(selected)} on this site, then import afresh from IGDB.
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={ackClear} onChange={(e) => setAckClear(e.target.checked)} />
              <span>I understand this action is destructive and cannot be undone.</span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowConfirm(false)}>Cancel</button>
              <button onClick={startClearThenSync} disabled={!ackClear} style={{ background: ackClear ? '#d32f2f' : '#ccc', color: 'white' }}>
                Confirm and start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
