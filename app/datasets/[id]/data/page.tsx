'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { doc, onSnapshot, collection, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Dataset, DataRecord } from '@/lib/types';
import {
  addPendingChanges, removePendingRecord, getPending,
  getStoredRecords, saveRecordsToLS, updateStoredRecord,
  getStoredMeta, getFailedIds, saveFailedIds,
  type PendingMap,
} from '@/lib/offlineSync';
import {
  Search, X, Loader2, ChevronLeft, ChevronRight,
  Save, CheckCircle, ToggleLeft, Type, AlertCircle,
  RefreshCw, WifiOff, Clock, Zap, Download,
  Eye, ChevronDown, ChevronUp, Database, ChevronsUpDown,
} from 'lucide-react';
import Link from 'next/link';

const PAGE_SIZE = 50;

/* ─── helpers ──────────────────────────────────────────────────────────────── */
function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function highlight(text: string, q: string) {
  if (!q) return <span>{String(text)}</span>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <span>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase() ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>
      )}
    </span>
  );
}

/* ─── Record Detail Modal ──────────────────────────────────────────────────── */
function RecordModal({
  record, dataset, isPending, isFailed, onSave, onClose,
}: {
  record: DataRecord; dataset: Dataset;
  isPending: boolean; isFailed: boolean;
  onSave: (id: string, changes: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    dataset.customColumns?.forEach(col => {
      init[col.id] = record[`_custom_${col.id}`] ?? (col.type === 'boolean' ? false : '');
    });
    return init;
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const changes: Record<string, unknown> = {};
    dataset.customColumns?.forEach(col => {
      changes[`_custom_${col.id}`] = values[col.id];
    });
    onSave(record.id, changes);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 700);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ alignItems: 'flex-end' }}  /* bottom-sheet on mobile */
    >
      <div
        className="glass-card animate-slide-up"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: 0,
          borderRadius: '20px 20px 0 0',
          /* desktop: center */
        }}
      >
        {/* Drag handle (mobile feel) */}
        <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', display: 'inline-block' }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '10px 20px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Record</span>
            {isPending && (
              <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--warning)', background:'var(--warning-dim)', padding:'3px 8px', borderRadius:20, fontWeight:700 }}>
                <Clock size={10} /> Pending
              </span>
            )}
            {isFailed && (
              <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--danger)', background:'var(--danger-dim)', padding:'3px 8px', borderRadius:20, fontWeight:700 }}>
                <AlertCircle size={10} /> Failed
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', padding:6, borderRadius:8, touchAction:'manipulation' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* Excel data */}
          {(dataset.excelColumns || []).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
                Excel Data
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:8 }}>
                {(dataset.excelColumns || []).map(col => (
                  <div key={col} style={{ background:'var(--bg-primary)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px' }}>
                    <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:700, marginBottom:3, textTransform:'uppercase' }}>{col}</div>
                    <div style={{ fontSize:14, wordBreak:'break-word' }}>{String(record[col] ?? '—')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom fields */}
          {(dataset.customColumns || []).length > 0 ? (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
                Your Fields
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {(dataset.customColumns || []).map(col => (
                  <div key={col.id}>
                    <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'var(--text-secondary)', marginBottom:8 }}>
                      {col.type === 'boolean' ? <ToggleLeft size={14} /> : <Type size={14} />}
                      {col.name}
                    </label>
                    {col.type === 'boolean' ? (
                      <button
                        onClick={() => setValues(v => ({ ...v, [col.id]: !v[col.id] }))}
                        style={{
                          display:'flex', alignItems:'center', gap:12,
                          background: values[col.id] ? 'var(--success-dim)' : 'var(--bg-primary)',
                          border: `2px solid ${values[col.id] ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                          borderRadius:12, padding:'14px 18px', cursor:'pointer',
                          width:'100%', transition:'all 0.2s', touchAction:'manipulation',
                        }}
                      >
                        <div className={`toggle ${values[col.id] ? 'on' : ''}`} />
                        <span style={{ fontSize:16, fontWeight:700, color: values[col.id] ? 'var(--success)' : 'var(--text-secondary)' }}>
                          {values[col.id] ? 'Yes' : 'No'}
                        </span>
                      </button>
                    ) : (
                      <input
                        className="input-field"
                        style={{ fontSize:16, padding:'13px 14px' }}
                        value={String(values[col.id] ?? '')}
                        onChange={e => setValues(v => ({ ...v, [col.id]: e.target.value }))}
                        placeholder={`Enter ${col.name}…`}
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saved}
                style={{ width:'100%', justifyContent:'center', marginTop:20, padding:'15px', fontSize:16 }}
              >
                {saved
                  ? <><CheckCircle size={18} /> Saved!</>
                  : <><Save size={18} /> Save Changes</>
                }
              </button>
            </div>
          ) : (
            <div style={{ background:'var(--accent-dim)', border:'1px solid var(--glass-border)', borderRadius:12, padding:'16px', fontSize:14, color:'var(--accent-hover)', textAlign:'center' }}>
              No custom columns yet.{' '}
              <Link href={`/datasets/${dataset.id}/columns`} style={{ color:'var(--accent-hover)', fontWeight:700 }}>
                Add columns →
              </Link>
            </div>
          )}
        </div>
        <div style={{ height: 20 }} /> {/* bottom safe area */}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

/* ─── Sync Status Pill ─────────────────────────────────────────────────────── */
function SyncPill({
  isOnline, pendingCount, failedCount, isSyncing,
  lastSyncTime, lastDownloaded, onForceSync, onRefresh, isRefreshing,
}: {
  isOnline: boolean; pendingCount: number; failedCount: number; isSyncing: boolean;
  lastSyncTime: number | null; lastDownloaded: number | null;
  onForceSync: () => void; onRefresh: () => void; isRefreshing: boolean;
}) {
  const total = pendingCount + failedCount;
  const offline = !isOnline;

  let color = 'var(--success)';
  let bg = 'rgba(34,197,94,0.1)';
  let label = lastSyncTime ? `Synced ${timeAgo(lastSyncTime)}` : 'All synced';

  if (isSyncing || isRefreshing) {
    color = 'var(--accent-hover)'; bg = 'var(--accent-dim)'; label = isSyncing ? 'Syncing…' : 'Refreshing…';
  } else if (offline && total > 0) {
    color = 'var(--danger)'; bg = 'var(--danger-dim)'; label = `Offline · ${total} pending`;
  } else if (offline) {
    color = 'var(--danger)'; bg = 'var(--danger-dim)'; label = 'Offline';
  } else if (failedCount > 0) {
    color = 'var(--danger)'; bg = 'var(--danger-dim)'; label = `${failedCount} failed`;
  } else if (pendingCount > 0) {
    color = 'var(--warning)'; bg = 'var(--warning-dim)'; label = `${pendingCount} pending`;
  }

  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'10px 16px', background:'var(--bg-secondary)',
      borderBottom:'1px solid var(--border)', flexShrink:0, flexWrap:'wrap', gap:8,
    }}>
      {/* Status pill */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:20, background:bg, border:`1px solid ${color}40` }}>
          {(isSyncing || isRefreshing) && <Loader2 size={13} color={color} style={{ animation:'spin 0.8s linear infinite' }} />}
          {offline && !isSyncing && <WifiOff size={13} color={color} />}
          {!offline && !isSyncing && !isRefreshing && pendingCount === 0 && failedCount === 0 && <CheckCircle size={13} color={color} />}
          {!offline && !isSyncing && !isRefreshing && (pendingCount > 0 || failedCount > 0) && <Clock size={13} color={color} />}
          <span style={{ fontSize:12, fontWeight:700, color }}>{label}</span>
        </div>
        {lastDownloaded && (
          <span style={{ fontSize:11, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:3 }}>
            <Download size={10} /> {timeAgo(lastDownloaded)}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display:'flex', gap:6 }}>
        {total > 0 && isOnline && (
          <button className="btn-primary" onClick={onForceSync} disabled={isSyncing}
            style={{ padding:'7px 12px', fontSize:12 }}>
            <Zap size={12} /> Sync ({total})
          </button>
        )}
        <button className="btn-secondary" onClick={onRefresh} disabled={isRefreshing || isSyncing}
          style={{ padding:'7px 12px', fontSize:12 }}>
          <RefreshCw size={12} style={isRefreshing ? { animation:'spin 0.8s linear infinite' } : undefined} />
          Refresh
        </button>
      </div>
    </div>
  );
}

/* ─── Gateway Screen ────────────────────────────────────────────────────────── */
function GatewayScreen({ dataset, onEnter, isLoading }: { dataset: Dataset | null; onEnter: () => void; isLoading: boolean }) {
  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      flex:1, padding:'40px 24px', textAlign:'center',
    }}>
      {/* Icon */}
      <div style={{
        width:80, height:80, borderRadius:24,
        background:'linear-gradient(135deg, #6366f1, #8b5cf6)',
        display:'flex', alignItems:'center', justifyContent:'center',
        marginBottom:24, boxShadow:'0 20px 60px rgba(99,102,241,0.3)',
      }}>
        <Database size={36} color="white" />
      </div>

      {/* Dataset name */}
      {dataset ? (
        <>
          <h1 style={{ fontSize:28, fontWeight:800, margin:'0 0 8px', lineHeight:1.2 }}>
            {dataset.name}
          </h1>
          <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap', marginBottom:32 }}>
            <span style={{ fontSize:14, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ fontWeight:700, color:'var(--accent-hover)' }}>{dataset.rowCount?.toLocaleString()}</span> records
            </span>
            <span style={{ fontSize:14, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ fontWeight:700, color:'var(--accent-hover)' }}>{dataset.excelColumns?.length}</span> columns
            </span>
            {(dataset.customColumns?.length || 0) > 0 && (
              <span style={{ fontSize:14, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontWeight:700, color:'var(--success)' }}>{dataset.customColumns.length}</span> custom fields
              </span>
            )}
          </div>

          <button
            className="btn-primary"
            onClick={onEnter}
            disabled={isLoading}
            style={{ padding:'16px 40px', fontSize:18, borderRadius:14, gap:12 }}
          >
            {isLoading
              ? <><Loader2 size={20} style={{ animation:'spin 0.8s linear infinite' }} /> Loading…</>
              : <><Eye size={20} /> Enter Dataset</>
            }
          </button>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:16 }}>
            Click to load data · works offline
          </p>
        </>
      ) : (
        <Loader2 size={32} color="var(--accent-hover)" style={{ animation:'spin 0.8s linear infinite' }} />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */
export default function DataPage({ params }: { params: Promise<{ id: string }> }) {
  const [datasetId, setDatasetId] = useState('');
  const [dataset, setDataset] = useState<Dataset | null>(null);

  // Page state machine: 'gateway' | 'loading' | 'ready'
  const [pageState, setPageState] = useState<'gateway' | 'loading' | 'ready'>('gateway');

  const [records, setRecords] = useState<DataRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [pending, setPending] = useState<PendingMap>({});
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [lastDownloaded, setLastDownloaded] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<DataRecord | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Boolean filter
  const [boolFilterCol, setBoolFilterCol] = useState<string>('');
  const [boolFilterVal, setBoolFilterVal] = useState<'all' | 'yes' | 'no'>('all');

  // Sort
  const [sortCol, setSortCol] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);

  const handleSort = (colKey: string) => {
    if (sortCol === colKey) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortCol(''); setSortDir(null); }
    } else {
      setSortCol(colKey);
      setSortDir('asc');
    }
  };

  const isSyncingRef = useRef(false);
  const datasetIdRef = useRef('');
  const pendingRef = useRef<PendingMap>({});

  // Keep pendingRef in sync
  useEffect(() => { pendingRef.current = pending; }, [pending]);

  /* ── Flush all pending to Firebase (only changed fields) ── */
  const flushPending = useCallback(async (id: string) => {
    if (isSyncingRef.current || !navigator.onLine) return;
    const currentPending = getPending(id);
    const entries = Object.entries(currentPending);
    if (entries.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    const newFailed: string[] = [];

    for (const [recordId, changes] of entries) {
      try {
        await updateDoc(doc(db, 'records', id, 'rows', recordId), changes);
        removePendingRecord(id, recordId);
        setPending(prev => { const n = { ...prev }; delete n[recordId]; return n; });
        setFailedIds(prev => { const n = new Set(prev); n.delete(recordId); return n; });
      } catch {
        newFailed.push(recordId);
      }
    }

    saveFailedIds(id, newFailed);
    setFailedIds(new Set(newFailed));
    setLastSyncTime(Date.now());
    setIsSyncing(false);
    isSyncingRef.current = false;
  }, []);

  /* ── Init ── */
  useEffect(() => {
    params.then(({ id }) => {
      setDatasetId(id);
      datasetIdRef.current = id;

      // Always fetch dataset metadata live
      const dsUnsub = onSnapshot(doc(db, 'datasets', id), snap => {
        if (snap.exists()) setDataset({ id: snap.id, ...snap.data() } as Dataset);
      });

      // Load pending from localStorage
      const storedPending = getPending(id);
      const storedFailed = getFailedIds(id);
      setPending(storedPending);
      setFailedIds(new Set(storedFailed));

      return dsUnsub;
    });
  }, [params]);

  /* ── Online / offline ── */
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      // Immediately flush pending when back online
      flushPending(datasetIdRef.current);
    };
    const onOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Sync automatically when online status is restored (robust backup loop)
  useEffect(() => {
    if (!datasetId) return;
    const interval = setInterval(() => {
      if (navigator.onLine && Object.keys(pendingRef.current).length > 0) {
        flushPending(datasetId);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [datasetId, flushPending]);

  /* ── Load data (called when user presses Enter) ── */
  const loadData = useCallback(async (id: string) => {
    const stored = getStoredRecords(id);
    const meta = getStoredMeta(id);

    if (stored && stored.length > 0) {
      setRecords(stored);
      setLastDownloaded(meta?.lastDownloaded ?? null);
      setPageState('ready');
    } else {
      // No local cache — fetch from Firebase
      setPageState('loading');
      try {
        const snap = await getDocs(collection(db, 'records', id, 'rows'));
        const fetched: DataRecord[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as DataRecord));
        saveRecordsToLS(id, fetched);
        setRecords(fetched);
        setLastDownloaded(Date.now());
        setPageState('ready');
      } catch {
        setPageState('gateway');
      }
    }
  }, []);

  const handleEnter = useCallback(() => {
    if (datasetId) loadData(datasetId);
  }, [datasetId, loadData]);

  /* ── Fetch fresh from Firebase (Refresh button) ── */
  const handleRefresh = useCallback(async () => {
    const pendingCount = Object.keys(getPending(datasetId)).length;
    if (pendingCount > 0) {
      const ok = confirm(`You have ${pendingCount} unsynced change(s). Refreshing will overwrite with Firebase data.\n\nOK = Sync first then refresh\nCancel = Stay`);
      if (!ok) return;
      await flushPending(datasetId);
    }
    setIsRefreshing(true);
    try {
      const snap = await getDocs(collection(db, 'records', datasetId, 'rows'));
      const fetched: DataRecord[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as DataRecord));
      saveRecordsToLS(datasetId, fetched);
      setRecords(fetched);
      setLastDownloaded(Date.now());
    } finally {
      setIsRefreshing(false);
    }
  }, [datasetId]);

  /* ── Flush all pending to Firebase (only changed fields) ── */

  /* ── Background sync for a single record ── */
  const syncRecord = useCallback(async (id: string, recordId: string, changes: Record<string, unknown>) => {
    if (!navigator.onLine) return; // Will sync when online event fires
    try {
      await updateDoc(doc(db, 'records', id, 'rows', recordId), changes);
      // Remove from pending on success
      const newPending = removePendingRecord(id, recordId);
      setPending(newPending);
      setFailedIds(prev => { const n = new Set(prev); n.delete(recordId); return n; });
      setLastSyncTime(Date.now());
    } catch {
      // Keep in pending — will retry on next online event or force sync
      setFailedIds(prev => new Set([...prev, recordId]));
    }
  }, []);

  /* ── Handle record save from modal ── */
  const handleRecordSave = useCallback((recordId: string, changes: Record<string, unknown>) => {
    // 1. Update localStorage immediately (instant, no wait)
    const updated = updateStoredRecord(datasetId, recordId, changes);
    setRecords(updated);

    // 2. Add to pending queue
    const newPending = addPendingChanges(datasetId, recordId, changes);
    setPending(newPending);

    // 3. Try Firebase in background (non-blocking)
    syncRecord(datasetId, recordId, changes);
  }, [datasetId, syncRecord]);

  /* ── Filtered + paged records ── */
  const booleanStats = useMemo(() => {
    const stats: Record<string, { yes: number; no: number }> = {};
    const cols = dataset?.customColumns || [];
    cols.forEach(col => {
      if (col.type === 'boolean') {
        let yes = 0, no = 0;
        records.forEach(r => {
          if (r[`_custom_${col.id}`] === true) yes++;
          else no++;
        });
        stats[col.id] = { yes, no };
      }
    });
    return stats;
  }, [records, dataset]);

  const filtered = useMemo(() => {
    let result = records;

    // Apply boolean filter first
    if (boolFilterCol && boolFilterVal !== 'all') {
      result = result.filter(r => {
        const val = r[`_custom_${boolFilterCol}`];
        return boolFilterVal === 'yes' ? val === true : (val === false || val === undefined || val === null);
      });
    }

    // Apply search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)));
    }

    // Apply sorting
    if (sortCol) {
      result = [...result].sort((a, b) => {
        const av = a[sortCol];
        const bv = b[sortCol];
        
        if (typeof av === 'boolean' || typeof bv === 'boolean') {
          const aBool = !!av;
          const bBool = !!bv;
          if (aBool === bBool) return 0;
          return sortDir === 'asc' ? (aBool ? 1 : -1) : (aBool ? -1 : 1);
        }

        const aStr = String(av ?? '').toLowerCase();
        const bStr = String(bv ?? '').toLowerCase();
        const cmp = aStr.localeCompare(bStr, undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [records, search, boolFilterCol, boolFilterVal, sortCol, sortDir]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const displayCols = useMemo(() => (dataset?.excelColumns ?? []).slice(0, 5), [dataset]);
  const customCols = dataset?.customColumns ?? [];
  const pendingCount = Object.keys(pending).length;
  const failedCount = failedIds.size;

  /* ── Gateway screen ── */
  if (pageState === 'gateway' || pageState === 'loading') {
    return (
      <GatewayScreen
        dataset={dataset}
        onEnter={handleEnter}
        isLoading={pageState === 'loading'}
      />
    );
  }

  /* ── Ready — show data ── */
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        .row-dot { width:8px; height:8px; border-radius:50%; display:inline-block; flex-shrink:0; }
        /* Mobile: hide table, show cards */
        @media (max-width: 640px) {
          .desktop-table { display: none !important; }
          .mobile-cards { display: flex !important; }
        }
        @media (min-width: 641px) {
          .desktop-table { display: block !important; }
          .mobile-cards { display: none !important; }
        }
      `}</style>

      {/* Sync bar */}
      <SyncPill
        isOnline={isOnline}
        pendingCount={pendingCount}
        failedCount={failedCount}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        lastDownloaded={lastDownloaded}
        onForceSync={() => flushPending(datasetId)}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Search bar */}
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg-secondary)', flexShrink:0 }}>
        <div style={{ position:'relative' }}>
          <Search size={17} style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }} />
          <input
            className="input-field"
            style={{ paddingLeft:42, paddingRight:40, fontSize:16 }}
            placeholder={`Search ${records.length.toLocaleString()} records…`}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(0); }} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:6, touchAction:'manipulation' }}>
              <X size={16} />
            </button>
          )}
        </div>
        {search && (
          <div style={{ fontSize:13, color:'var(--text-secondary)', marginTop:6 }}>
            <strong>{filtered.length.toLocaleString()}</strong> result{filtered.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
          </div>
        )}

        {/* Boolean filter pills */}
        {customCols.filter(c => c.type === 'boolean').length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filter:</span>
            {customCols.filter(c => c.type === 'boolean').map(col => {
              const stats = booleanStats[col.id] || { yes: 0, no: 0 };
              const isActiveYes = boolFilterCol === col.id && boolFilterVal === 'yes';
              const isActiveNo = boolFilterCol === col.id && boolFilterVal === 'no';
              return (
                <div key={col.id} style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, marginRight: 2 }}>{col.name}:</span>
                  <button
                    onClick={() => {
                      if (isActiveYes) {
                        setBoolFilterCol('');
                        setBoolFilterVal('all');
                      } else {
                        setBoolFilterCol(col.id);
                        setBoolFilterVal('yes');
                      }
                      setPage(0);
                    }}
                    className="btn-secondary"
                    style={{
                      padding: '2px 6px', fontSize: 11, minHeight: 'unset', height: 22, borderRadius: 4,
                      background: isActiveYes ? 'var(--success-dim)' : 'transparent',
                      color: isActiveYes ? 'var(--success)' : 'var(--text-secondary)',
                      borderColor: isActiveYes ? 'var(--success)' : 'var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    Yes ({stats.yes})
                  </button>
                  <button
                    onClick={() => {
                      if (isActiveNo) {
                        setBoolFilterCol('');
                        setBoolFilterVal('all');
                      } else {
                        setBoolFilterCol(col.id);
                        setBoolFilterVal('no');
                      }
                      setPage(0);
                    }}
                    className="btn-secondary"
                    style={{
                      padding: '2px 6px', fontSize: 11, minHeight: 'unset', height: 22, borderRadius: 4,
                      background: isActiveNo ? 'var(--danger-dim)' : 'transparent',
                      color: isActiveNo ? 'var(--danger)' : 'var(--text-secondary)',
                      borderColor: isActiveNo ? 'var(--danger)' : 'var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    No ({stats.no})
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {paged.length === 0 ? (
          <div style={{ padding:60, textAlign:'center' }}>
            <Search size={36} color="var(--text-muted)" style={{ margin:'0 auto 12px' }} />
            <div style={{ fontSize:16, fontWeight:600, marginBottom:6 }}>No results</div>
            <div style={{ color:'var(--text-secondary)', fontSize:13 }}>Try different search terms</div>
          </div>
        ) : (
          <>
            {/* ── Desktop table ── */}
            <div className="desktop-table" style={{ overflowX:'auto' }}>
              <table className="data-table" style={{ minWidth:'max-content' }}>
                    <thead>
                      <tr>
                        <th style={{ width:28, padding:'12px 6px' }} />
                        <th style={{ width:36 }}>#</th>
                        {displayCols.map(c => (
                          <th key={c} onClick={() => handleSort(c)} style={{ cursor: 'pointer' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {c}
                              {sortCol === c ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={11} style={{ opacity: 0.4 }} />}
                            </div>
                          </th>
                        ))}
                        {customCols.map(c => {
                          const colKey = `_custom_${c.id}`;
                          return (
                            <th key={c.id} onClick={() => handleSort(colKey)} style={{ cursor: 'pointer', color: 'var(--accent-hover)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {c.type === 'boolean' ? '⟐ ' : '✎ '}{c.name}
                                {sortCol === colKey ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={11} style={{ opacity: 0.4 }} />}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                <tbody>
                  {paged.map((rec, idx) => {
                    const recPending = !!pending[rec.id];
                    const recFailed = failedIds.has(rec.id);
                    return (
                      <tr key={rec.id} onClick={() => setSelectedRecord(rec)}>
                        <td style={{ padding:'12px 6px', textAlign:'center' }}>
                          <span
                            className="row-dot"
                            title={recFailed ? 'Sync failed' : recPending ? 'Pending sync' : 'Synced'}
                            style={{
                              background: recFailed ? 'var(--danger)' : recPending ? 'var(--warning)' : 'var(--success)',
                              opacity: recFailed || recPending ? 1 : 0.35,
                              animation: recPending && !recFailed ? 'pulse 2s infinite' : undefined,
                            }}
                          />
                        </td>
                        <td style={{ color:'var(--text-muted)', fontSize:12 }}>{page * PAGE_SIZE + idx + 1}</td>
                        {displayCols.map(c => (
                          <td key={c} title={String(rec[c] ?? '')}>
                            {search ? highlight(String(rec[c] ?? ''), search) : <span>{String(rec[c] ?? '')}</span>}
                          </td>
                        ))}
                        {customCols.map(c => {
                          const val = rec[`_custom_${c.id}`];
                          return (
                            <td key={c.id}>
                              {c.type === 'boolean'
                                ? <span className={`badge ${val ? 'badge-success' : ''}`} style={!val ? { background:'var(--bg-primary)', color:'var(--text-muted)', padding:'2px 8px' } : {}}>
                                    {val ? 'Yes' : 'No'}
                                  </span>
                                : <span style={{ color: val ? 'var(--text-primary)' : 'var(--text-muted)' }}>{String(val || '—')}</span>
                              }
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile cards ── */}
            <div className="mobile-cards" style={{ flexDirection:'column', gap:0, display:'none' }}>
              {paged.map((rec, idx) => {
                const recPending = !!pending[rec.id];
                const recFailed = failedIds.has(rec.id);
                const isExpanded = expandedRow === rec.id;
                return (
                  <div
                    key={rec.id}
                    style={{
                      borderBottom:'1px solid var(--border)',
                      background: isExpanded ? 'var(--bg-card)' : 'transparent',
                      transition:'background 0.15s',
                    }}
                  >
                    {/* Card header (always visible) */}
                    <div
                      onClick={() => setExpandedRow(isExpanded ? null : rec.id)}
                      style={{
                        display:'flex', alignItems:'center', gap:10,
                        padding:'14px 16px', cursor:'pointer', touchAction:'manipulation',
                      }}
                    >
                      {/* Sync dot */}
                      <span className="row-dot"
                        style={{
                          background: recFailed ? 'var(--danger)' : recPending ? 'var(--warning)' : 'var(--success)',
                          opacity: recFailed || recPending ? 1 : 0.35,
                          animation: recPending && !recFailed ? 'pulse 2s infinite' : undefined,
                          flexShrink: 0,
                        }}
                      />
                      {/* Row number */}
                      <span style={{ fontSize:12, color:'var(--text-muted)', flexShrink:0, width:28 }}>{page * PAGE_SIZE + idx + 1}</span>
                      {/* Primary content */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {search
                            ? highlight(String(rec[displayCols[0]] ?? '—'), search)
                            : <span>{String(rec[displayCols[0]] ?? '—')}</span>
                          }
                        </div>
                        {displayCols[1] && (
                          <div style={{ fontSize:12, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2 }}>
                            {search
                              ? highlight(String(rec[displayCols[1]] ?? ''), search)
                              : <span>{String(rec[displayCols[1]] ?? '')}</span>
                            }
                          </div>
                        )}
                      </div>
                      {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div style={{ padding:'0 16px 16px' }}>
                        {/* All excel columns */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                          {displayCols.map(c => (
                            <div key={c} style={{ background:'var(--bg-primary)', borderRadius:8, padding:'8px 10px' }}>
                              <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>{c}</div>
                              <div style={{ fontSize:13 }}>{String(rec[c] ?? '—')}</div>
                            </div>
                          ))}
                        </div>
                        {/* Custom column values */}
                        {customCols.length > 0 && (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
                            {customCols.map(c => {
                              const val = rec[`_custom_${c.id}`];
                              return (
                                <div key={c.id} style={{ background:'var(--accent-dim)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'6px 10px' }}>
                                  <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:700, marginBottom:2 }}>{c.name}</div>
                                  {c.type === 'boolean'
                                    ? <span style={{ fontSize:13, fontWeight:700, color: val ? 'var(--success)' : 'var(--text-muted)' }}>{val ? 'Yes' : 'No'}</span>
                                    : <span style={{ fontSize:13 }}>{String(val || '—')}</span>
                                  }
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <button className="btn-primary" onClick={() => setSelectedRecord(rec)} style={{ width:'100%', justifyContent:'center', padding:'13px' }}>
                          Edit Custom Fields
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Pagination + legend */}
      <div style={{
        padding:'10px 16px', borderTop:'1px solid var(--border)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        flexWrap:'wrap', gap:8, flexShrink:0, background:'var(--bg-secondary)',
      }}>
        {/* Legend */}
        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          {[
            { color:'var(--success)', opacity:0.35, label:'Synced' },
            { color:'var(--warning)', opacity:1, label:'Pending' },
            { color:'var(--danger)', opacity:1, label:'Failed' },
          ].map(l => (
            <span key={l.label} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text-muted)' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:l.color, opacity:l.opacity, display:'inline-block' }} />
              {l.label}
            </span>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <button className="btn-secondary" style={{ padding:'7px 11px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap' }}>
              {page + 1} / {totalPages}
            </span>
            <button className="btn-secondary" style={{ padding:'7px 11px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Record modal */}
      {selectedRecord && dataset && (
        <RecordModal
          record={selectedRecord}
          dataset={dataset}
          isPending={!!pending[selectedRecord.id]}
          isFailed={failedIds.has(selectedRecord.id)}
          onSave={handleRecordSave}
          onClose={() => { setSelectedRecord(null); setExpandedRow(null); }}
        />
      )}
    </div>
  );
}
