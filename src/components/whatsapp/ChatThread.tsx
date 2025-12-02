'use client';

/**
 * Chat Thread Component
 * Displays message thread with bubbles, media, and timestamps
 */

import { useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ContactInfo } from './ContactInfo';
import type { WhatsAppConversation, WhatsAppMessage } from '@/types/whatsapp';

interface ChatThreadProps {
  conversation: WhatsAppConversation;
  messages: WhatsAppMessage[];
  onSendMessage: (message: string, file?: File) => Promise<void>;
  sendingMessage?: boolean;
}

export function ChatThread({
  conversation,
  messages,
  onSendMessage,
  sendingMessage = false,
}: ChatThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {/* Message Thread */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-2">💬</div>
                <p>No messages yet</p>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <MessageBubble
                    key={message.messageId}
                    message={message}
                    showTimestamp={
                      index === 0 ||
                      new Date(message.timestamp).getTime() -
                        new Date(messages[index - 1].timestamp).getTime() >
                        300000
                    }
                  />
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Message Input */}
          <MessageInput
            onSendMessage={onSendMessage}
            disabled={conversation.status === 'closed' || sendingMessage}
            placeholder="Type a message..."
          />
        </div>

        {/* Sidebar - Contact Info */}
        <div className="w-80 bg-white border-l p-6 overflow-y-auto">
          <ContactInfo conversation={conversation} />
        </div>
      </div>
    </div>
  );
}
