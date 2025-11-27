'use client';

/**
 * Message Bubble Component
 * Displays individual WhatsApp messages with media support, timestamps, and read receipts
 */

import { memo } from 'react';
import { format } from 'date-fns';
import type { WhatsAppMessage } from '@/types/whatsapp';

interface MessageBubbleProps {
  message: WhatsAppMessage;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  onMediaClick?: (url: string) => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  showAvatar = false,
  showTimestamp = false,
  onMediaClick,
}: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';

  return (
    <div className={`flex gap-2 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar (for inbound messages) */}
      {!isOutbound && showAvatar && (
        <div className="flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium">
            {message.fromPhone.charAt(0)}
          </div>
        </div>
      )}

      {/* Message Content */}
      <div className={`max-w-md ${isOutbound ? 'items-end' : 'items-start'}`}>
        {/* Sender Name (for group chats) */}
        {!isOutbound && showAvatar && (
          <div className="text-xs text-gray-600 mb-1 px-1">{message.fromPhone}</div>
        )}

        {/* Message Bubble */}
        <div
          className={`px-4 py-2 rounded-lg ${
            isOutbound
              ? 'bg-blue-500 text-white rounded-br-none'
              : 'bg-white text-gray-900 shadow rounded-bl-none'
          }`}
        >
          {/* Text Message */}
          {message.messageType === 'text' && message.messageBody && (
            <p className="whitespace-pre-wrap break-words text-sm">{message.messageBody}</p>
          )}

          {/* Image Message */}
          {message.messageType === 'image' && (
            <div>
              {message.mediaUrl && (
                <img
                  src={message.mediaUrl}
                  alt="Message attachment"
                  className="rounded-lg max-w-full mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => onMediaClick?.(message.mediaUrl!)}
                  loading="lazy"
                />
              )}
              {message.messageBody && (
                <p className="whitespace-pre-wrap break-words text-sm mt-2">
                  {message.messageBody}
                </p>
              )}
            </div>
          )}

          {/* Video Message */}
          {message.messageType === 'video' && (
            <div>
              {message.mediaUrl && (
                <video controls className="rounded-lg max-w-full mb-2" preload="metadata">
                  <source src={message.mediaUrl} />
                  Your browser does not support video playback.
                </video>
              )}
              {message.messageBody && (
                <p className="whitespace-pre-wrap break-words text-sm mt-2">
                  {message.messageBody}
                </p>
              )}
            </div>
          )}

          {/* Audio/Voice Message */}
          {(message.messageType === 'audio' || message.messageType === 'voice') && (
            <div>
              {message.mediaUrl && (
                <audio controls className="max-w-full">
                  <source src={message.mediaUrl} />
                  Your browser does not support audio playback.
                </audio>
              )}
              {message.messageBody && (
                <p className="whitespace-pre-wrap break-words text-sm mt-2">
                  {message.messageBody}
                </p>
              )}
            </div>
          )}

          {/* Document Message */}
          {message.messageType === 'document' && (
            <div className="flex items-center gap-3">
              <span className="text-3xl">📄</span>
              <div className="flex-1">
                <p className="font-medium text-sm">Document</p>
                {message.messageBody && (
                  <p className="text-xs opacity-90 truncate max-w-xs">{message.messageBody}</p>
                )}
                {message.mediaUrl && (
                  <a
                    href={message.mediaUrl}
                    download
                    className="text-xs underline opacity-90 hover:opacity-100"
                  >
                    Download
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Location Message */}
          {message.messageType === 'location' && (
            <div className="flex items-center gap-3">
              <span className="text-3xl">📍</span>
              <div>
                <p className="font-medium text-sm">Location</p>
                {message.messageBody && <p className="text-xs opacity-90">{message.messageBody}</p>}
              </div>
            </div>
          )}

          {/* Contact Message */}
          {message.messageType === 'contact' && (
            <div className="flex items-center gap-3">
              <span className="text-3xl">👤</span>
              <div>
                <p className="font-medium text-sm">Contact</p>
                {message.messageBody && <p className="text-xs opacity-90">{message.messageBody}</p>}
              </div>
            </div>
          )}

          {/* Sticker Message */}
          {message.messageType === 'sticker' && (
            <div>
              {message.mediaUrl && (
                <img src={message.mediaUrl} alt="Sticker" className="w-32 h-32" loading="lazy" />
              )}
            </div>
          )}

          {/* Timestamp and Status */}
          <div
            className={`text-xs mt-1 flex items-center gap-1 justify-end ${
              isOutbound ? 'text-blue-100' : 'text-gray-500'
            }`}
          >
            <time dateTime={message.timestamp}>
              {format(new Date(message.timestamp), 'h:mm a')}
            </time>

            {/* Read Receipts (outbound only) */}
            {isOutbound && (
              <span className="ml-1">
                {message.isRead ? (
                  <span className="text-blue-200" title="Read">
                    ✓✓
                  </span>
                ) : (
                  <span title="Delivered">✓</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Full Timestamp (when shown) */}
        {showTimestamp && (
          <div className="text-xs text-gray-500 mt-1 px-1">
            {format(new Date(message.timestamp), 'MMM d, yyyy h:mm a')}
          </div>
        )}
      </div>
    </div>
  );
});
