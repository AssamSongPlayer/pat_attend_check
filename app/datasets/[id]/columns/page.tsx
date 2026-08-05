'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CustomColumn, Dataset } from '@/lib/types';
import { Plus, Trash2, Type, ToggleLeft, GripVertical, Loader2, Info } from 'lucide-react';

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function ColumnsPage({ params }: { params: Promise<{ id: string }> }) {
  const [datasetId, setDatasetId] = useState('');
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<'text' | 'boolean'>('text');

  useEffect(() => {
    params.then(({ id }) => {
      setDatasetId(id);
      const unsub = onSnapshot(doc(db, 'datasets', id), snap => {
        if (snap.exists()) setDataset({ id: snap.id, ...snap.data() } as Dataset);
        setLoading(false);
      });
      return unsub;
    });
  }, [params]);

  const addColumn = async () => {
    if (!newColName.trim() || !datasetId) return;
    // Check for duplicates
    const exists = dataset?.customColumns?.some(
      c => c.name.toLowerCase() === newColName.trim().toLowerCase()
    );
    if (exists) { alert('A column with this name already exists.'); return; }

    const col: CustomColumn = {
      id: genId(),
      name: newColName.trim(),
      type: newColType,
      createdAt: Date.now(),
    };
    setSaving(true);
    try {
      await updateDoc(doc(db, 'datasets', datasetId), {
        customColumns: arrayUnion(col),
      });
      setNewColName('');
      setNewColType('text');
    } finally {
      setSaving(false);
    }
  };

  const deleteColumn = async (col: CustomColumn) => {
    if (!confirm(`Delete custom column "${col.name}"? Saved data in this column will be lost.`)) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'datasets', datasetId), {
        customColumns: arrayRemove(col),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Loader2 size={36} color="var(--accent-hover)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!dataset) {
    return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Dataset not found.</div>;
  }

  return (
    <div style={{ padding: '28px 24px', maxWidth: 760, margin: '0 auto' }}>
      {/* Excel columns (read-only) */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Excel Columns</h2>
          <span className="badge badge-accent">{dataset.excelColumns?.length}</span>
        </div>
        <div className="glass-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '8px 12px', background: 'var(--accent-dim)', borderRadius: 8, border: '1px solid var(--glass-border)' }}>
            <Info size={14} color="var(--accent-hover)" />
            <span style={{ fontSize: 13, color: 'var(--accent-hover)' }}>These columns come from your Excel file and are read-only.</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dataset.excelColumns?.map(col => (
              <div
                key={col}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8,
                  background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  fontSize: 13, color: 'var(--text-secondary)',
                }}
              >
                <Type size={12} />
                {col}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Custom columns */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Custom Columns</h2>
          <span className="badge badge-success">{dataset.customColumns?.length || 0}</span>
        </div>

        {/* Add new column form */}
        <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, color: 'var(--text-secondary)' }}>
            Add New Column
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              className="input-field"
              style={{ flex: '1 1 200px', minWidth: 0 }}
              placeholder="Column name…"
              value={newColName}
              onChange={e => setNewColName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addColumn()}
            />
            {/* Type selector */}
            <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                onClick={() => setNewColType('text')}
                style={{
                  padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: 'none', display: 'flex', alignItems: 'center', gap: 6,
                  background: newColType === 'text' ? 'var(--accent)' : 'var(--bg-card)',
                  color: newColType === 'text' ? 'white' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                <Type size={14} /> Text
              </button>
              <button
                onClick={() => setNewColType('boolean')}
                style={{
                  padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: 'none', display: 'flex', alignItems: 'center', gap: 6,
                  background: newColType === 'boolean' ? 'var(--success)' : 'var(--bg-card)',
                  color: newColType === 'boolean' ? 'white' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                  borderLeft: '1px solid var(--border)',
                }}
              >
                <ToggleLeft size={14} /> Yes/No
              </button>
            </div>
            <button
              className="btn-primary"
              onClick={addColumn}
              disabled={!newColName.trim() || saving}
              style={{ flexShrink: 0 }}
            >
              {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={15} />}
              Add Column
            </button>
          </div>
        </div>

        {/* Custom columns list */}
        {(!dataset.customColumns || dataset.customColumns.length === 0) ? (
          <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
            <ToggleLeft size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No custom columns yet</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Add columns above to track extra info per record
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dataset.customColumns.map(col => (
              <div
                key={col.id}
                className="glass-card animate-fade-in"
                style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <GripVertical size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: col.type === 'boolean' ? 'var(--success-dim)' : 'var(--accent-dim)',
                  border: `1px solid ${col.type === 'boolean' ? 'rgba(34,197,94,0.3)' : 'var(--glass-border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {col.type === 'boolean'
                    ? <ToggleLeft size={16} color="var(--success)" />
                    : <Type size={16} color="var(--accent-hover)" />
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{col.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {col.type === 'boolean' ? 'Yes / No toggle' : 'Free text input'}
                  </div>
                </div>
                <span className={`badge ${col.type === 'boolean' ? 'badge-success' : 'badge-accent'}`}>
                  {col.type === 'boolean' ? 'Yes/No' : 'Text'}
                </span>
                <button
                  className="btn-danger"
                  onClick={() => deleteColumn(col)}
                  style={{ padding: '6px 10px' }}
                  title="Delete column"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
