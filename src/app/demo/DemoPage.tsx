'use client';

import { useState, Key } from 'react';
import { Column, Row, Text, Loading, Tabs, TabList, Tab, TabPanel } from '@umami/react-zen';
import { DemoLayout } from './DemoLayout';
import { useDemo } from './DemoProvider';
import { WebsiteProvider } from '@/app/(main)/websites/WebsiteProvider';
import { WebsitePage } from '@/app/(main)/websites/[websiteId]/WebsitePage';
import { WebsiteHeader } from '@/app/(main)/websites/[websiteId]/WebsiteHeader';
import { PageBody } from '@/components/common/PageBody';
import { Panel } from '@/components/common/Panel';
import { useShareTokenQuery } from '@/components/hooks';
import { isDemoConfigValid } from '@/lib/demo';
import { getDemoConfig } from '@/lib/demo-data';
import { DemoChannelOverview, DemoChannelDetail } from './DemoChannelOverview';
import { DemoJourneyTimeline } from './DemoJourneyTimeline';
import { DemoCrossChannelStats } from './DemoCrossChannelStats';
import { getItem, setItem } from '@/lib/storage';

// Storage key for persisting selected tab
const TAB_STORAGE_KEY = 'umami.demo.tab';

/**
 * Demo Page Component
 *
 * Main demo page that displays a unified cross-channel analytics dashboard.
 * Features a tabbed interface to show:
 * - Tab 1: Website Analytics (existing WebsitePage component)
 * - Tab 2: Email Analytics (DemoChannelDetail for email)
 * - Tab 3: WhatsApp Analytics (DemoChannelDetail for WhatsApp)
 * - Tab 4: Cross-Channel (DemoCrossChannelStats + DemoJourneyTimeline)
 *
 * Follows the same pattern as SharePage for loading website analytics.
 */
export function DemoPage() {
  const { config } = useDemo();
  const [activeTab, setActiveTab] = useState<Key>(getItem(TAB_STORAGE_KEY) || 'website');

  // When shareId is configured, use the share token query to resolve websiteId
  // This follows the same pattern as SharePage.tsx
  const { shareToken, isLoading: isShareLoading } = useShareTokenQuery(config.shareId);

  // Determine the websiteId to use:
  // 1. Prefer direct websiteId if configured
  // 2. Otherwise use the websiteId from the resolved shareToken
  const websiteId = config.websiteId || shareToken?.websiteId || '';

  // Loading state: only loading if we need to resolve a shareId and it's still loading
  const needsShareToken = !config.websiteId && config.shareId;
  const isLoading = needsShareToken && isShareLoading;

  // Handle tab selection with persistence
  const handleTabChange = (key: Key) => {
    setItem(TAB_STORAGE_KEY, key);
    setActiveTab(key);
  };

  // Show loading state while resolving share token
  if (isLoading) {
    return (
      <DemoLayout>
        <Column alignItems="center" justifyContent="center" style={{ minHeight: '60vh' }}>
          <Loading />
          <Text color="muted" style={{ marginTop: '16px' }}>
            Loading analytics dashboard...
          </Text>
        </Column>
      </DemoLayout>
    );
  }

  // Check if demo mode is properly configured
  if (!isDemoConfigValid()) {
    return (
      <DemoLayout>
        <Column alignItems="center" justifyContent="center" style={{ minHeight: '60vh' }} gap="4">
          <Text size="xl" weight="bold">
            ⚠️ Demo Not Configured
          </Text>
          <Text color="muted" style={{ maxWidth: '400px', textAlign: 'center' }}>
            Demo mode is not properly configured. Please set DEMO_MODE=true and either
            DEMO_WEBSITE_ID or DEMO_SHARE_ID in your environment variables.
          </Text>
        </Column>
      </DemoLayout>
    );
  }

  // Check if we have a websiteId (either direct or from share token)
  if (!websiteId) {
    // If we had a shareId but no shareToken was found, show specific error
    if (config.shareId && !shareToken) {
      return (
        <DemoLayout>
          <Column alignItems="center" justifyContent="center" style={{ minHeight: '60vh' }} gap="4">
            <Text size="xl" weight="bold">
              ⚠️ Invalid Share ID
            </Text>
            <Text color="muted" style={{ maxWidth: '400px', textAlign: 'center' }}>
              The configured DEMO_SHARE_ID could not be found. Please verify the share ID is valid.
            </Text>
          </Column>
        </DemoLayout>
      );
    }

    return (
      <DemoLayout>
        <Column alignItems="center" justifyContent="center" style={{ minHeight: '60vh' }} gap="4">
          <Text size="xl" weight="bold">
            ⚠️ No Website Configured
          </Text>
          <Text color="muted" style={{ maxWidth: '400px', textAlign: 'center' }}>
            Please configure DEMO_WEBSITE_ID or DEMO_SHARE_ID to display analytics.
          </Text>
        </Column>
      </DemoLayout>
    );
  }

  return (
    <DemoLayout>
      {/* Demo Banner */}
      <Row
        justifyContent="center"
        alignItems="center"
        paddingY="2"
        style={{
          backgroundColor: 'var(--primary)',
          color: 'white',
        }}
      >
        <Text size="sm" weight="medium" style={{ color: 'white' }}>
          🎯 You&apos;re viewing a demo of {config.brandName} Analytics - Unified Cross-Channel
          Tracking
        </Text>
      </Row>

      {/* Unified User Identity Display */}
      <PageBody>
        <DemoUserIdentityBanner />
      </PageBody>

      {/* Main Tabbed Content */}
      <PageBody gap>
        <Panel>
          <Tabs selectedKey={activeTab} onSelectionChange={handleTabChange}>
            <TabList>
              <Tab id="website">🌐 Website Analytics</Tab>
              <Tab id="email">📧 Email Analytics</Tab>
              <Tab id="whatsapp">💬 WhatsApp Analytics</Tab>
              <Tab id="cross-channel">🔗 Cross-Channel</Tab>
            </TabList>

            {/* Tab 1: Website Analytics - Existing WebsitePage */}
            <TabPanel id="website">
              <WebsiteProvider websiteId={websiteId}>
                <WebsiteHeader showActions={false} />
                <WebsitePage websiteId={websiteId} />
              </WebsiteProvider>
            </TabPanel>

            {/* Tab 2: Email Analytics */}
            <TabPanel id="email">
              <DemoChannelDetail channel="email" />
            </TabPanel>

            {/* Tab 3: WhatsApp Analytics */}
            <TabPanel id="whatsapp">
              <DemoChannelDetail channel="whatsapp" />
            </TabPanel>

            {/* Tab 4: Cross-Channel Attribution */}
            <TabPanel id="cross-channel">
              <Column gap="4">
                {/* Channel Overview */}
                <DemoChannelOverview />

                {/* Cross-Channel Stats */}
                <DemoCrossChannelStats />

                {/* Journey Timeline */}
                <DemoJourneyTimeline />
              </Column>
            </TabPanel>
          </Tabs>
        </Panel>
      </PageBody>

      {/* Feature Highlights */}
      <DemoFeatureHighlights />
    </DemoLayout>
  );
}

/**
 * Demo User Identity Banner
 * Shows the unified user identity (phone + email linked) at the top
 */
function DemoUserIdentityBanner() {
  const { account } = getDemoConfig();

  return (
    <Row
      padding="3"
      backgroundColor="2"
      style={{
        borderRadius: '8px',
        marginBottom: '16px',
        borderLeft: '4px solid var(--primary)',
      }}
      gap="4"
      alignItems="center"
      wrap
    >
      <Row gap="2" alignItems="center">
        <Text size="lg">👤</Text>
        <Column gap="0">
          <Text weight="bold">Demo User Profile</Text>
          <Text size="xs" color="muted">
            Unified identity across all channels
          </Text>
        </Column>
      </Row>

      <div style={{ width: '1px', height: '32px', backgroundColor: 'var(--border-color)' }} />

      <Row gap="4" wrap>
        <Row gap="1" alignItems="center">
          <Text size="sm">📧</Text>
          <Text size="sm">{account.user.email}</Text>
        </Row>
        <Row gap="1" alignItems="center">
          <Text size="sm">📱</Text>
          <Text size="sm">{account.user.phone}</Text>
        </Row>
        <Row
          padding="1"
          paddingX="2"
          style={{
            backgroundColor: '#22c55e',
            borderRadius: '4px',
          }}
        >
          <Text size="xs" style={{ color: 'white' }}>
            ✓ Linked
          </Text>
        </Row>
      </Row>
    </Row>
  );
}

/**
 * Demo Feature Highlights Section
 *
 * Displays key features of the platform below the dashboard.
 */
function DemoFeatureHighlights() {
  const features = [
    {
      icon: '📊',
      title: 'Real-Time Analytics',
      description: 'Track page views, visitors, and events in real-time',
    },
    {
      icon: '📧',
      title: 'Email Tracking',
      description: 'Monitor email campaign performance and engagement',
    },
    {
      icon: '📱',
      title: 'WhatsApp Integration',
      description: 'Connect WhatsApp for conversational analytics',
    },
    {
      icon: '🎯',
      title: 'Conversion Tracking',
      description: 'Measure goals and track customer journeys',
    },
  ];

  return (
    <Column paddingY="8" paddingX="4" backgroundColor="2" gap="6">
      <Column alignItems="center" gap="2">
        <Text size="xl" weight="bold">
          Platform Capabilities
        </Text>
        <Text color="muted">
          Discover what {process.env.demoBrandName || 'First8Marketing'} can do for your business
        </Text>
      </Column>

      <Row justifyContent="center" gap="6" wrap style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {features.map((feature, index) => (
          <Column
            key={index}
            padding="5"
            backgroundColor="1"
            style={{
              borderRadius: '12px',
              minWidth: '250px',
              maxWidth: '280px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
            }}
            gap="3"
          >
            <Text size="2xl">{feature.icon}</Text>
            <Text weight="bold">{feature.title}</Text>
            <Text color="muted" size="sm">
              {feature.description}
            </Text>
          </Column>
        ))}
      </Row>
    </Column>
  );
}
