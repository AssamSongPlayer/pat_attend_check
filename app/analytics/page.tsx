'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  collection, onSnapshot, query, orderBy, getDocs, doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Dataset, DataRecord } from '@/lib/types';
import {
  BarChart3, ChevronDown, ChevronUp, ChevronsUpDown, Loader2,
  Hash, ToggleLeft, TrendingUp, Layers
} from 'lucide-react';
import Link from 'next/link';

type SortDir = 'asc' | 'desc' | null;

export default function AnalyticsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Load dataset list
  useEffect(() => {
    const q = query(collection(db, 'datasets'), orderBy('uploadedAt', 'desc'));
    return onSnapshot(q, snap => {
      const ds = snap.docs.map(d => ({ id: d.id, ...d.data() } as Dataset));
      setDatasets(ds);
      if (!selectedId && ds.length > 0) setSelectedId(ds[0].id);
    });
  }, []);

  // Load selected dataset + records
  useEffect(() => {
    if (!selectedId) return;
    setLoadingData(true);
    setSortCol('');
    setSortDir(null);

    const dsUnsub = onSnapshot(doc(db, 'datasets', selectedId), snap => {
      if (snap.exists()) setDataset({ id: snap.id, ...snap.data() } as Dataset);
    });

    const recUnsub = onSnapshot(collection(db, 'records', selectedId, 'rows'), snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as DataRecord)));
      setLoadingData(false);
    }, () => setLoadingData(false));

    return () => { dsUnsub(); recUnsub(); };
  }, [selectedId]);

  // All columns (excel + custom) available for analytics
  const allCols = useMemo(() => {
    if (!dataset) return [];
    return [
      ...(dataset.excelColumns || []).map(c => ({ key: c, label: c, type: 'text' as const })),
      ...(dataset.customColumns || []).map(c => ({
        key: `_custom_${c.id}`,
        label: c.name,
        type: c.type,
      })),
    ];
  }, [dataset]);

  // Boolean columns for count widgets
  const boolCols = useMemo(() => allCols.filter(c => c.type === 'boolean'), [allCols]);

  // Sorted records
  const sorted = useMemo(() => {
    if (!sortCol || !sortDir) return records;
    return [...records].sort((a, b) => {
      const av = String(a[sortCol] ?? '').toLowerCase();
      const bv = String(b[sortCol] ?? '').toLowerCase();
      const n = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === 'asc' ? n : -n;
    });
  }, [records, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol !== col) { setSortCol(col); setSortDir('asc'); return; }
    if (sortDir === 'asc') { setSortDir('desc'); return; }
    setSortCol(''); setSortDir(null);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  // Count yes values for a boolean column
  const countYes = (colKey: string) => records.filter(r => r[colKey] === true).length;
  const countNo = (colKey: string) => records.filter(r => r[colKey] === false || r[colKey] === undefined || r[colKey] === null).length;

  const displayCols = allCols.slice(0, 8);

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 className="gradient-text" style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>
          Analytics
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 15 }}>
          Sort, filter, and count your data across any dataset.
        </p>
      </div>

      {/* Dataset selector */}
      {datasets.length === 0 ? (
        <div className="glass-card" style={{ padding: 60, textAlign: 'center' }}>
          <Layers size={40} color="var(--text-muted)" style={{ margin: '0 auto 14px' }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No datasets uploaded yet</div>
          <Link href="/" className="btn-primary" style={{ display: 'inline-flex' }}>Upload Excel</Link>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Select Dataset
            </label>
            <select
              className="input-field"
              style={{ maxWidth: 400, appearance: 'none', cursor: 'pointer' }}
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              {datasets.map(ds => (
                <option key={ds.id} value={ds.id}>{ds.name} ({ds.rowCount?.toLocaleString()} rows)</option>
              ))}
            </select>
          </div>

          {loadingData ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Loader2 size={32} color="var(--accent-hover)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
                <div className="glass-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Hash size={14} color="var(--accent-hover)" />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Total Records</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{records.length.toLocaleString()}</div>
                </div>
                <div className="glass-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <TrendingUp size={14} color="var(--accent-hover)" />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Columns</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{allCols.length}</div>
                </div>
                {boolCols.map(col => {
                  const yes = countYes(col.key);
                  const total = records.length;
                  const pct = total > 0 ? Math.round((yes / total) * 100) : 0;
                  return (
                    <div key={col.key} className="glass-card" style={{ padding: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <ToggleLeft size={14} color="var(--success)" />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {col.label} — Yes
                        </span>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--success)' }}>{yes.toLocaleString()}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{pct}% of total</div>
                      {/* Mini bar */}
                      <div style={{ background: 'var(--bg-primary)', borderRadius: 4, height: 4, marginTop: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--success)', borderRadius: 4, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sortable table */}
              <div className="glass-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    Data Table
                    {sortCol && (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 10, fontWeight: 400 }}>
                        sorted by <strong>{allCols.find(c => c.key === sortCol)?.label}</strong> ({sortDir})
                      </span>
                    )}
                  </div>
                  {sortCol && (
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setSortCol(''); setSortDir(null); }}>
                      Clear Sort
                    </button>
                  )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ minWidth: 'max-content' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        {displayCols.map(col => (
                          <th key={col.key} onClick={() => handleSort(col.key)} style={{ color: sortCol === col.key ? 'var(--accent-hover)' : undefined }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              {col.type === 'boolean' && <ToggleLeft size={11} color="var(--success)" />}
                              {col.label}
                              <SortIcon col={col.key} />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.slice(0, 200).map((rec, idx) => (
                        <tr key={rec.id}>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{idx + 1}</td>
                          {displayCols.map(col => {
                            const val = rec[col.key];
                            return (
                              <td key={col.key}>
                                {col.type === 'boolean'
                                  ? <span className={`badge ${val ? 'badge-success' : ''}`}
                                      style={!val ? { background: 'var(--bg-primary)', color: 'var(--text-muted)', padding: '2px 8px' } : {}}>
                                      {val ? 'Yes' : 'No'}
                                    </span>
                                  : <span title={String(val ?? '')}>{String(val ?? '—').substring(0, 60)}</span>
                                }
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sorted.length > 200 && (
                    <div style={{ padding: '12px 20px', color: 'var(--text-muted)', fontSize: 13, borderTop: '1px solid var(--border)' }}>
                      Showing first 200 of {sorted.length.toLocaleString()} rows. Use the Data tab to view all records.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
