'use client';

import { Column, Row, Text } from '@umami/react-zen';
import { DEMO_ANALYTICS } from '@/lib/demo-data';
import { Panel } from '@/components/common/Panel';

/**
 * Channel Statistics Card Props
 * Defines the structure for displaying channel-specific metrics
 */
interface ChannelCardProps {
  title: string;
  icon: string;
  color: string;
  metrics: Array<{
    label: string;
    value: string | number;
    highlight?: boolean;
  }>;
}

/**
 * Reusable Channel Card Component
 * Displays metrics for a single channel with consistent styling
 */
function ChannelCard({ title, icon, color, metrics }: ChannelCardProps) {
  return (
    <Column
      padding="5"
      backgroundColor="1"
      style={{
        borderRadius: '12px',
        flex: '1 1 280px',
        minWidth: '280px',
        maxWidth: '380px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
        borderTop: `4px solid ${color}`,
      }}
      gap="4"
    >
      {/* Card Header */}
      <Row alignItems="center" gap="2">
        <Text size="xl">{icon}</Text>
        <Text size="lg" weight="bold">
          {title}
        </Text>
      </Row>

      {/* Metrics Grid */}
      <Column gap="3">
        {metrics.map((metric, index) => (
          <Row key={index} justifyContent="space-between" alignItems="center">
            <Text color="muted" size="sm">
              {metric.label}
            </Text>
            <Text
              weight={metric.highlight ? 'bold' : 'medium'}
              style={metric.highlight ? { color } : {}}
            >
              {metric.value}
            </Text>
          </Row>
        ))}
      </Column>
    </Column>
  );
}

/**
 * Demo Channel Overview Component
 *
 * Displays overview cards for all three marketing channels side by side:
 * - Website: Sessions, Pageviews, Bounce Rate
 * - Email: Sent, Open Rate, Click Rate
 * - WhatsApp: Conversations, Response Rate, Conversion Rate
 *
 * Uses data from DEMO_ANALYTICS for demonstration purposes.
 */
export function DemoChannelOverview() {
  const { website, email, whatsapp } = DEMO_ANALYTICS;

  // Define channel configurations with their respective colors and metrics
  const channels: ChannelCardProps[] = [
    {
      title: 'Website Analytics',
      icon: '🌐',
      color: '#3b82f6', // Blue
      metrics: [
        { label: 'Sessions', value: website.sessions.toLocaleString() },
        { label: 'Pageviews', value: website.pageviews.toLocaleString() },
        { label: 'Avg Duration', value: website.avgDuration },
        { label: 'Bounce Rate', value: website.bounceRate, highlight: true },
      ],
    },
    {
      title: 'Email Analytics',
      icon: '📧',
      color: '#22c55e', // Green
      metrics: [
        { label: 'Emails Sent', value: email.sent.toLocaleString() },
        { label: 'Delivered', value: email.delivered.toLocaleString() },
        { label: 'Open Rate', value: email.openRate, highlight: true },
        { label: 'Click Rate', value: email.clickRate, highlight: true },
      ],
    },
    {
      title: 'WhatsApp Analytics',
      icon: '💬',
      color: '#8b5cf6', // Purple
      metrics: [
        { label: 'Conversations', value: whatsapp.conversations.toLocaleString() },
        { label: 'Messages Sent', value: whatsapp.messages.sent.toLocaleString() },
        { label: 'Response Rate', value: whatsapp.responseRate, highlight: true },
        { label: 'Conversion Rate', value: whatsapp.conversionRate, highlight: true },
      ],
    },
  ];

  return (
    <Panel title="Channel Overview">
      <Row gap="4" wrap justifyContent="center" style={{ width: '100%' }}>
        {channels.map(channel => (
          <ChannelCard key={channel.title} {...channel} />
        ))}
      </Row>

      {/* Summary Row */}
      <Row
        justifyContent="center"
        paddingTop="4"
        style={{ borderTop: '1px solid var(--border-color)' }}
      >
        <Text color="muted" size="sm">
          Data shown is for demonstration purposes only
        </Text>
      </Row>
    </Panel>
  );
}

/**
 * Demo Channel Detail Component
 *
 * Shows detailed metrics for a specific channel.
 * Used in individual channel tabs.
 */
interface DemoChannelDetailProps {
  channel: 'website' | 'email' | 'whatsapp';
}

export function DemoChannelDetail({ channel }: DemoChannelDetailProps) {
  const { website, email, whatsapp } = DEMO_ANALYTICS;

  // Render channel-specific detailed view
  if (channel === 'website') {
    return (
      <Column gap="4">
        <Panel title="Website Performance">
          <Row gap="6" wrap>
            <MetricBox label="Sessions" value={website.sessions} />
            <MetricBox label="Pageviews" value={website.pageviews} />
            <MetricBox label="Avg Duration" value={website.avgDuration} />
            <MetricBox label="Bounce Rate" value={website.bounceRate} />
          </Row>
        </Panel>

        <Panel title="Top Pages">
          <Column gap="2">
            {website.topPages.map((page, index) => (
              <Row key={index} justifyContent="space-between" padding="2">
                <Text>{page.page}</Text>
                <Text weight="bold">{page.views.toLocaleString()} views</Text>
              </Row>
            ))}
          </Column>
        </Panel>
      </Column>
    );
  }

  if (channel === 'email') {
    return (
      <Column gap="4">
        <Panel title="Email Performance">
          <Row gap="6" wrap>
            <MetricBox label="Sent" value={email.sent} />
            <MetricBox label="Delivered" value={email.delivered} />
            <MetricBox label="Opened" value={email.opened} />
            <MetricBox label="Clicked" value={email.clicked} />
          </Row>
        </Panel>

        <Panel title="Campaign Performance">
          <Column gap="2">
            {email.campaigns.map((campaign, index) => (
              <Row key={index} justifyContent="space-between" padding="2">
                <Text>{campaign.name}</Text>
                <Row gap="4">
                  <Text color="muted">{campaign.sent} sent</Text>
                  <Text weight="bold">{campaign.opened} opened</Text>
                </Row>
              </Row>
            ))}
          </Column>
        </Panel>
      </Column>
    );
  }

  if (channel === 'whatsapp') {
    return (
      <Column gap="4">
        <Panel title="WhatsApp Performance">
          <Row gap="6" wrap>
            <MetricBox label="Conversations" value={whatsapp.conversations} />
            <MetricBox label="Messages Sent" value={whatsapp.messages.sent} />
            <MetricBox label="Response Rate" value={whatsapp.responseRate} />
            <MetricBox label="Avg Response" value={whatsapp.avgResponseTime} />
          </Row>
        </Panel>

        <Panel title="Top Intents">
          <Column gap="2">
            {whatsapp.topIntents.map((intent, index) => (
              <Row key={index} justifyContent="space-between" padding="2">
                <Text>{intent.intent}</Text>
                <Text weight="bold">{intent.count} conversations</Text>
              </Row>
            ))}
          </Column>
        </Panel>
      </Column>
    );
  }

  return null;
}

/**
 * Metric Box Component
 * Displays a single metric with label and value
 */
function MetricBox({ label, value }: { label: string; value: string | number }) {
  return (
    <Column
      padding="4"
      backgroundColor="2"
      style={{ borderRadius: '8px', minWidth: '120px' }}
      alignItems="center"
      gap="1"
    >
      <Text color="muted" size="sm">
        {label}
      </Text>
      <Text size="xl" weight="bold">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Text>
    </Column>
  );
}
