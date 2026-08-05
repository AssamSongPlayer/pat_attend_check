'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, orderBy, query, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Dataset } from '@/lib/types';
import { Table2, Trash2, ChevronRight, Plus, Layers,
  Calendar, Hash, Settings, Loader2, Link2, Check } from 'lucide-react';

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyShareLink = (dsId: string) => {
    const url = `${window.location.origin}/view/${dsId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(dsId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  useEffect(() => {
    const q = query(collection(db, 'datasets'), orderBy('uploadedAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setDatasets(snap.docs.map(d => ({ id: d.id, ...d.data() } as Dataset)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const handleDelete = async (ds: Dataset) => {
    if (!confirm(`Delete "${ds.name}" and all its records? This cannot be undone.`)) return;
    setDeleting(ds.id);
    try {
      // Delete all records subcollection
      const rows = await getDocs(collection(db, 'records', ds.id, 'rows'));
      const batchSize = 400;
      for (let i = 0; i < rows.docs.length; i += batchSize) {
        const { writeBatch } = await import('firebase/firestore');
        const batch = writeBatch(db);
        rows.docs.slice(i, i + batchSize).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, 'datasets', ds.id));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="gradient-text" style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>
            All Datasets
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 15 }}>
            {datasets.length} dataset{datasets.length !== 1 ? 's' : ''} uploaded
          </p>
        </div>
        <Link href="/" className="btn-primary">
          <Plus size={16} /> Upload New
        </Link>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Loader2 size={36} color="var(--accent-hover)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!loading && datasets.length === 0 && (
        <div className="glass-card" style={{ padding: 80, textAlign: 'center' }}>
          <Layers size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No datasets yet</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>
            Upload your first Excel file to get started
          </div>
          <Link href="/" className="btn-primary">
            <Plus size={16} /> Upload Excel
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {datasets.map(ds => (
          <div
            key={ds.id}
            className="glass-card animate-fade-in"
            style={{
              padding: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              transition: 'all 0.2s',
              flexWrap: 'wrap',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 48, height: 48, borderRadius: 12, flexShrink: 0,
              background: 'var(--accent-dim)', border: '1px solid var(--glass-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Table2 size={22} color="var(--accent-hover)" />
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ds.name}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <Hash size={12} /> {ds.rowCount?.toLocaleString()} rows
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <Table2 size={12} /> {ds.excelColumns?.length} columns
                </span>
                {ds.customColumns?.length > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <Settings size={12} /> {ds.customColumns.length} custom
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <Calendar size={12} /> {new Date(ds.uploadedAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
              {/* Copy student share link */}
              <button
                onClick={() => copyShareLink(ds.id)}
                className="btn-secondary"
                style={{ padding: '8px 12px', fontSize: 13, gap: 6 }}
                title="Copy student share link (/view/id)"
              >
                {copiedId === ds.id ? <Check size={14} color="var(--success)" /> : <Link2 size={14} />}
                <span>{copiedId === ds.id ? 'Copied!' : 'Share'}</span>
              </button>
              <Link
                href={`/datasets/${ds.id}/columns`}
                className="btn-secondary"
                style={{ padding: '8px 12px', fontSize: 13 }}
                title="Manage Columns"
              >
                <Settings size={14} />
                <span style={{ display: 'none' }}>Columns</span>
              </Link>
              <Link
                href={`/datasets/${ds.id}/data`}
                className="btn-primary"
                style={{ padding: '8px 14px', fontSize: 13 }}
              >
                Admin View <ChevronRight size={14} />
              </Link>
              <button
                className="btn-danger"
                onClick={() => handleDelete(ds)}
                disabled={deleting === ds.id}
                title="Delete dataset"
                style={{ padding: '8px 10px' }}
              >
                {deleting === ds.id
                  ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Trash2 size={14} />
                }
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
