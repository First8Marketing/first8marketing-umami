import { Suspense } from 'react';
import { Metadata } from 'next';
import { DemoPage } from './DemoPage';

export default function Page() {
  return (
    <Suspense fallback={<DemoLoading />}>
      <DemoPage />
    </Suspense>
  );
}

function DemoLoading() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: 'var(--base100)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            border: '3px solid var(--base200)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <p style={{ color: 'var(--text-muted)' }}>Loading demo...</p>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export const metadata: Metadata = {
  title: 'Demo | First8Marketing Analytics',
  description: 'Explore First8Marketing analytics platform capabilities with our interactive demo.',
};
