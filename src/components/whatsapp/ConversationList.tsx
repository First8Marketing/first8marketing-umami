'use client';

/**
 * Conversation List Component
 * Displays filterable list of WhatsApp conversations with actions
 */

import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { WhatsAppConversation } from '@/types/whatsapp';

interface ConversationListProps {
  conversations: WhatsAppConversation[];
  onConversationClick: (conversationId: string) => void;
  onUpdateConversation: (
    conversationId: string,
    updates: Partial<WhatsAppConversation>,
  ) => Promise<boolean>;
  onCloseConversation: (conversationId: string) => Promise<boolean>;
  onArchiveConversation: (conversationId: string) => Promise<boolean>;
  loading?: boolean;
}

export function ConversationList({
  conversations,
  onConversationClick,
  onUpdateConversation,
  onCloseConversation,
  onArchiveConversation,
  loading = false,
}: ConversationListProps) {
  // Sort conversations by last message time
  const sortedConversations = useMemo(() => {
    return [...conversations].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    );
  }, [conversations]);

  if (loading && conversations.length === 0) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="divide-y divide-gray-200">
        {sortedConversations.map(conversation => (
          <ConversationCard
            key={conversation.conversationId}
            conversation={conversation}
            onClick={() => onConversationClick(conversation.conversationId)}
            onUpdateStage={stage => onUpdateConversation(conversation.conversationId, { stage })}
            onClose={() => onCloseConversation(conversation.conversationId)}
            onArchive={() => onArchiveConversation(conversation.conversationId)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Individual Conversation Card
 */
function ConversationCard({ conversation, onClick, _onUpdateStage, onClose, onArchive }: any) {
  const statusColors = {
    open: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
    archived: 'bg-blue-100 text-blue-800',
  };

  const stageColors = {
    initial_contact: 'bg-blue-500',
    qualification: 'bg-purple-500',
    proposal: 'bg-yellow-500',
    negotiation: 'bg-orange-500',
    closed_won: 'bg-green-500',
    closed_lost: 'bg-red-500',
  };

  return (
    <div className="p-4 hover:bg-gray-50 cursor-pointer transition-colors" onClick={onClick}>
      <div className="flex items-start justify-between">
        {/* Contact Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                {(conversation.contactName || conversation.contactPhone).charAt(0).toUpperCase()}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {conversation.contactName || 'Unknown Contact'}
              </h3>
              <p className="text-sm text-gray-600 truncate">{conversation.contactPhone}</p>
            </div>
          </div>

          {/* Metadata Row */}
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
            <span className={`px-2 py-1 rounded-full ${statusColors[conversation.status]}`}>
              {conversation.status}
            </span>

            {conversation.stage && (
              <div className="flex items-center gap-1">
                <div className={`h-2 w-2 rounded-full ${stageColors[conversation.stage]}`} />
                <span>{conversation.stage.replace(/_/g, ' ')}</span>
              </div>
            )}

            <span>{conversation.messageCount} messages</span>

            <span>
              Last: {formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 ml-4" onClick={e => e.stopPropagation()}>
          {conversation.status === 'open' && (
            <button
              onClick={e => {
                e.stopPropagation();
                onClose();
              }}
              className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
              title="Close conversation"
            >
              Close
            </button>
          )}

          <button
            onClick={e => {
              e.stopPropagation();
              onArchive();
            }}
            className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
            title="Archive conversation"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Loading Skeleton
 */
function LoadingSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="divide-y divide-gray-200">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="p-4 animate-pulse">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
                <div className="h-3 bg-gray-200 rounded w-2/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
