'use client';

import { ReactNode } from 'react';
import { Column } from '@umami/react-zen';
import { DemoProvider } from './DemoProvider';
import { DemoHeader } from './DemoHeader';
import { DemoFooter } from './DemoFooter';
import { DemoContactBanner } from './DemoContactBanner';

/**
 * Demo Layout Props
 */
interface DemoLayoutProps {
  children: ReactNode;
}

/**
 * Demo Layout Component
 *
 * Main layout wrapper for demo mode pages.
 * Provides the demo context, header, footer, and contact banner.
 */
export function DemoLayout({ children }: DemoLayoutProps) {
  return (
    <DemoProvider>
      <Column
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <DemoHeader />

        <Column
          as="main"
          style={{
            flex: 1,
            overflow: 'auto',
          }}
        >
          {children}
        </Column>

        <DemoFooter />
        <DemoContactBanner />
      </Column>
    </DemoProvider>
  );
}
