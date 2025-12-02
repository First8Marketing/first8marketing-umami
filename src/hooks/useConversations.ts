/**
 * WhatsApp Conversations Hook
 * Manages conversation data with filtering, pagination, and real-time updates
 */

import { useState, useEffect, useCallback } from 'react';
import { whatsappApi } from '@/lib/whatsapp-api';
import type {
  WhatsAppConversation,
  WhatsAppMessage,
  ConversationFilters,
  Pagination,
} from '@/types/whatsapp';

interface UseConversationsReturn {
  conversations: WhatsAppConversation[];
  loading: boolean;
  error: string | null;
  pagination: Pagination | null;
  filters: ConversationFilters;
  setFilters: (filters: ConversationFilters) => void;
  refreshConversations: () => Promise<void>;
  updateConversation: (
    conversationId: string,
    updates: Partial<WhatsAppConversation>,
  ) => Promise<boolean>;
  closeConversation: (conversationId: string) => Promise<boolean>;
  archiveConversation: (conversationId: string) => Promise<boolean>;
  loadMore: () => Promise<void>;
}

/**
 * Custom hook for managing WhatsApp conversations
 */
export function useConversations(
  teamId: string,
  initialFilters?: ConversationFilters,
): UseConversationsReturn {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filters, setFilters] = useState<ConversationFilters>(initialFilters || {});
  const [currentPage, setCurrentPage] = useState(1);

  /**
   * Fetch conversations with current filters
   */
  const fetchConversations = useCallback(
    async (page: number = 1, append: boolean = false) => {
      if (!teamId) return;

      setLoading(true);
      setError(null);

      const response = await whatsappApi.conversation.getConversations(teamId, page, 20, filters);

      if (response.success && response.data) {
        if (append) {
          setConversations(prev => [...prev, ...response.data!]);
        } else {
          setConversations(response.data);
        }
        setPagination(response.pagination || null);
        setCurrentPage(page);
      } else {
        setError(response.error || 'Failed to fetch conversations');
      }

      setLoading(false);
    },
    [teamId, filters],
  );

  /**
   * Refresh conversations
   */
  const refreshConversations = useCallback(async () => {
    await fetchConversations(1, false);
  }, [fetchConversations]);

  /**
   * Load more conversations (pagination)
   */
  const loadMore = useCallback(async () => {
    if (pagination && currentPage < pagination.totalPages) {
      await fetchConversations(currentPage + 1, true);
    }
  }, [fetchConversations, currentPage, pagination]);

  /**
   * Update conversation details
   */
  const updateConversation = useCallback(
    async (conversationId: string, updates: Partial<WhatsAppConversation>): Promise<boolean> => {
      setError(null);

      const response = await whatsappApi.conversation.updateConversation(conversationId, updates);

      if (response.success && response.data) {
        setConversations(prev =>
          prev.map(conv => (conv.conversationId === conversationId ? response.data! : conv)),
        );
        return true;
      } else {
        setError(response.error || 'Failed to update conversation');
        return false;
      }
    },
    [],
  );

  /**
   * Close a conversation
   */
  const closeConversation = useCallback(async (conversationId: string): Promise<boolean> => {
    setError(null);

    const response = await whatsappApi.conversation.closeConversation(conversationId);

    if (response.success) {
      setConversations(prev =>
        prev.map(conv =>
          conv.conversationId === conversationId ? { ...conv, status: 'closed' } : conv,
        ),
      );
      return true;
    } else {
      setError(response.error || 'Failed to close conversation');
      return false;
    }
  }, []);

  /**
   * Archive a conversation
   */
  const archiveConversation = useCallback(async (conversationId: string): Promise<boolean> => {
    setError(null);

    const response = await whatsappApi.conversation.archiveConversation(conversationId);

    if (response.success) {
      setConversations(prev => prev.filter(conv => conv.conversationId !== conversationId));
      return true;
    } else {
      setError(response.error || 'Failed to archive conversation');
      return false;
    }
  }, []);

  // Fetch conversations when filters change
  useEffect(() => {
    fetchConversations(1, false);
  }, [fetchConversations]);

  return {
    conversations,
    loading,
    error,
    pagination,
    filters,
    setFilters,
    refreshConversations,
    updateConversation,
    closeConversation,
    archiveConversation,
    loadMore,
  };
}

/**
 * Hook for fetching a single conversation with messages
 */
export function useConversation(conversationId: string) {
  const [conversation, setConversation] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversation = useCallback(async () => {
    if (!conversationId) return;

    setLoading(true);
    setError(null);

    const response = await whatsappApi.conversation.getConversation(conversationId);

    if (response.success && response.data) {
      setConversation(response.data);
      setMessages(response.data.messages || []);
    } else {
      setError(response.error || 'Failed to fetch conversation');
    }

    setLoading(false);
  }, [conversationId]);

  const refreshConversation = useCallback(async () => {
    await fetchConversation();
  }, [fetchConversation]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  return {
    conversation,
    messages,
    loading,
    error,
    refreshConversation,
  };
}
