'use client';

/**
 * WhatsApp Sessions Management Page
 * Create, manage, and monitor WhatsApp sessions
 */

import { useState } from 'react';
import { useApp } from '@/store/app';
import { useWhatsAppSession } from '@/hooks/useWhatsAppSession';
import { SessionManager } from '@/components/whatsapp/SessionManager';
import { QRAuthenticationModal } from '@/components/whatsapp/QRAuthenticationModal';
import type { QRCodeData } from '@/types/whatsapp';

export default function SessionsPage() {
  const { user } = useApp();
  const teamId = user?.teamId || '';

  const {
    sessions,
    loading,
    error,
    createSession,
    deleteSession,
    refreshSessions,
    requestQRCode,
    logoutSession,
  } = useWhatsAppSession(teamId);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [qrData, setQrData] = useState<QRCodeData | null>(null);
  const [showQR, setShowQR] = useState(false);

  // Handle QR code request from SessionManager
  const handleQRRequest = async (sessionId: string) => {
    const data = await requestQRCode(sessionId);
    if (data) {
      setQrData(data);
      setShowQR(true);
    }
  };

  // Handle session creation
  const handleCreateSession = async (phoneNumber: string, sessionName: string) => {
    const session = await createSession(phoneNumber, sessionName);
    if (session) {
      setShowCreateForm(false);
      // Request QR code for new session
      await handleQRRequest(session.sessionId);
    }
  };

  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WhatsApp Sessions</h1>
          <p className="text-gray-600 mt-1">Manage your WhatsApp business connections</p>
        </div>

        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
        >
          <span>➕</span>
          <span>Create Session</span>
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Session Manager Component */}
      <SessionManager
        sessions={sessions}
        onDelete={deleteSession}
        onRequestQR={handleQRRequest}
        onLogout={logoutSession}
        onRefresh={refreshSessions}
      />

      {/* Create Session Form Modal */}
      {showCreateForm && (
        <CreateSessionModal
          onClose={() => setShowCreateForm(false)}
          onCreate={handleCreateSession}
        />
      )}

      {/* QR Authentication Modal */}
      {showQR && qrData && (
        <QRAuthenticationModal
          isOpen={showQR}
          sessionId={qrData.sessionId}
          qrCode={qrData.qrCode}
          onClose={() => setShowQR(false)}
          onSuccess={() => {
            setShowQR(false);
            refreshSessions();
          }}
        />
      )}
    </div>
  );
}

/**
 * Create Session Form Modal
 */
function CreateSessionModal({ onClose, onCreate }: any) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onCreate(phoneNumber, sessionName);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">Create New Session</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="sessionName" className="block text-sm font-medium text-gray-700 mb-1">
              Session Name
            </label>
            <input
              id="sessionName"
              type="text"
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder="e.g., Sales Team"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              id="phoneNumber"
              type="tel"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              placeholder="+1234567890"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Include country code (e.g., +1 for US)</p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
