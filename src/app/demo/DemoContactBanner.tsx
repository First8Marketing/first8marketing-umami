'use client';

import { useState, useEffect } from 'react';
import { Row, Text, Button, Column } from '@umami/react-zen';
import { useDemo } from './DemoProvider';

/**
 * Demo Contact Banner Component
 *
 * A floating banner that displays contact options (email, WhatsApp)
 * prominently on the demo page.
 */
export function DemoContactBanner() {
  const { config, urls } = useDemo();
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Show banner after a short delay for better UX
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible || (!config.email && !config.whatsapp)) {
    return null;
  }

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: 'var(--primary)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '24px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'pulse 2s infinite',
        }}
        title="Contact Us"
        aria-label="Open contact banner"
      >
        💬
      </button>
    );
  }

  return (
    <>
      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      <Column
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: 'var(--base100)',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          maxWidth: '320px',
          animation: 'slideIn 0.3s ease-out',
          border: '1px solid var(--base200)',
        }}
        gap="4"
      >
        {/* Header */}
        <Row justifyContent="space-between" alignItems="center">
          <Text weight="bold" size="lg">
            Get in Touch
          </Text>
          <button
            onClick={() => setIsMinimized(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '4px',
              color: 'var(--text-muted)',
            }}
            aria-label="Minimize contact banner"
          >
            ✕
          </button>
        </Row>

        {/* Message */}
        <Text color="muted" size="sm">
          Interested in {config.brandName}? Contact us for a personalized demo!
        </Text>

        {/* Contact Buttons */}
        <Column gap="2">
          {config.email && (
            <a href={urls.mailto} style={{ textDecoration: 'none', display: 'block' }}>
              <Button
                variant="secondary"
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  gap: '12px',
                }}
              >
                <span style={{ fontSize: '20px' }}>📧</span>
                <Column alignItems="flex-start" gap="0">
                  <Text weight="medium">Email Us</Text>
                  <Text size="xs" color="muted">
                    {config.email}
                  </Text>
                </Column>
              </Button>
            </a>
          )}

          {config.whatsapp && (
            <a
              href={urls.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <Button
                variant="primary"
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  gap: '12px',
                  backgroundColor: '#25D366',
                  borderColor: '#25D366',
                }}
              >
                <span style={{ fontSize: '20px' }}>📱</span>
                <Column alignItems="flex-start" gap="0">
                  <Text weight="medium" style={{ color: 'white' }}>
                    WhatsApp
                  </Text>
                  <Text size="xs" style={{ color: 'rgba(255,255,255,0.8)' }}>
                    {config.whatsapp}
                  </Text>
                </Column>
              </Button>
            </a>
          )}
        </Column>

        {/* CTA */}
        {config.ctaUrl && (
          <a
            href={config.ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none', display: 'block', marginTop: '8px' }}
          >
            <Button variant="primary" style={{ width: '100%' }}>
              {config.ctaText}
            </Button>
          </a>
        )}
      </Column>
    </>
  );
}
