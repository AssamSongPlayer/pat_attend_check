'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Dataset } from '@/lib/types';
import { Table2, Loader2 } from 'lucide-react';

export default function DatasetLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const [dataset, setDataset] = useState<Dataset | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      const unsub = onSnapshot(doc(db, 'datasets', id), snap => {
        if (snap.exists()) setDataset({ id: snap.id, ...snap.data() } as Dataset);
      });
      return unsub;
    });
  }, [params]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Slim dataset name bar */}
      <div style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: 'var(--accent-dim)', border: '1px solid var(--glass-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Table2 size={15} color="var(--accent-hover)" />
        </div>
        {dataset ? (
          <div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{dataset.name}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>
              {dataset.rowCount?.toLocaleString()} rows · {dataset.excelColumns?.length} columns
            </span>
          </div>
        ) : (
          <span className="skeleton" style={{ display: 'inline-block', width: 160, height: 16 }} />
        )}
      </div>

      {/* Page content fills rest */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}
