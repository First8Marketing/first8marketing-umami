'use client';

import { Column, Row, Text } from '@umami/react-zen';
import { DEMO_ANALYTICS, DEMO_ACCOUNT } from '@/lib/demo-data';
import { Panel } from '@/components/common/Panel';

/**
 * Channel color configuration
 * Consistent with DemoJourneyTimeline for visual coherence
 */
const CHANNEL_COLORS = {
  website: '#3b82f6', // Blue
  email: '#22c55e', // Green
  whatsapp: '#8b5cf6', // Purple
} as const;

/**
 * Demo Cross-Channel Stats Component
 *
 * Displays cross-channel attribution analytics:
 * - Total users identified across channels
 * - Conversions by channel with visual breakdown
 * - Top user journeys with revenue attribution
 *
 * Uses data from DEMO_ANALYTICS.crossChannel for demonstration.
 */
export function DemoCrossChannelStats() {
  const { crossChannel } = DEMO_ANALYTICS;

  return (
    <Column gap="4">
      {/* Attribution Model Badge */}
      <AttributionModelBadge model={crossChannel.attributionModel} />

      {/* User Identification Stats */}
      <UserIdentificationStats
        totalUsers={crossChannel.totalUsers}
        identifiedUsers={crossChannel.identifiedAcrossChannels}
      />

      {/* Conversions by Channel */}
      <ConversionsByChannel conversions={crossChannel.conversionsByChannel} />

      {/* Top User Journeys */}
      <TopJourneys journeys={crossChannel.topJourneys} />
    </Column>
  );
}

/**
 * Attribution Model Badge
 * Displays the current attribution model being used
 */
interface AttributionModelBadgeProps {
  model: string;
}

function AttributionModelBadge({ model }: AttributionModelBadgeProps) {
  const modelLabels: Record<string, string> = {
    'last-touch': 'Last Touch Attribution',
    'first-touch': 'First Touch Attribution',
    linear: 'Linear Attribution',
    'time-decay': 'Time Decay Attribution',
  };

  return (
    <Row
      padding="3"
      backgroundColor="2"
      style={{ borderRadius: '8px' }}
      justifyContent="space-between"
      alignItems="center"
      wrap
      gap="2"
    >
      <Row gap="2" alignItems="center">
        <Text size="lg">📊</Text>
        <Column gap="0">
          <Text weight="bold">Cross-Channel Attribution</Text>
          <Text size="xs" color="muted">
            Unified analytics across all marketing channels
          </Text>
        </Column>
      </Row>

      <Row
        padding="2"
        paddingX="3"
        style={{
          backgroundColor: 'var(--primary)',
          borderRadius: '6px',
        }}
        alignItems="center"
        gap="2"
      >
        <Text size="sm" style={{ color: 'white' }}>
          🎯 {modelLabels[model] || model}
        </Text>
      </Row>
    </Row>
  );
}

/**
 * User Identification Stats
 * Shows total users and cross-channel identification rate
 */
interface UserIdentificationStatsProps {
  totalUsers: number;
  identifiedUsers: number;
}

function UserIdentificationStats({ totalUsers, identifiedUsers }: UserIdentificationStatsProps) {
  const identificationRate = ((identifiedUsers / totalUsers) * 100).toFixed(1);

  return (
    <Panel title="User Identification">
      <Row gap="6" wrap justifyContent="center">
        {/* Total Users */}
        <StatCard
          icon="👥"
          label="Total Users"
          value={totalUsers.toLocaleString()}
          description="Across all channels"
        />

        {/* Identified Users */}
        <StatCard
          icon="🔗"
          label="Identified Across Channels"
          value={identifiedUsers.toLocaleString()}
          description={`${identificationRate}% identification rate`}
          highlight
        />

        {/* Anonymous Users */}
        <StatCard
          icon="👤"
          label="Single Channel Only"
          value={(totalUsers - identifiedUsers).toLocaleString()}
          description="Not yet correlated"
        />
      </Row>

      {/* Identification Progress Bar */}
      <Column paddingTop="4" gap="2">
        <Row justifyContent="space-between">
          <Text size="sm" color="muted">
            Cross-Channel Identification Progress
          </Text>
          <Text size="sm" weight="bold">
            {identificationRate}%
          </Text>
        </Row>
        <div
          style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'var(--bg-muted)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${identificationRate}%`,
              height: '100%',
              backgroundColor: '#22c55e',
              borderRadius: '4px',
              transition: 'width 0.5s ease-out',
            }}
          />
        </div>
      </Column>
    </Panel>
  );
}

/**
 * Stat Card Component
 * Displays a single statistic with icon and description
 */
interface StatCardProps {
  icon: string;
  label: string;
  value: string;
  description: string;
  highlight?: boolean;
}

function StatCard({ icon, label, value, description, highlight = false }: StatCardProps) {
  return (
    <Column
      padding="4"
      backgroundColor={highlight ? '2' : '1'}
      style={{
        borderRadius: '12px',
        minWidth: '180px',
        flex: '1 1 180px',
        maxWidth: '250px',
        border: highlight ? '2px solid var(--primary)' : '1px solid var(--border-color)',
      }}
      alignItems="center"
      gap="2"
    >
      <Text size="2xl">{icon}</Text>
      <Text size="2xl" weight="bold">
        {value}
      </Text>
      <Text size="sm" weight="medium">
        {label}
      </Text>
      <Text size="xs" color="muted" style={{ textAlign: 'center' }}>
        {description}
      </Text>
    </Column>
  );
}

/**
 * Conversions by Channel Component
 * Visual breakdown of conversions per channel
 */
interface ConversionsByChannelProps {
  conversions: {
    website: number;
    email: number;
    whatsapp: number;
  };
}

function ConversionsByChannel({ conversions }: ConversionsByChannelProps) {
  const total = conversions.website + conversions.email + conversions.whatsapp;

  const channels = [
    { key: 'website', label: 'Website', icon: '🌐', value: conversions.website },
    { key: 'email', label: 'Email', icon: '📧', value: conversions.email },
    { key: 'whatsapp', label: 'WhatsApp', icon: '💬', value: conversions.whatsapp },
  ] as const;

  return (
    <Panel title="Conversions by Channel">
      <Row gap="4" wrap justifyContent="center">
        {channels.map(({ key, label, icon, value }) => {
          const percentage = ((value / total) * 100).toFixed(1);
          const color = CHANNEL_COLORS[key];

          return (
            <Column
              key={key}
              padding="4"
              style={{
                borderRadius: '12px',
                minWidth: '160px',
                flex: '1 1 160px',
                maxWidth: '220px',
                border: `2px solid ${color}`,
                backgroundColor: `${color}08`,
              }}
              alignItems="center"
              gap="3"
            >
              <Row gap="2" alignItems="center">
                <Text size="lg">{icon}</Text>
                <Text weight="bold" style={{ color }}>
                  {label}
                </Text>
              </Row>

              <Text size="3xl" weight="bold">
                {value}
              </Text>

              <Text size="sm" color="muted">
                {percentage}% of total
              </Text>

              {/* Mini progress bar */}
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: 'var(--bg-muted)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${percentage}%`,
                    height: '100%',
                    backgroundColor: color,
                    borderRadius: '3px',
                  }}
                />
              </div>
            </Column>
          );
        })}
      </Row>

      {/* Total Conversions */}
      <Row
        justifyContent="center"
        paddingTop="4"
        style={{ borderTop: '1px solid var(--border-color)' }}
      >
        <Text color="muted">
          Total Conversions:{' '}
          <Text as="span" weight="bold">
            {total}
          </Text>
        </Text>
      </Row>
    </Panel>
  );
}

/**
 * Top Journeys Component
 * Displays top user journeys with revenue
 */
interface TopJourneysProps {
  journeys: ReadonlyArray<{
    path: string;
    count: number;
    revenue: number;
  }>;
}

function TopJourneys({ journeys }: TopJourneysProps) {
  const totalRevenue = journeys.reduce((sum, j) => sum + j.revenue, 0);

  return (
    <Panel title="Top User Journeys">
      <Column gap="3">
        {journeys.map((journey, index) => {
          const revenuePercentage = ((journey.revenue / totalRevenue) * 100).toFixed(1);

          return (
            <Row
              key={index}
              padding="3"
              backgroundColor={index === 0 ? '2' : '1'}
              style={{
                borderRadius: '8px',
                border: index === 0 ? '2px solid var(--primary)' : '1px solid var(--border-color)',
              }}
              justifyContent="space-between"
              alignItems="center"
              wrap
              gap="3"
            >
              {/* Rank Badge */}
              <Row gap="3" alignItems="center">
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: index === 0 ? '#f59e0b' : 'var(--bg-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    size="sm"
                    weight="bold"
                    style={{ color: index === 0 ? 'white' : 'inherit' }}
                  >
                    {index + 1}
                  </Text>
                </div>

                {/* Journey Path */}
                <Column gap="0">
                  <Text weight="medium">{journey.path}</Text>
                  <Text size="xs" color="muted">
                    {journey.count} users completed this journey
                  </Text>
                </Column>
              </Row>

              {/* Revenue */}
              <Column alignItems="flex-end" gap="0">
                <Text size="lg" weight="bold" style={{ color: '#22c55e' }}>
                  ${journey.revenue.toLocaleString()}
                </Text>
                <Text size="xs" color="muted">
                  {revenuePercentage}% of total revenue
                </Text>
              </Column>
            </Row>
          );
        })}
      </Column>

      {/* Total Revenue Summary */}
      <Row
        padding="4"
        style={{
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderRadius: '8px',
          marginTop: '16px',
        }}
        justifyContent="space-between"
        alignItems="center"
      >
        <Row gap="2" alignItems="center">
          <Text size="lg">💰</Text>
          <Text weight="bold">Total Attributed Revenue</Text>
        </Row>
        <Text size="xl" weight="bold" style={{ color: '#22c55e' }}>
          ${totalRevenue.toLocaleString()}
        </Text>
      </Row>
    </Panel>
  );
}

/**
 * Demo User Identity Card
 * Shows the unified user identity across channels
 * Can be used in the cross-channel tab header
 */
export function DemoUserIdentityCard() {
  const { user, correlationId } = DEMO_ACCOUNT;

  return (
    <Panel>
      <Row gap="4" alignItems="center" wrap>
        {/* User Avatar */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text size="2xl" style={{ color: 'white' }}>
            {user.firstName.charAt(0)}
            {user.lastName.charAt(0)}
          </Text>
        </div>

        {/* User Info */}
        <Column gap="1" style={{ flex: 1 }}>
          <Text size="lg" weight="bold">
            {user.name}
          </Text>
          <Row gap="4" wrap>
            <Row gap="1" alignItems="center">
              <Text size="sm">📧</Text>
              <Text size="sm" color="muted">
                {user.email}
              </Text>
            </Row>
            <Row gap="1" alignItems="center">
              <Text size="sm">📱</Text>
              <Text size="sm" color="muted">
                {user.phone}
              </Text>
            </Row>
          </Row>
          <Text size="xs" color="muted">
            Correlation ID: {correlationId}
          </Text>
        </Column>

        {/* Status Badge */}
        <Column
          padding="3"
          backgroundColor="2"
          style={{ borderRadius: '8px' }}
          alignItems="center"
          gap="1"
        >
          <Text size="sm" style={{ color: '#22c55e' }}>
            ✓ Linked
          </Text>
          <Text size="xs" color="muted">
            3 Channels
          </Text>
        </Column>
      </Row>
    </Panel>
  );
}
