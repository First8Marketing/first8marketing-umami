'use client';

/**
 * WhatsApp Conversations List Page
 * Browse, filter, and manage all conversations
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/store/app';
import { useConversations } from '@/hooks/useConversations';
import { ConversationList } from '@/components/whatsapp/ConversationList';
import type {
  ConversationFilters as ConversationFiltersType,
  ConversationStatus,
  ConversationStage,
} from '@/types/whatsapp';

export default function ConversationsPage() {
  const router = useRouter();
  const { user } = useApp();
  const teamId = user?.teamId || '';

  const [filters, setFilters] = useState<ConversationFiltersType>({});

  const {
    conversations,
    loading,
    error,
    pagination,
    refreshConversations,
    updateConversation,
    closeConversation,
    archiveConversation,
    loadMore,
  } = useConversations(teamId, filters);

  const handleFilterChange = (newFilters: ConversationFiltersType) => {
    setFilters(newFilters);
  };

  const handleConversationClick = (conversationId: string) => {
    router.push(`/whatsapp/conversations/${conversationId}`);
  };

  if (loading && conversations.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Conversations</h1>
          <p className="text-gray-600 mt-1">
            {pagination
              ? `${pagination.total} total conversations`
              : 'Manage WhatsApp conversations'}
          </p>
        </div>

        <button
          onClick={refreshConversations}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          disabled={loading}
        >
          <span>🔄</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters Bar */}
      <ConversationFilters filters={filters} onChange={handleFilterChange} />

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Conversation List */}
      <ConversationList
        conversations={conversations}
        onConversationClick={handleConversationClick}
        onUpdateConversation={updateConversation}
        onCloseConversation={closeConversation}
        onArchiveConversation={archiveConversation}
        loading={loading}
      />

      {/* Load More Button */}
      {pagination && pagination.page < pagination.totalPages && (
        <div className="text-center">
          <button
            onClick={loadMore}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && conversations.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">💬</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No Conversations Yet</h2>
          <p className="text-gray-500">Conversations will appear here when you receive messages</p>
        </div>
      )}
    </div>
  );
}

/**
 * Conversation Filters Component
 */
function ConversationFilters({ filters, onChange }: any) {
  const [searchQuery, setSearchQuery] = useState(filters.searchQuery || '');
  const [selectedStatus, setSelectedStatus] = useState<ConversationStatus[]>(filters.status || []);
  const [selectedStage, setSelectedStage] = useState<ConversationStage[]>(filters.stage || []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    // Debounce search
    const timer = setTimeout(() => {
      onChange({ ...filters, searchQuery: query });
    }, 300);

    return () => clearTimeout(timer);
  };

  const handleStatusToggle = (status: ConversationStatus) => {
    const newStatus = selectedStatus.includes(status)
      ? selectedStatus.filter(s => s !== status)
      : [...selectedStatus, status];

    setSelectedStatus(newStatus);
    onChange({ ...filters, status: newStatus });
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      {/* Search Bar */}
      <div className="flex gap-4">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Search conversations by contact name or phone..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Sort by: Latest</option>
          <option value="oldest">Oldest First</option>
          <option value="unread">Unread First</option>
        </select>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm font-medium text-gray-700 py-2">Status:</span>
        {['open', 'closed', 'archived'].map(status => (
          <button
            key={status}
            onClick={() => handleStatusToggle(status as ConversationStatus)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              selectedStatus.includes(status as ConversationStatus)
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Stage Filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm font-medium text-gray-700 py-2">Stage:</span>
        {[
          'initial_contact',
          'qualification',
          'proposal',
          'negotiation',
          'closed_won',
          'closed_lost',
        ].map(stage => (
          <button
            key={stage}
            onClick={() => {
              const newStage = selectedStage.includes(stage as ConversationStage)
                ? selectedStage.filter(s => s !== stage)
                : [...selectedStage, stage as ConversationStage];
              setSelectedStage(newStage);
              onChange({ ...filters, stage: newStage });
            }}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              selectedStage.includes(stage as ConversationStage)
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>
    </div>
  );
}
