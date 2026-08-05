'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Dataset } from '@/lib/types';
import {
  Upload,
  Database,
  BarChart3,
  ChevronRight,
  Menu,
  X,
  Table2,
  Layers,
} from 'lucide-react';

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: '10px',
        textDecoration: 'none',
        fontSize: '14px',
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--accent-hover)' : 'var(--text-secondary)',
        background: active ? 'var(--accent-dim)' : 'transparent',
        border: active ? '1px solid var(--glass-border)' : '1px solid transparent',
        transition: 'all 0.2s',
        marginBottom: '2px',
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'var(--bg-card-hover)';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
        }
      }}
    >
      <Icon size={18} />
      <span>{label}</span>
    </Link>
  );
}

function SidebarContent({ pathname, datasets, onClose }: {
  pathname: string;
  datasets: Dataset[];
  onClose?: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px' }}>
      {/* Logo */}
      <div style={{ padding: '8px 4px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Database size={20} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>DataVault</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Excel Manager</div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
            <X size={20} />
          </button>
        )}
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', padding: '4px 12px 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Main
        </div>
        <NavLink href="/" icon={Upload} label="Upload" active={pathname === '/'} onClick={onClose} />
        <NavLink href="/datasets" icon={Layers} label="All Datasets" active={pathname === '/datasets'} onClick={onClose} />
        <NavLink href="/analytics" icon={BarChart3} label="Analytics" active={pathname === '/analytics'} onClick={onClose} />

        {datasets.length > 0 && (
          <>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', padding: '16px 12px 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Datasets
            </div>
            {datasets.map(ds => {
              const isActive = pathname.startsWith(`/datasets/${ds.id}`);
              return (
                <div key={ds.id} style={{ marginBottom: '2px' }}>
                  <Link
                    href={`/datasets/${ds.id}/data`}
                    onClick={onClose}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--accent-hover)' : 'var(--text-secondary)',
                      background: isActive ? 'var(--accent-dim)' : 'transparent',
                      border: isActive ? '1px solid var(--glass-border)' : '1px solid transparent',
                      transition: 'all 0.2s',
                      overflow: 'hidden',
                    }}
                  >
                    <Table2 size={14} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ds.name}</span>
                    <ChevronRight size={12} style={{ marginLeft: 'auto', flexShrink: 0, opacity: 0.5 }} />
                  </Link>
                </div>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid var(--border)',
        fontSize: '12px',
        color: 'var(--text-muted)',
      }}>
        <div style={{ fontWeight: 600, marginBottom: '2px' }}>DataVault v1.0</div>
        <div>Firebase · Excel · Realtime</div>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Only load datasets list for admin routes
    if (pathname.startsWith('/view/')) return;
    const q = query(collection(db, 'datasets'), orderBy('uploadedAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setDatasets(snap.docs.map(d => ({ id: d.id, ...d.data() } as Dataset)));
    }, () => {});
    return unsub;
  }, [pathname]);

  // Student view — completely isolated, no admin navigation
  if (pathname.startsWith('/view/')) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
        {children}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Desktop sidebar */}
      <aside
        className="sidebar-desktop"
        style={{
          width: 240,
          flexShrink: 0,
          flexDirection: 'column',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          overflowY: 'auto',
        }}
      >
        <SidebarContent pathname={pathname} datasets={datasets} />
      </aside>

      {/* Mobile header */}
      <div className="mobile-nav" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 16px',
        alignItems: 'center',
        gap: '12px',
        height: 56,
      }}>
        <button
          onClick={() => setMobileOpen(true)}
          style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px' }}
        >
          <Menu size={22} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '8px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Database size={16} color="white" />
          </div>
          <span style={{ fontWeight: 700, fontSize: '15px' }}>DataVault</span>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="mobile-nav"
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex',
          }}
        >
          <div
            onClick={() => setMobileOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          />
          <div style={{
            position: 'relative', zIndex: 1,
            width: 260,
            background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border)',
            height: '100%',
            overflowY: 'auto',
          }}>
            <SidebarContent pathname={pathname} datasets={datasets} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Mobile spacer */}
        <div className="mobile-nav" style={{ height: 56, flexShrink: 0 }} />
        <div style={{ flex: 1, padding: 0 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
