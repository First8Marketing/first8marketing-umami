'use client';

import { Row, Text, Column } from '@umami/react-zen';
import { CURRENT_VERSION } from '@/lib/constants';
import { useDemo } from './DemoProvider';

/**
 * Demo Footer Component
 *
 * Displays the demo mode footer with contact information,
 * version number, and copyright.
 */
export function DemoFooter() {
  const { config } = useDemo();

  return (
    <Column
      as="footer"
      paddingY="6"
      paddingX="4"
      backgroundColor="2"
      gap="3"
      style={{
        borderTop: '1px solid var(--base200)',
      }}
    >
      <Row justifyContent="space-between" alignItems="center" wrap gap="4">
        {/* Contact Info */}
        <Row gap="4" alignItems="center">
          {config.email && (
            <a href={`mailto:${config.email}`} style={{ textDecoration: 'none' }}>
              <Text color="muted" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span role="img" aria-label="email">
                  📧
                </span>
                {config.email}
              </Text>
            </a>
          )}
          {config.whatsapp && (
            <a
              href={`https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <Text color="muted" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span role="img" aria-label="whatsapp">
                  📱
                </span>
                {config.whatsapp}
              </Text>
            </a>
          )}
        </Row>

        {/* Brand & Version */}
        <Row gap="2" alignItems="center">
          <Text size="sm" color="muted">
            Powered by
          </Text>
          <Text weight="bold" size="sm">
            {config.brandName}
          </Text>
          <Text size="sm" color="muted">
            v{CURRENT_VERSION}
          </Text>
        </Row>
      </Row>

      {/* Copyright */}
      <Row justifyContent="center">
        <Text size="xs" color="muted">
          © {new Date().getFullYear()} {config.brandName}. All rights reserved.
        </Text>
      </Row>
    </Column>
  );
}
