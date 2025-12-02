'use client';

/**
 * WhatsApp Chat Thread Page
 * View and interact with individual conversation
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/store/app';
import { useConversation } from '@/hooks/useConversations';
import { ChatThread } from '@/components/whatsapp/ChatThread';
import { whatsappApi } from '@/lib/whatsapp-api';
import type { ConversationStage } from '@/types/whatsapp';

export default function ChatThreadPage() {
  const params = useParams();
  const router = useRouter();
  useApp(); // Hook called for side effects
  const conversationId = params.id as string;

  const { conversation, messages, loading, error, refreshConversation } =
    useConversation(conversationId);

  const [sendingMessage, setSendingMessage] = useState(false);

  // Send message handler
  const handleSendMessage = async (message: string, file?: File) => {
    if (!conversation || (!message.trim() && !file)) return;

    setSendingMessage(true);

    try {
      // TODO: Add file upload support when backend API supports it
      // For now, only send text messages
      if (message.trim()) {
        const response = await whatsappApi.message.sendMessage(
          conversation.sessionId,
          conversation.contactPhone,
          message.trim(),
        );

        if (response.success) {
          await refreshConversation();
        }
      }
    } catch (_err) {
      // eslint-disable-next-line no-console
      console.error('Failed to send message:', _err);
    } finally {
      setSendingMessage(false);
    }
  };

  // Update conversation stage
  const handleStageChange = async (stage: ConversationStage) => {
    if (!conversation) return;

    const response = await whatsappApi.conversation.updateConversation(conversationId, { stage });

    if (response.success) {
      await refreshConversation();
    }
  };

  // Close conversation
  const handleClose = async () => {
    const response = await whatsappApi.conversation.closeConversation(conversationId);

    if (response.success) {
      router.push('/whatsapp/conversations');
    }
  };

  // Archive conversation
  const handleArchive = async () => {
    const response = await whatsappApi.conversation.archiveConversation(conversationId);

    if (response.success) {
      router.push('/whatsapp/conversations');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️ Error</div>
          <p className="text-gray-600">{error || 'Conversation not found'}</p>
          <button
            onClick={() => router.push('/whatsapp/conversations')}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Back to Conversations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/whatsapp/conversations')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-xl font-bold">
              {conversation.contactName || conversation.contactPhone}
            </h1>
            <p className="text-sm text-gray-600">{conversation.contactPhone}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Stage Selector */}
          <select
            value={conversation.stage || ''}
            onChange={e => handleStageChange(e.target.value as ConversationStage)}
            className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Stage</option>
            <option value="initial_contact">Initial Contact</option>
            <option value="qualification">Qualification</option>
            <option value="proposal">Proposal</option>
            <option value="negotiation">Negotiation</option>
            <option value="closed_won">Closed Won</option>
            <option value="closed_lost">Closed Lost</option>
          </select>

          {/* Action Buttons */}
          <button
            onClick={handleClose}
            className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600"
            disabled={conversation.status === 'closed'}
          >
            Close
          </button>
          <button
            onClick={handleArchive}
            className="px-3 py-1 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600"
          >
            Archive
          </button>
        </div>
      </div>

      {/* Chat Thread Component (includes MessageInput) */}
      <div className="flex-1 overflow-hidden">
        <ChatThread
          conversation={conversation}
          messages={messages}
          onSendMessage={handleSendMessage}
          sendingMessage={sendingMessage}
        />
      </div>
    </div>
  );
}
