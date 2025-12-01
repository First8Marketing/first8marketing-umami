'use client';

import { Column, Row, Text } from '@umami/react-zen';
import { getDemoJourneyTimeline, DEMO_ACCOUNT, DEMO_JOURNEY } from '@/lib/demo-data';
import { Panel } from '@/components/common/Panel';
import { useMemo } from 'react';

/**
 * Channel color configuration
 * Consistent colors used across the timeline for channel identification
 */
const CHANNEL_COLORS = {
  website: '#3b82f6', // Blue
  email: '#22c55e', // Green
  whatsapp: '#8b5cf6', // Purple
} as const;

const CHANNEL_ICONS = {
  website: '🌐',
  email: '📧',
  whatsapp: '💬',
} as const;

const CHANNEL_LABELS = {
  website: 'Website',
  email: 'Email',
  whatsapp: 'WhatsApp',
} as const;

/**
 * Timeline Event Item Props
 */
interface TimelineEventProps {
  channel: 'website' | 'email' | 'whatsapp';
  event: string;
  detail?: string;
  timestamp: string;
  isConversion?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

/**
 * Formats a timestamp into a human-readable date/time string
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats event name into human-readable label
 */
function formatEventName(event: string): string {
  return event
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Timeline Event Component
 * Renders a single event in the timeline with channel color coding
 */
function TimelineEvent({
  channel,
  event,
  detail,
  timestamp,
  isConversion = false,
  isFirst = false,
  isLast = false,
}: TimelineEventProps) {
  const color = CHANNEL_COLORS[channel];
  const icon = CHANNEL_ICONS[channel];
  const channelLabel = CHANNEL_LABELS[channel];

  return (
    <Row gap="3" alignItems="stretch">
      {/* Timeline Line */}
      <Column alignItems="center" style={{ width: '32px', position: 'relative' }}>
        {/* Connector line above */}
        {!isFirst && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              width: '2px',
              height: '12px',
              backgroundColor: 'var(--border-color)',
            }}
          />
        )}

        {/* Event dot */}
        <div
          style={{
            width: isConversion ? '20px' : '14px',
            height: isConversion ? '20px' : '14px',
            borderRadius: '50%',
            backgroundColor: isConversion ? '#f59e0b' : color,
            border: `3px solid ${isConversion ? '#fef3c7' : `${color}33`}`,
            marginTop: '12px',
            zIndex: 1,
          }}
        />

        {/* Connector line below */}
        {!isLast && (
          <div
            style={{
              width: '2px',
              flex: 1,
              backgroundColor: 'var(--border-color)',
            }}
          />
        )}
      </Column>

      {/* Event Content */}
      <Column
        padding="3"
        paddingBottom="4"
        style={{
          flex: 1,
          borderLeft: isConversion ? `3px solid #f59e0b` : `3px solid ${color}`,
          borderRadius: '0 8px 8px 0',
          backgroundColor: isConversion ? 'rgba(245, 158, 11, 0.1)' : `${color}08`,
          marginBottom: '8px',
        }}
        gap="1"
      >
        {/* Event Header */}
        <Row justifyContent="space-between" alignItems="center">
          <Row gap="2" alignItems="center">
            <Text size="sm">{icon}</Text>
            <Text size="sm" weight="bold" style={{ color }}>
              {channelLabel}
            </Text>
            {isConversion && (
              <span
                style={{
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                }}
              >
                CONVERSION
              </span>
            )}
          </Row>
          <Text size="xs" color="muted">
            {formatTimestamp(timestamp)}
          </Text>
        </Row>

        {/* Event Details */}
        <Text weight="medium">{formatEventName(event)}</Text>
        {detail && (
          <Text size="sm" color="muted" style={{ wordBreak: 'break-word' }}>
            {detail}
          </Text>
        )}
      </Column>
    </Row>
  );
}

/**
 * Demo Journey Timeline Component
 *
 * Displays the user journey across channels in a timeline format:
 * - Events shown chronologically
 * - Color-coded by channel (Website: blue, Email: green, WhatsApp: purple)
 * - Conversion event highlighted with special styling
 *
 * Uses data from getDemoJourneyTimeline() for demonstration purposes.
 */
export function DemoJourneyTimeline() {
  // Get chronologically sorted journey events
  const timelineEvents = useMemo(() => getDemoJourneyTimeline(), []);

  return (
    <Panel title="Customer Journey Timeline">
      {/* User Identity Header */}
      <UserIdentityBadge />

      {/* Timeline Legend */}
      <Row gap="4" paddingY="3" wrap>
        {Object.entries(CHANNEL_COLORS).map(([channel, color]) => (
          <Row key={channel} gap="2" alignItems="center">
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: color,
              }}
            />
            <Text size="sm">{CHANNEL_LABELS[channel as keyof typeof CHANNEL_LABELS]}</Text>
          </Row>
        ))}
        <Row gap="2" alignItems="center">
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#f59e0b',
            }}
          />
          <Text size="sm">Conversion</Text>
        </Row>
      </Row>

      {/* Timeline Events */}
      <Column style={{ marginTop: '16px' }}>
        {timelineEvents.map((event, index) => {
          const isConversion = event.event === 'purchase';
          return (
            <TimelineEvent
              key={`${event.timestamp}-${index}`}
              channel={event.channel}
              event={event.event}
              detail={event.detail}
              timestamp={event.timestamp}
              isConversion={isConversion}
              isFirst={index === 0}
              isLast={index === timelineEvents.length - 1}
            />
          );
        })}
      </Column>

      {/* Journey Summary */}
      <JourneySummary />
    </Panel>
  );
}

/**
 * User Identity Badge Component
 * Shows the correlated user identity across channels
 */
function UserIdentityBadge() {
  const { user } = DEMO_ACCOUNT;

  return (
    <Row
      padding="3"
      backgroundColor="2"
      style={{ borderRadius: '8px' }}
      gap="4"
      alignItems="center"
      wrap
    >
      <Row gap="2" alignItems="center">
        <Text size="lg">👤</Text>
        <Column gap="0">
          <Text weight="bold">{user.name}</Text>
          <Text size="xs" color="muted">
            Unified Customer Profile
          </Text>
        </Column>
      </Row>

      <div style={{ width: '1px', height: '32px', backgroundColor: 'var(--border-color)' }} />

      <Row gap="3" wrap>
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
    </Row>
  );
}

/**
 * Journey Summary Component
 * Shows a summary of the customer journey outcome
 */
function JourneySummary() {
  const { conversion } = DEMO_JOURNEY;

  return (
    <Row
      padding="4"
      style={{
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderRadius: '8px',
        borderLeft: '4px solid #22c55e',
        marginTop: '16px',
      }}
      justifyContent="space-between"
      alignItems="center"
      wrap
      gap="3"
    >
      <Column gap="1">
        <Text weight="bold" style={{ color: '#22c55e' }}>
          ✓ Journey Completed
        </Text>
        <Text size="sm" color="muted">
          Customer converted via {conversion.channel} channel
        </Text>
      </Column>

      <Column alignItems="flex-end" gap="0">
        <Text size="xl" weight="bold">
          ${conversion.amount.toFixed(2)}
        </Text>
        <Text size="xs" color="muted">
          {conversion.product}
        </Text>
      </Column>
    </Row>
  );
}
