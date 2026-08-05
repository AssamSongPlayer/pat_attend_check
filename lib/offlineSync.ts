// lib/offlineSync.ts
// Utilities for localStorage-based offline-first sync

import type { DataRecord } from './types';

// ── Storage key helpers ──────────────────────────────────────────────────────
export const SK = {
  records:  (id: string) => `datavault_records_${id}`,
  pending:  (id: string) => `datavault_pending_${id}`,
  failed:   (id: string) => `datavault_failed_${id}`,
  meta:     (id: string) => `datavault_meta_${id}`,
};

// ── Generic helpers ──────────────────────────────────────────────────────────
function getLS<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function setLS(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[DataVault] localStorage write failed:', e);
  }
}

// ── Records ──────────────────────────────────────────────────────────────────
export interface StoredMeta {
  lastDownloaded: number;
  rowCount: number;
}

export function getStoredRecords(datasetId: string): DataRecord[] | null {
  return getLS<DataRecord[]>(SK.records(datasetId));
}

export function saveRecordsToLS(datasetId: string, records: DataRecord[]): void {
  setLS(SK.records(datasetId), records);
  setLS(SK.meta(datasetId), {
    lastDownloaded: Date.now(),
    rowCount: records.length,
  } satisfies StoredMeta);
}

export function getStoredMeta(datasetId: string): StoredMeta | null {
  return getLS<StoredMeta>(SK.meta(datasetId));
}

// Update a single record inside the stored array and persist
export function updateStoredRecord(
  datasetId: string,
  recordId: string,
  changes: Record<string, unknown>
): DataRecord[] {
  const records = getStoredRecords(datasetId) ?? [];
  const updated = records.map((r) =>
    r.id === recordId ? { ...r, ...changes } : r
  );
  setLS(SK.records(datasetId), updated);
  return updated;
}

// ── Pending changes ──────────────────────────────────────────────────────────
// Shape: { [recordId]: { [fieldKey]: value } }
export type PendingMap = Record<string, Record<string, unknown>>;

export function getPending(datasetId: string): PendingMap {
  return getLS<PendingMap>(SK.pending(datasetId)) ?? {};
}

export function savePending(datasetId: string, pending: PendingMap): void {
  setLS(SK.pending(datasetId), pending);
}

export function addPendingChanges(
  datasetId: string,
  recordId: string,
  changes: Record<string, unknown>
): PendingMap {
  const pending = getPending(datasetId);
  pending[recordId] = { ...(pending[recordId] ?? {}), ...changes };
  savePending(datasetId, pending);
  return pending;
}

export function removePendingRecord(datasetId: string, recordId: string): PendingMap {
  const pending = getPending(datasetId);
  delete pending[recordId];
  savePending(datasetId, pending);
  return pending;
}

// ── Failed record IDs ─────────────────────────────────────────────────────────
export function getFailedIds(datasetId: string): string[] {
  return getLS<string[]>(SK.failed(datasetId)) ?? [];
}

export function saveFailedIds(datasetId: string, ids: string[]): void {
  setLS(SK.failed(datasetId), ids);
}

// ── Clear all local data for a dataset ───────────────────────────────────────
export function clearLocalData(datasetId: string): void {
  [SK.records, SK.pending, SK.failed, SK.meta].forEach((fn) =>
    localStorage.removeItem(fn(datasetId))
  );
}
