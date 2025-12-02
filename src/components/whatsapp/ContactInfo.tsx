'use client';

/**
 * Contact Info Sidebar Component
 * Displays detailed contact information for a conversation
 */

import { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { WhatsAppConversation, WhatsAppContact } from '@/types/whatsapp';

interface ContactInfoProps {
  conversation: WhatsAppConversation;
  contact?: WhatsAppContact;
  onUpdateStage?: (stage: string) => void;
  _onAddNote?: (note: string) => void;
  className?: string;
}

export const ContactInfo = memo(function ContactInfo({
  conversation,
  contact,
  onUpdateStage,
  _onAddNote,
  className = '',
}: ContactInfoProps) {
  const stageColors = {
    initial_contact: 'bg-blue-100 text-blue-800',
    qualification: 'bg-purple-100 text-purple-800',
    proposal: 'bg-yellow-100 text-yellow-800',
    negotiation: 'bg-orange-100 text-orange-800',
    closed_won: 'bg-green-100 text-green-800',
    closed_lost: 'bg-red-100 text-red-800',
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Contact Header */}
      <div className="text-center pb-6 border-b">
        {/* Avatar */}
        {contact?.profilePicUrl ? (
          <img
            src={contact.profilePicUrl}
            alt={conversation.contactName || 'Contact'}
            className="h-20 w-20 rounded-full mx-auto mb-3 object-cover"
          />
        ) : (
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-3xl mx-auto mb-3">
            {(conversation.contactName || conversation.contactPhone).charAt(0).toUpperCase()}
          </div>
        )}

        {/* Contact Name */}
        <h3 className="font-semibold text-lg text-gray-900">
          {conversation.contactName || 'Unknown Contact'}
        </h3>

        {/* Phone Number */}
        <p className="text-sm text-gray-600 mt-1">{conversation.contactPhone}</p>

        {/* Business Badge */}
        {contact?.isBusiness && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
              <span>🏢</span>
              <span>Business Account</span>
            </span>
          </div>
        )}
      </div>

      {/* Conversation Status */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">
          Conversation Status
        </h4>

        <div className="space-y-2 text-sm">
          {/* Status */}
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Status:</span>
            <span
              className={`px-3 py-1 rounded-full font-medium capitalize ${
                conversation.status === 'open'
                  ? 'bg-green-100 text-green-800'
                  : conversation.status === 'closed'
                    ? 'bg-gray-100 text-gray-800'
                    : 'bg-blue-100 text-blue-800'
              }`}
            >
              {conversation.status}
            </span>
          </div>

          {/* Stage */}
          {conversation.stage && (
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Stage:</span>
              {onUpdateStage ? (
                <select
                  value={conversation.stage}
                  onChange={e => onUpdateStage(e.target.value)}
                  className={`px-3 py-1 rounded-full font-medium text-sm border-0 cursor-pointer ${
                    stageColors[conversation.stage as keyof typeof stageColors]
                  }`}
                >
                  <option value="initial_contact">Initial Contact</option>
                  <option value="qualification">Qualification</option>
                  <option value="proposal">Proposal</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="closed_won">Closed Won</option>
                  <option value="closed_lost">Closed Lost</option>
                </select>
              ) : (
                <span
                  className={`px-3 py-1 rounded-full font-medium ${
                    stageColors[conversation.stage as keyof typeof stageColors]
                  }`}
                >
                  {conversation.stage.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Conversation Details */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">Details</h4>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Messages:</span>
            <span className="font-medium">{conversation.messageCount}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">First Contact:</span>
            <span className="font-medium text-right">
              {formatDistanceToNow(new Date(conversation.firstMessageAt), { addSuffix: true })}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Last Activity:</span>
            <span className="font-medium text-right">
              {formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Created:</span>
            <span className="font-medium text-right">
              {formatDistanceToNow(new Date(conversation.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>

      {/* Contact Details (if available) */}
      {contact && (
        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">
            Contact Info
          </h4>

          <div className="space-y-2 text-sm">
            {contact.name && (
              <div className="flex justify-between">
                <span className="text-gray-600">Name:</span>
                <span className="font-medium">{contact.name}</span>
              </div>
            )}

            {contact.pushname && (
              <div className="flex justify-between">
                <span className="text-gray-600">Display Name:</span>
                <span className="font-medium">{contact.pushname}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-gray-600">Type:</span>
              <span className="font-medium">{contact.isGroup ? 'Group' : 'Individual'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Custom Metadata */}
      {conversation.metadata && Object.keys(conversation.metadata).length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">
            Additional Information
          </h4>

          <div className="space-y-2 text-sm">
            {Object.entries(conversation.metadata).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                <span className="font-medium text-right max-w-[60%] truncate">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="space-y-2 pt-6 border-t">
        <h4 className="font-semibold text-sm text-gray-700 uppercase tracking-wide mb-3">
          Quick Actions
        </h4>

        <button className="w-full px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium">
          📋 View History
        </button>

        <button className="w-full px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium">
          ➕ Add Note
        </button>

        <button className="w-full px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-sm font-medium">
          🏷️ Add Tag
        </button>

        <button className="w-full px-4 py-2 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors text-sm font-medium">
          🔔 Set Reminder
        </button>
      </div>
    </div>
  );
});
