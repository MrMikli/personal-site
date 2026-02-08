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

  function runEventSource(url, { onEvent } = {}) {
    return new Promise((resolve, reject) => {
      const es = new EventSource(url);

      function safeJsonParse(text) {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      }

      function cleanup() {
        es.close();
      }

      es.addEventListener('total', (evt) => {
        const data = safeJsonParse(evt.data);
        if (data) onEvent?.('total', data);
      });

      es.addEventListener('progress', (evt) => {
        const data = safeJsonParse(evt.data);
        if (data) onEvent?.('progress', data);
      });

      es.addEventListener('clear-progress', (evt) => {
        const data = safeJsonParse(evt.data);
        if (data) onEvent?.('clear-progress', data);
      });

      es.addEventListener('clear-done', (evt) => {
        const data = safeJsonParse(evt.data);
        if (data) onEvent?.('clear-done', data);
      });

      es.addEventListener('done', (evt) => {
        const data = safeJsonParse(evt.data);
        cleanup();
        resolve(data || {});
      });

      es.addEventListener('error', (evt) => {
        const data = safeJsonParse(evt.data);
        cleanup();
        reject(new Error(data?.message || 'Sync error'));
      });

      es.onerror = () => {
        cleanup();
        reject(
          new Error(
            'Sync connection failed. Check DevTools → Network for the /stream request status, and check Vercel function logs for details.'
          )
        );
      };
    });
  }

  async function handleSync() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setResult({ processed: 0, inserted: 0, updated: 0, chunk: null });

    // Smaller chunks for Vercel Hobby.
    const pageSize = 100;
    const maxPages = 1;
    let currentOffset = 0;

    try {
      while (true) {
        const url = `/api/admin/igdb/sync-games/${selected.igdbId}/stream?offset=${currentOffset}&pageSize=${pageSize}&maxPages=${maxPages}`;
        const done = await runEventSource(url, {
          onEvent: (type, data) => {
            if (type === 'total') {
              setResult((prev) => ({ ...(prev || {}), total: data.total }));
            }
            if (type === 'progress') {
              setResult((prev) => ({
                ...(prev || {}),
                chunk: {
                  page: data.page,
                  processed: data.processed,
                  inserted: data.inserted,
                  updated: data.updated,
                  pageCount: data.pageCount,
                  offset: data.offset,
                  pageSize: data.pageSize,
                  total: data.total
                }
              }));
            }
          }
        });

        if (done?.phase === 'sync') {
          setResult((prev) => ({
            ...(prev || {}),
            processed: (prev?.processed || 0) + (done.processed || 0),
            inserted: (prev?.inserted || 0) + (done.inserted || 0),
            updated: (prev?.updated || 0) + (done.updated || 0),
            total: typeof done.total === 'number' ? done.total : prev?.total,
            chunk: null
          }));
        }

        if (!done?.hasMore || typeof done?.nextOffset !== 'number') break;
        currentOffset = done.nextOffset;
      }
    } catch (e) {
      setError(e?.message || 'Sync error');
    } finally {
      setLoading(false);
    }
  }

  function handleResyncClearFirst() {
    if (!selected) return;
    setShowConfirm(true);
    setAckClear(false);
  }

  async function startClearThenSync() {
    if (!selected) return;
    setShowConfirm(false);
    setAckClear(false);
    setLoading(true);
    setError(null);

    setResult({
      processed: 0,
      inserted: 0,
      updated: 0,
      chunk: null,
      clear: { processed: 0, disconnected: 0, deleted: 0, nextCursor: null, done: false, lastBatchSize: 0 }
    });

    const clearBatchSize = 50;
    let cursor = null;

    try {
      // Clear in chunks first
      while (true) {
        const url = `/api/admin/igdb/sync-games/${selected.igdbId}/stream?clear=true&clearBatchSize=${clearBatchSize}${cursor ? `&clearCursor=${encodeURIComponent(cursor)}` : ''}`;
        const done = await runEventSource(url, {
          onEvent: (type, data) => {
            if (type === 'clear-progress') {
              setResult((prev) => ({
                ...(prev || {}),
                clear: {
                  ...(prev?.clear || {}),
                  lastBatchSize: data.batchSize ?? prev?.clear?.lastBatchSize ?? 0,
                  processedInBatch: data.processed ?? prev?.clear?.processedInBatch ?? 0,
                  disconnectedInBatch: data.disconnected ?? prev?.clear?.disconnectedInBatch ?? 0,
                  deletedInBatch: data.deleted ?? prev?.clear?.deletedInBatch ?? 0
                }
              }));
            }
            if (type === 'clear-done') {
              setResult((prev) => ({
                ...(prev || {}),
                clear: {
                  ...(prev?.clear || {}),
                  processed: (prev?.clear?.processed || 0) + (data.processed || 0),
                  disconnected: (prev?.clear?.disconnected || 0) + (data.disconnected || 0),
                  deleted: (prev?.clear?.deleted || 0) + (data.deleted || 0),
                  nextCursor: data.nextCursor ?? null,
                  done: !!data.done,
                  lastBatchSize: data.batchSize ?? prev?.clear?.lastBatchSize ?? 0
                }
              }));
            }
          }
        });

        const clear = done?.clear;
        if (!clear) break;
        if (clear.done) break;
        cursor = clear.nextCursor || null;
        if (!cursor) break;
      }

      // Then sync in chunks
      const pageSize = 100;
      const maxPages = 1;
      let currentOffset = 0;

      while (true) {
        const url = `/api/admin/igdb/sync-games/${selected.igdbId}/stream?offset=${currentOffset}&pageSize=${pageSize}&maxPages=${maxPages}`;
        const done = await runEventSource(url, {
          onEvent: (type, data) => {
            if (type === 'total') {
              setResult((prev) => ({ ...(prev || {}), total: data.total }));
            }
            if (type === 'progress') {
              setResult((prev) => ({
                ...(prev || {}),
                chunk: {
                  page: data.page,
                  processed: data.processed,
                  inserted: data.inserted,
                  updated: data.updated,
                  pageCount: data.pageCount,
                  offset: data.offset,
                  pageSize: data.pageSize,
                  total: data.total
                }
              }));
            }
          }
        });

        if (done?.phase === 'sync') {
          setResult((prev) => ({
            ...(prev || {}),
            processed: (prev?.processed || 0) + (done.processed || 0),
            inserted: (prev?.inserted || 0) + (done.inserted || 0),
            updated: (prev?.updated || 0) + (done.updated || 0),
            total: typeof done.total === 'number' ? done.total : prev?.total,
            chunk: null
          }));
        }

        if (!done?.hasMore || typeof done?.nextOffset !== 'number') break;
        currentOffset = done.nextOffset;
      }
    } catch (e) {
      setError(e?.message || 'Sync error');
    } finally {
      setLoading(false);
    }
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
