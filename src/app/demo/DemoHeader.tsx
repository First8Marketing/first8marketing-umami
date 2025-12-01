'use client';

import { Row, Icon, Text, ThemeButton, Button } from '@umami/react-zen';
import { LanguageButton } from '@/components/input/LanguageButton';
import { Logo } from '@/components/svg';
import { useDemo } from './DemoProvider';

/**
 * Demo Header Component
 *
 * Displays the demo mode header with branding, theme toggle,
 * language selector, and call-to-action button.
 */
export function DemoHeader() {
  const { config } = useDemo();

  const handleCtaClick = () => {
    if (config.ctaUrl) {
      window.open(config.ctaUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Row
      as="header"
      justifyContent="space-between"
      alignItems="center"
      paddingY="3"
      paddingX="4"
      backgroundColor="1"
      style={{
        borderBottom: '1px solid var(--base200)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Brand Logo */}
      <Row alignItems="center" gap="3">
        <Icon size="lg">
          <Logo />
        </Icon>
        <div>
          <Text weight="bold" size="lg">
            {config.brandName}
          </Text>
          {config.tagline && (
            <Text size="sm" color="muted" style={{ display: 'block' }}>
              {config.tagline}
            </Text>
          )}
        </div>
      </Row>

      {/* Header Actions */}
      <Row alignItems="center" gap="3">
        <ThemeButton />
        <LanguageButton />

        {config.ctaUrl && (
          <Button variant="primary" onClick={handleCtaClick}>
            {config.ctaText}
          </Button>
        )}
      </Row>
    </Row>
  );
}
