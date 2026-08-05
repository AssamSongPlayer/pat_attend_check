'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  collection,
  addDoc,
  writeBatch,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';

type UploadState = 'idle' | 'parsing' | 'uploading' | 'done' | 'error';

interface ParsedData {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [datasetName, setDatasetName] = useState('');

  const parseFile = useCallback((file: File) => {
    setState('parsing');
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (json.length === 0) throw new Error('The sheet appears to be empty.');
        const headers = Object.keys(json[0]);
        setParsed({ headers, rows: json, fileName: file.name.replace(/\.[^.]+$/, '') });
        setDatasetName(file.name.replace(/\.[^.]+$/, ''));
        setState('idle');
      } catch (err) {
        setError((err as Error).message || 'Failed to parse file.');
        setState('error');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleUpload = async () => {
    if (!parsed) return;
    setState('uploading');
    setProgress(0);
    setError('');
    
    // Helper to wrap Firestore promises with a timeout
    const withTimeout = <T,>(promise: Promise<T>, message: string, ms = 12000): Promise<T> => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(message)), ms)
      );
      return Promise.race([promise, timeout]);
    };

    try {
      // Create dataset doc with timeout
      const dsRef = await withTimeout(
        addDoc(collection(db, 'datasets'), {
          name: datasetName || parsed.fileName,
          uploadedAt: Date.now(),
          rowCount: parsed.rows.length,
          excelColumns: parsed.headers,
          customColumns: [],
        }),
        'Database connection timed out. Please make sure Firestore is created in Native Mode and rules allow read/write access.'
      );

      // Batch write records (500 per batch)
      const BATCH_SIZE = 400;
      for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = parsed.rows.slice(i, i + BATCH_SIZE);
        
        chunk.forEach((row) => {
          const rRef = doc(collection(db, 'records', dsRef.id, 'rows'));
          batch.set(rRef, { ...row, _datasetId: dsRef.id, _createdAt: Date.now() });
        });
        
        await withTimeout(
          batch.commit(),
          `Uploading batch ${Math.floor(i / BATCH_SIZE) + 1} timed out. Check your internet connection or Firestore rules.`,
          15000
        );
        
        setProgress(Math.round(((i + chunk.length) / parsed.rows.length) * 100));
      }

      setState('done');
      setTimeout(() => router.push(`/datasets/${dsRef.id}/data`), 1500);
    } catch (err) {
      setError((err as Error).message || 'Upload failed.');
      setState('error');
    }
  };

  const reset = () => {
    setState('idle');
    setParsed(null);
    setProgress(0);
    setError('');
    setDatasetName('');
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 className="gradient-text" style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>
          Upload Excel
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 15 }}>
          Drop an Excel (.xlsx, .xls) or CSV file to import it into Firebase.
        </p>
      </div>

      {/* Drop zone */}
      {!parsed && state !== 'parsing' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className="glass-card"
          style={{
            padding: '64px 32px',
            textAlign: 'center',
            cursor: 'pointer',
            border: dragOver
              ? '2px dashed var(--accent)'
              : '2px dashed var(--border)',
            background: dragOver ? 'var(--accent-dim)' : 'var(--bg-card)',
            transition: 'all 0.2s',
          }}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
          <div style={{
            width: 72, height: 72, borderRadius: '20px',
            background: 'var(--accent-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            border: '1px solid var(--glass-border)',
          }}>
            <Upload size={32} color="var(--accent-hover)" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Drop your Excel file here
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            or click to browse • Supports .xlsx, .xls, .csv
          </div>
          <button className="btn-primary" onClick={e => { e.stopPropagation(); document.getElementById('file-input')?.click(); }}>
            <FileSpreadsheet size={16} />
            Choose File
          </button>
        </div>
      )}

      {/* Parsing spinner */}
      {state === 'parsing' && (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <Loader2 size={40} color="var(--accent-hover)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>Parsing your file…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Preview */}
      {parsed && state === 'idle' && (
        <div className="animate-fade-in">
          <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'var(--success-dim)', border: '1px solid rgba(34,197,94,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FileSpreadsheet size={22} color="var(--success)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{parsed.fileName}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {parsed.rows.length.toLocaleString()} rows · {parsed.headers.length} columns
                  </div>
                </div>
              </div>
              <button className="btn-danger" onClick={reset} title="Remove">
                <X size={14} /> Remove
              </button>
            </div>

            {/* Dataset name input */}
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              Dataset Name
            </label>
            <input
              className="input-field"
              value={datasetName}
              onChange={e => setDatasetName(e.target.value)}
              placeholder="Enter dataset name…"
              style={{ marginBottom: 20 }}
            />

            {/* Columns preview */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Detected Columns
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {parsed.headers.map(h => (
                  <span key={h} className="badge badge-accent">{h}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Data preview table */}
          <div className="glass-card" style={{ overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 14 }}>
              Preview (first 5 rows)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {parsed.headers.map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {parsed.headers.map(h => (
                        <td key={h} title={String(row[h])}>{String(row[h]).substring(0, 50)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button className="btn-primary" onClick={handleUpload} style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
            <Upload size={18} />
            Upload to Firebase ({parsed.rows.length.toLocaleString()} rows)
          </button>
        </div>
      )}

      {/* Uploading progress */}
      {state === 'uploading' && (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center' }} >
          <Loader2 size={36} color="var(--accent-hover)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Uploading to Firebase…</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>{progress}% complete</div>
          <div style={{ background: 'var(--bg-primary)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              transition: 'width 0.3s ease',
              borderRadius: 8,
            }} />
          </div>
        </div>
      )}

      {/* Done */}
      {state === 'done' && (
        <div className="glass-card animate-fade-in" style={{ padding: 48, textAlign: 'center' }}>
          <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Upload Complete!</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Redirecting to your dataset…</div>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="glass-card" style={{ padding: 32, textAlign: 'center', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertCircle size={40} color="var(--danger)" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--danger)', marginBottom: 8 }}>Upload Failed</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>{error}</div>
          <button className="btn-secondary" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
