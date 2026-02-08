"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import styles from "./ManagePlatformClient.module.css";
const Select = dynamic(() => import("react-select"), { ssr: false });

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
    <div className={styles.container}>
      <label className={styles.label}>
        <span>Select platform</span>
        <div className={styles.selectWrap}>
          <Select
            value={selectedOption}
            onChange={(opt) => setSelectedOption(opt)}
            options={options}
            isSearchable
            placeholder="Search or select a platform"
            classNamePrefix="select"
          />
        </div>
      </label>

      {selectedOption && (
        <div className={styles.section}>
          <div className={styles.note}>
            {selected && (
              <>
                Current number of games for {formatName(selected)}: {selected._count?.games ?? 0}
              </>
            )}
          </div>

          <div className={styles.buttons}>
            <button onClick={handleSync} disabled={loading}>
              {loading ? 'Syncing…' : `Sync games for ${formatName(selected || { name: 'selected platform' })}`}
            </button>
            <button onClick={handleResyncClearFirst} disabled={loading}>
              {loading ? 'Working…' : 'Re-sync (clear first)'}
            </button>
          </div>
          {result && (
            <div className={styles.result}>
              {result.clear && (
                <div className={styles.clearBox}>
                  <div className={styles.clearTitle}>Clearing existing data</div>
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
            <div className={styles.error}>
              Error: {error}
            </div>
          )}
        </div>
      )}

      {showConfirm && selected && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <div className={styles.modalTitle}>Re-sync: clear data then import</div>
            <div className={styles.modalText}>
              This will remove all existing games and associations for {formatName(selected)} on this site, then import afresh from IGDB.
            </div>
            <label className={styles.warnLabel}>
              <input type="checkbox" checked={ackClear} onChange={(e) => setAckClear(e.target.checked)} />
              <span>I understand this action is destructive and cannot be undone.</span>
            </label>
            <div className={styles.modalActions}>
              <button onClick={() => setShowConfirm(false)}>Cancel</button>
              <button
                onClick={startClearThenSync}
                disabled={!ackClear}
                className={`${styles.confirmButton} ${ackClear ? styles.confirmButtonEnabled : styles.confirmButtonDisabled}`.trim()}
              >
                Confirm and start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
