'use client';

/**
 * Message Input Component
 * Reusable message input with file upload, emoji support, and keyboard shortcuts
 */

import { useState, useRef, KeyboardEvent, ChangeEvent } from 'react';

interface MessageInputProps {
  onSendMessage: (message: string, file?: File) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  showFileUpload?: boolean;
  _showEmojiPicker?: boolean;
}

export function MessageInput({
  onSendMessage,
  disabled = false,
  placeholder = 'Type a message...',
  maxLength = 5000,
  showFileUpload = true,
  _showEmojiPicker = false,
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle message send
  const handleSend = async () => {
    if (!message.trim() && !selectedFile) return;
    if (disabled || sending) return;

    setSending(true);

    try {
      await onSendMessage(message.trim(), selectedFile || undefined);
      setMessage('');
      setSelectedFile(null);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  // Handle Enter key press (Shift+Enter for new line)
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newMessage = e.target.value;
    if (newMessage.length <= maxLength) {
      setMessage(newMessage);

      // Auto-resize
      const textarea = e.target;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  };

  // Handle file selection
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  // Remove selected file
  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white border-t p-4">
      {/* File Preview */}
      {selectedFile && (
        <div className="mb-3 flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
          <span className="text-2xl">📎</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selectedFile.name}</p>
            <p className="text-xs text-gray-600">{(selectedFile.size / 1024).toFixed(1)} KB</p>
          </div>
          <button
            onClick={handleRemoveFile}
            className="text-gray-500 hover:text-red-500 transition-colors"
            aria-label="Remove file"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input Row */}
      <div className="flex gap-2 items-end">
        {/* File Upload Button */}
        {showFileUpload && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || sending}
            className="p-2 text-gray-500 hover:text-blue-500 transition-colors disabled:opacity-50"
            aria-label="Attach file"
            title="Attach file"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx"
        />

        {/* Text Input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || sending}
            rows={1}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            style={{ minHeight: '42px', maxHeight: '150px' }}
          />

          {/* Character Counter */}
          {message.length > maxLength * 0.8 && (
            <div
              className={`absolute bottom-2 right-2 text-xs ${message.length === maxLength ? 'text-red-500' : 'text-gray-400'}`}
            >
              {message.length}/{maxLength}
            </div>
          )}
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={disabled || sending || (!message.trim() && !selectedFile)}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          aria-label="Send message"
        >
          {sending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
              <span>Send</span>
            </>
          )}
        </button>
      </div>

      {/* Keyboard Shortcut Hint */}
      <div className="mt-2 text-xs text-gray-400 text-right">
        Press Enter to send • Shift+Enter for new line
      </div>
    </div>
  );
}
