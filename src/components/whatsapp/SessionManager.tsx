'use client';

/**
 * Session Manager Component
 * Displays and manages WhatsApp sessions with status indicators and actions
 */

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { WhatsAppSession } from '@/types/whatsapp';

interface SessionManagerProps {
  sessions: WhatsAppSession[];
  onDelete: (sessionId: string) => Promise<boolean>;
  onRequestQR: (sessionId: string) => Promise<void>;
  onLogout: (sessionId: string) => Promise<boolean>;
  _onRefresh?: () => Promise<void>;
}

export function SessionManager({
  sessions,
  onDelete,
  onRequestQR,
  onLogout,
  _onRefresh,
}: SessionManagerProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = async (sessionId: string) => {
    setActionLoading(sessionId);
    const success = await onDelete(sessionId);
    setActionLoading(null);
    if (success) {
      setConfirmDelete(null);
    }
  };

  const handleLogout = async (sessionId: string) => {
    setActionLoading(sessionId);
    await onLogout(sessionId);
    setActionLoading(null);
  };

  const handleQR = async (sessionId: string) => {
    setActionLoading(sessionId);
    await onRequestQR(sessionId);
    setActionLoading(null);
  };

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow">
        <div className="text-6xl mb-4">📱</div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">No Sessions Yet</h2>
        <p className="text-gray-500 mb-6">Create your first WhatsApp session to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sessions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {sessions.map(session => (
          <SessionCard
            key={session.sessionId}
            session={session}
            isLoading={actionLoading === session.sessionId}
            onDelete={() => setConfirmDelete(session.sessionId)}
            onLogout={() => handleLogout(session.sessionId)}
            onRequestQR={() => handleQR(session.sessionId)}
          />
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <ConfirmDeleteModal
          session={sessions.find(s => s.sessionId === confirmDelete)!}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          isLoading={actionLoading === confirmDelete}
        />
      )}
    </div>
  );
}

/**
 * Session Card Component
 */
function SessionCard({ session, isLoading, onDelete, onLogout, onRequestQR }: any) {
  const statusColors = {
    active: 'bg-green-500',
    authenticating: 'bg-yellow-500',
    disconnected: 'bg-gray-400',
    failed: 'bg-red-500',
    connecting: 'bg-blue-500',
  };

  const statusLabels = {
    active: 'Active',
    authenticating: 'Authenticating',
    disconnected: 'Disconnected',
    failed: 'Failed',
    connecting: 'Connecting',
  };

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6">
      {/* Header with Status */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-1">{session.sessionName}</h3>
          <p className="text-sm text-gray-600">{session.phoneNumber}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${statusColors[session.status]}`} />
          <span className="text-sm font-medium">{statusLabels[session.status]}</span>
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-2 mb-4 text-sm text-gray-600">
        {session.lastSeenAt && (
          <div className="flex justify-between">
            <span>Last seen:</span>
            <span className="font-medium">
              {formatDistanceToNow(new Date(session.lastSeenAt), { addSuffix: true })}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Created:</span>
          <span className="font-medium">
            {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t">
        {session.status === 'authenticating' && (
          <button
            onClick={onRequestQR}
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50"
          >
            Show QR
          </button>
        )}

        {session.status === 'active' && (
          <button
            onClick={onLogout}
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600 disabled:opacity-50"
          >
            Logout
          </button>
        )}

        {(session.status === 'disconnected' || session.status === 'failed') && (
          <button
            onClick={onRequestQR}
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 disabled:opacity-50"
          >
            Reconnect
          </button>
        )}

        <button
          onClick={onDelete}
          disabled={isLoading}
          className="px-3 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * Confirm Delete Modal
 */
function ConfirmDeleteModal({ session, onConfirm, onCancel, isLoading }: any) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Confirm Deletion</h2>

        <p className="text-gray-600 mb-6">
          Are you sure you want to delete the session <strong>{session.sessionName}</strong>? This
          action cannot be undone.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
