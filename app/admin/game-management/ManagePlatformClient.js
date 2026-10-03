"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import styles from "./ManagePlatformClient.module.css";
const Select = dynamic(() => import("react-select"), { ssr: false });

function formatName(p) {
  return p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name;
}

export default function ManagePlatformClient({ platforms }) {
  const router = useRouter();
  const [selectedOption, setSelectedOption] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [ackClear, setAckClear] = useState(false);

  const [rollYearEndInput, setRollYearEndInput] = useState("");
  const [rollYearEndSaving, setRollYearEndSaving] = useState(false);
  const [rollYearEndError, setRollYearEndError] = useState(null);
  const [rollYearEndSuccess, setRollYearEndSuccess] = useState(null);

  const [variantLoading, setVariantLoading] = useState(false);
  const [variantError, setVariantError] = useState(null);
  const [variantYearStart, setVariantYearStart] = useState(1994);
  const [variantYearEnd, setVariantYearEnd] = useState(1999);

  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkError, setBulkError] = useState(null);

  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [backfillError, setBackfillError] = useState(null);

  const options = useMemo(() => platforms.map(p => ({ value: p.id, label: formatName(p) })), [platforms]);
  const selected = useMemo(() => {
    if (!selectedOption) return null;
    return platforms.find(p => p.id === selectedOption.value) || null;
  }, [platforms, selectedOption]);

  const selectedId = selectedOption?.value ?? null;

  useEffect(() => {
    if (!selected) {
      setRollYearEndInput("");
      setRollYearEndError(null);
      setRollYearEndSuccess(null);
      return;
    }
    setRollYearEndInput(selected.rollYearEnd ?? "");
    setRollYearEndError(null);
    setRollYearEndSuccess(null);
  }, [selectedId]);

  const canSyncSelected = !!(selected && (selected.igdbId || selected.parentPlatform?.igdbId));
  const selectedIsVariant = !!(selected && selected.parentPlatformId);
  const canCreateVariantFromSelected = !!(selected && selected.igdbId);

  const platformsWithGames = useMemo(
    () =>
      platforms.filter(
        (p) => (p?._count?.games ?? 0) > 0 && (!!p.igdbId || !!p.parentPlatform?.igdbId)
      ),
    [platforms]
  );

  const anyLoading = loading || bulkLoading || backfillLoading || rollYearEndSaving;

  const liveChunk = result?.chunk || null;
  const liveProcessed = (result?.processed || 0) + (liveChunk?.processed || 0);
  const liveInserted = (result?.inserted || 0) + (liveChunk?.inserted || 0);
  const liveUpdated = (result?.updated || 0) + (liveChunk?.updated || 0);

  const liveBulkChunk = bulkResult?.currentChunk || null;
  const liveBulkBase = bulkResult?.currentPlatformBase || null;
  const liveBulkProcessed = (bulkResult?.processed || 0) + (liveBulkBase?.processed || 0) + (liveBulkChunk?.processed || 0);
  const liveBulkInserted = (bulkResult?.inserted || 0) + (liveBulkBase?.inserted || 0) + (liveBulkChunk?.inserted || 0);
  const liveBulkUpdated = (bulkResult?.updated || 0) + (liveBulkBase?.updated || 0) + (liveBulkChunk?.updated || 0);

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

      es.addEventListener('sync-error', (evt) => {
        const data = safeJsonParse(evt.data);
        cleanup();
        const err = new Error(data?.message || 'Sync error');
        err.retryable = !!data?.retryable;
        reject(err);
      });

      es.onerror = () => {
        cleanup();
        const err = new Error(
          'Sync connection failed. Check DevTools → Network for the /stream request status, and check Vercel function logs for details.'
        );
        err.retryable = true;
        reject(err);
      };
    });
  }

  /**
   * Runs one stream request, retrying after 1s and then 3s when the failure is marked retryable.
   * Safe because every chunk is an idempotent upsert: running it twice gives the same result.
   */
  async function runEventSourceWithRetry(url, options) {
    const delays = [1000, 3000];
    for (let attempt = 0; ; attempt++) {
      try {
        return await runEventSource(url, options);
      } catch (e) {
        if (!e?.retryable || attempt >= delays.length) throw e;
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
  }

  async function syncPlatformChunked(platformId, { onEvent, onChunkDone } = {}) {
    // One IGDB page (its maximum) per request; each page is a single database write.
    const pageSize = 500;
    const maxPages = 1;
    let currentOffset = 0;

    const totals = { processed: 0, inserted: 0, updated: 0, total: null };

    while (true) {
      const url = `/api/admin/igdb/sync-games/by-platform/${platformId}/stream?offset=${currentOffset}&pageSize=${pageSize}&maxPages=${maxPages}`;
      const done = await runEventSourceWithRetry(url, { onEvent });

      if (done?.phase === 'sync') {
        onChunkDone?.(done);
        totals.processed += done.processed || 0;
        totals.inserted += done.inserted || 0;
        totals.updated += done.updated || 0;
        if (typeof done.total === 'number') totals.total = done.total;
      }

      if (!done?.hasMore || typeof done?.nextOffset !== 'number') break;
      currentOffset = done.nextOffset;
    }

    return totals;
  }

  /** Shows live progress of the chunk currently being synced for the selected platform. */
  function onSyncEvent(type, data) {
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
          pageSize: data.pageSize
        }
      }));
    }
  }

  /** Folds a finished chunk's counts into the selected platform's running totals. */
  function onSyncChunkDone(done) {
    setResult((prev) => ({
      ...(prev || {}),
      processed: (prev?.processed || 0) + (done.processed || 0),
      inserted: (prev?.inserted || 0) + (done.inserted || 0),
      updated: (prev?.updated || 0) + (done.updated || 0),
      total: typeof done.total === 'number' ? done.total : prev?.total,
      chunk: null
    }));
  }

  async function handleSync() {
    if (!selected) return;
    if (!canSyncSelected) {
      setError('This platform cannot be synced (no IGDB ID and no parent platform with an IGDB ID).');
      return;
    }
    setLoading(true);
    setError(null);
    setResult({ processed: 0, inserted: 0, updated: 0, chunk: null });

    try {
      await syncPlatformChunked(selected.id, { onEvent: onSyncEvent, onChunkDone: onSyncChunkDone });
    } catch (e) {
      setError(e?.message || 'Sync error');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Refreshes the IGDB data of every game already in the database.
   * Follows the server's cursor page by page and adds each page's counts to the running totals.
   */
  async function handleBackfill() {
    if (anyLoading) return;
    setBackfillLoading(true);
    setBackfillError(null);
    setBackfillResult({ processed: 0, updated: 0, missing: 0, total: null, done: false });

    try {
      let cursor = 0;
      while (true) {
        const done = await runEventSourceWithRetry(`/api/admin/igdb/backfill-games/stream?cursor=${cursor}`);
        setBackfillResult((prev) => ({
          processed: (prev?.processed || 0) + (done.processed || 0),
          updated: (prev?.updated || 0) + (done.updated || 0),
          missing: (prev?.missing || 0) + (done.missing || 0),
          total: typeof done.total === 'number' ? done.total : prev?.total,
          done: !done.hasMore
        }));
        if (!done?.hasMore || typeof done?.nextCursor !== 'number') break;
        cursor = done.nextCursor;
      }
      router.refresh();
    } catch (e) {
      setBackfillError(e?.message || 'Backfill error');
    } finally {
      setBackfillLoading(false);
    }
  }

  async function handleResyncAllWithGames() {
    if (anyLoading) return;
    if (!platformsWithGames.length) {
      setBulkError('No platforms with games were found to sync.');
      return;
    }

    const confirmed = window.confirm(
      `Re-sync IGDB games for all platforms that currently have games? (${platformsWithGames.length} platforms)\n\nThis is not destructive (no clear), but it may take a while.`
    );
    if (!confirmed) return;

    setBulkLoading(true);
    setBulkError(null);
    setBulkResult({
      totalPlatforms: platformsWithGames.length,
      completedPlatforms: 0,
      processed: 0,
      inserted: 0,
      updated: 0,
      currentPlatform: null,
      currentPlatformBase: { processed: 0, inserted: 0, updated: 0 },
      currentChunk: null,
      errors: []
    });

    for (const p of platformsWithGames) {
      setBulkResult((prev) => ({
        ...(prev || {}),
        currentPlatform: formatName(p),
        currentPlatformBase: { processed: 0, inserted: 0, updated: 0 },
        currentChunk: null
      }));

      try {
        await syncPlatformChunked(p.id, {
          onEvent: (type, data) => {
            if (type === 'progress') {
              setBulkResult((prev) => ({
                ...(prev || {}),
                currentChunk: {
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
          },
          onChunkDone: (done) => {
            setBulkResult((prev) => ({
              ...(prev || {}),
              currentPlatformBase: {
                processed: (prev?.currentPlatformBase?.processed || 0) + (done.processed || 0),
                inserted: (prev?.currentPlatformBase?.inserted || 0) + (done.inserted || 0),
                updated: (prev?.currentPlatformBase?.updated || 0) + (done.updated || 0)
              },
              currentChunk: null
            }));
          }
        });

        setBulkResult((prev) => ({
          ...(prev || {}),
          completedPlatforms: (prev?.completedPlatforms || 0) + 1,
          processed: (prev?.processed || 0) + (prev?.currentPlatformBase?.processed || 0),
          inserted: (prev?.inserted || 0) + (prev?.currentPlatformBase?.inserted || 0),
          updated: (prev?.updated || 0) + (prev?.currentPlatformBase?.updated || 0),
          currentPlatformBase: { processed: 0, inserted: 0, updated: 0 },
          currentChunk: null
        }));
      } catch (e) {
        const message = e?.message || 'Sync error';
        setBulkResult((prev) => ({
          ...(prev || {}),
          completedPlatforms: (prev?.completedPlatforms || 0) + 1,
          currentPlatformBase: { processed: 0, inserted: 0, updated: 0 },
          currentChunk: null,
          errors: [...(prev?.errors || []), { platform: formatName(p), message }]
        }));
      }
    }

    setBulkResult((prev) => ({
      ...(prev || {}),
      currentPlatform: null,
      currentChunk: null
    }));
    setBulkLoading(false);
  }

  function handleResyncClearFirst() {
    if (!selected) return;
    if (!canSyncSelected) {
      setError('This platform cannot be synced (no IGDB ID and no parent platform with an IGDB ID).');
      return;
    }
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
      clear: { processed: 0, disconnected: 0, deleted: 0, skipped: 0, done: false }
    });

    try {
      const cleared = await runEventSource(
        `/api/admin/igdb/sync-games/by-platform/${selected.id}/stream?clear=true`
      );
      setResult((prev) => ({ ...(prev || {}), clear: { ...(cleared?.clear || {}), done: true } }));

      await syncPlatformChunked(selected.id, { onEvent: onSyncEvent, onChunkDone: onSyncChunkDone });
    } catch (e) {
      setError(e?.message || 'Sync error');
    } finally {
      setLoading(false);
    }
  }

  async function saveRollYearEnd(nextValue) {
    if (!selected) return;
    if (anyLoading) return;

    setRollYearEndSaving(true);
    setRollYearEndError(null);
    setRollYearEndSuccess(null);

    try {
      const res = await fetch('/api/admin/platforms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformId: selected.id,
          rollYearEnd: nextValue
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || 'Failed to save roll year end');
      setRollYearEndSuccess('Saved.');
      router.refresh();
    } catch (e) {
      setRollYearEndError(e?.message || 'Failed to save');
    } finally {
      setRollYearEndSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.bulkBox}>
        <div className={styles.bulkTitle}>Bulk actions</div>
        <div className={styles.buttons}>
          <button onClick={handleResyncAllWithGames} disabled={anyLoading}>
            {bulkLoading
              ? 'Re-syncing all…'
              : `Re-sync all platforms with games (${platformsWithGames.length})`}
          </button>
          <button onClick={handleBackfill} disabled={anyLoading}>
            {backfillLoading ? 'Refreshing…' : 'Refresh IGDB data for existing games'}
          </button>
        </div>
        <div className={styles.note}>
          Re-sync looks for new games on each platform. Refresh only updates games already here (genres, themes,
          ratings, release years and so on) and is much faster.
        </div>
        {backfillResult && (
          <div className={styles.result}>
            <div>
              Refreshed: {backfillResult.processed}
              {typeof backfillResult.total === 'number' ? ` / ${backfillResult.total}` : ''}
              {backfillResult.done ? ' (done)' : ''}
            </div>
            <div>Updated: {backfillResult.updated}</div>
            <div>No longer on IGDB (left as is): {backfillResult.missing}</div>
          </div>
        )}
        {backfillError && <div className={styles.error}>Error: {backfillError}</div>}
        {bulkResult && (
          <div className={styles.result}>
            <div>
              Platforms: {bulkResult.completedPlatforms ?? 0} / {bulkResult.totalPlatforms ?? 0}
              {bulkResult.currentPlatform ? ` (current: ${bulkResult.currentPlatform})` : ''}
            </div>
            <div>Processed: {liveBulkProcessed}</div>
            <div>Inserted: {liveBulkInserted}</div>
            <div>Updated: {liveBulkUpdated}</div>
            {bulkResult.currentChunk && (
              <div>
                Current chunk: offset {bulkResult.currentChunk.offset ?? 0} (processed {bulkResult.currentChunk.processed ?? 0})
              </div>
            )}
            {(bulkResult.errors?.length || 0) > 0 && (
              <div>
                Errors: {bulkResult.errors.length} (last: {bulkResult.errors[bulkResult.errors.length - 1]?.platform})
              </div>
            )}
          </div>
        )}
        {bulkError && <div className={styles.error}>Error: {bulkError}</div>}
      </div>

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
            isDisabled={anyLoading}
          />
        </div>
      </label>

      {selectedOption && (
        <div className={styles.section}>
          <div className={styles.note}>
            {selected && (
              <>
                Current number of games for {formatName(selected)}: {selected._count?.games ?? 0}
                {selectedIsVariant && selected.yearStart && selected.yearEnd ? (
                  <> (variant range: {selected.yearStart}-{selected.yearEnd})</>
                ) : null}
              </>
            )}
          </div>

          {selected && (
            <div className={styles.bulkBox}>
              <div className={styles.bulkTitle}>Rolling restrictions</div>
              <div className={styles.buttons}>
                <label className={styles.label}>
                  <span>Max release year (rollYearEnd)</span>
                  <input
                    type="number"
                    value={rollYearEndInput}
                    min={1950}
                    max={2100}
                    placeholder="(none)"
                    onChange={(e) => {
                      setRollYearEndInput(e.target.value);
                      setRollYearEndSuccess(null);
                      setRollYearEndError(null);
                    }}
                    disabled={anyLoading}
                  />
                </label>
                <button
                  onClick={() => {
                    if (!selected || anyLoading) return;
                    const raw = String(rollYearEndInput ?? '').trim();
                    if (!raw) {
                      saveRollYearEnd(null);
                      return;
                    }
                    const parsed = Number(raw);
                    if (!Number.isInteger(parsed) || parsed < 1950 || parsed > 2100) {
                      setRollYearEndError('Please enter a whole year between 1950 and 2100, or clear it.');
                      return;
                    }
                    saveRollYearEnd(parsed);
                  }}
                  disabled={anyLoading}
                >
                  {rollYearEndSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    if (anyLoading) return;
                    setRollYearEndInput('');
                    setRollYearEndSuccess(null);
                    setRollYearEndError(null);
                  }}
                  disabled={anyLoading}
                >
                  Clear
                </button>
              </div>
              {rollYearEndError && <div className={styles.error}>Error: {rollYearEndError}</div>}
              {rollYearEndSuccess && <div className={styles.result}>{rollYearEndSuccess}</div>}
              <div className={styles.note}>
                If set, gauntlet rolls and the roll simulator can exclude games released after this year for this platform.
              </div>
            </div>
          )}

          {canCreateVariantFromSelected && (
            <div className={styles.bulkBox}>
              <div className={styles.bulkTitle}>Platform variants</div>
              <div className={styles.buttons}>
                <label className={styles.label}>
                  <span>Start year</span>
                  <input
                    type="number"
                    value={variantYearStart}
                    min={1950}
                    max={2100}
                    onChange={(e) => setVariantYearStart(Number(e.target.value))}
                    disabled={anyLoading || variantLoading}
                  />
                </label>
                <label className={styles.label}>
                  <span>End year</span>
                  <input
                    type="number"
                    value={variantYearEnd}
                    min={1950}
                    max={2100}
                    onChange={(e) => setVariantYearEnd(Number(e.target.value))}
                    disabled={anyLoading || variantLoading}
                  />
                </label>
                <button
                  onClick={async () => {
                    if (anyLoading || variantLoading) return;
                    setVariantLoading(true);
                    setVariantError(null);
                    try {
                      if (!Number.isFinite(variantYearStart) || !Number.isFinite(variantYearEnd)) {
                        throw new Error('Invalid year range');
                      }
                      if (variantYearStart > variantYearEnd) {
                        throw new Error('Start year must be <= end year');
                      }
                      const res = await fetch('/api/admin/platform-variants', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          basePlatformId: selected.id,
                          yearStart: variantYearStart,
                          yearEnd: variantYearEnd
                        })
                      });
                      const json = await res.json().catch(() => null);
                      if (!res.ok) throw new Error(json?.message || 'Failed to create variant');
                      router.refresh();
                    } catch (e) {
                      setVariantError(e?.message || 'Failed to create variants');
                    } finally {
                      setVariantLoading(false);
                    }
                  }}
                  disabled={anyLoading || variantLoading}
                >
                  {variantLoading ? 'Creating variant…' : 'Create year-range platform'}
                </button>
              </div>
              {variantError && <div className={styles.error}>Error: {variantError}</div>}
              <div className={styles.note}>
                Creates a new platform that syncs from this platform’s IGDB catalog, filtered by release year.
              </div>
            </div>
          )}

          <div className={styles.buttons}>
            <button onClick={handleSync} disabled={anyLoading}>
              {anyLoading
                ? 'Syncing…'
                : `Sync games for ${formatName(selected || { name: 'selected platform' })}`}
            </button>
            <button onClick={handleResyncClearFirst} disabled={anyLoading}>
              {anyLoading ? 'Working…' : 'Re-sync (clear first)'}
            </button>
          </div>
          {result && (
            <div className={styles.result}>
              {result.clear && (
                <div className={styles.clearBox}>
                  <div className={styles.clearTitle}>Clearing existing data</div>
                  <div>{result.clear.done ? 'Done' : 'Working…'}</div>
                  <div>Deleted: {result.clear.deleted ?? 0}</div>
                  <div>Unlinked (also on other platforms): {result.clear.disconnected ?? 0}</div>
                  <div>Kept (rolled or picked by a player): {result.clear.skipped ?? 0}</div>
                </div>
              )}
              <div>Processed: {liveProcessed}{typeof result.total === 'number' ? ` / ${result.total}` : ''}</div>
              <div>Inserted: {liveInserted}</div>
              <div>Updated: {liveUpdated}</div>
              {result.chunk && (
                <div>
                  Current chunk: offset {result.chunk.offset ?? 0} (processed {result.chunk.processed ?? 0})
                </div>
              )}
              {result.chunk?.page && (
                <div>
                  Current page: {result.chunk.page} ({result.chunk.pageCount ?? 0} items)
                </div>
              )}
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
