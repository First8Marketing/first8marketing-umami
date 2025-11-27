/**
 * WhatsApp Session Management Hook
 * Manages WhatsApp sessions with loading states and error handling
 */

import { useState, useEffect, useCallback } from 'react';
import { whatsappApi } from '@/lib/whatsapp-api';
import type { WhatsAppSession, QRCodeData } from '@/types/whatsapp';

interface UseWhatsAppSessionReturn {
  sessions: WhatsAppSession[];
  loading: boolean;
  error: string | null;
  createSession: (phoneNumber: string, sessionName: string) => Promise<WhatsAppSession | null>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  refreshSessions: () => Promise<void>;
  requestQRCode: (sessionId: string) => Promise<QRCodeData | null>;
  getSessionStatus: (sessionId: string) => Promise<string | null>;
  logoutSession: (sessionId: string) => Promise<boolean>;
}

/**
 * Custom hook for managing WhatsApp sessions
 */
export function useWhatsAppSession(teamId: string): UseWhatsAppSessionReturn {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all sessions for the team
   */
  const fetchSessions = useCallback(async () => {
    if (!teamId) return;

    setLoading(true);
    setError(null);

    const response = await whatsappApi.session.getSessions(teamId);

    if (response.success && response.data) {
      setSessions(response.data);
    } else {
      setError(response.error || 'Failed to fetch sessions');
    }

    setLoading(false);
  }, [teamId]);

  /**
   * Refresh sessions
   */
  const refreshSessions = useCallback(async () => {
    await fetchSessions();
  }, [fetchSessions]);

  /**
   * Create a new session
   */
  const createSession = useCallback(
    async (phoneNumber: string, sessionName: string): Promise<WhatsAppSession | null> => {
      setError(null);

      const response = await whatsappApi.session.createSession(teamId, phoneNumber, sessionName);

      if (response.success && response.data) {
        setSessions(prev => [...prev, response.data!]);
        return response.data;
      } else {
        setError(response.error || 'Failed to create session');
        return null;
      }
    },
    [teamId],
  );

  /**
   * Delete a session
   */
  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    setError(null);

    const response = await whatsappApi.session.deleteSession(sessionId);

    if (response.success) {
      setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
      return true;
    } else {
      setError(response.error || 'Failed to delete session');
      return false;
    }
  }, []);

  /**
   * Request QR code for authentication
   */
  const requestQRCode = useCallback(async (sessionId: string): Promise<QRCodeData | null> => {
    setError(null);

    const response = await whatsappApi.session.requestQRCode(sessionId);

    if (response.success && response.data) {
      return response.data;
    } else {
      setError(response.error || 'Failed to request QR code');
      return null;
    }
  }, []);

  /**
   * Get session status
   */
  const getSessionStatus = useCallback(async (sessionId: string): Promise<string | null> => {
    const response = await whatsappApi.session.getSessionStatus(sessionId);

    if (response.success && response.data) {
      return response.data.status;
    }

    return null;
  }, []);

  /**
   * Logout session
   */
  const logoutSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      setError(null);

      const response = await whatsappApi.session.logoutSession(sessionId);

      if (response.success) {
        await refreshSessions();
        return true;
      } else {
        setError(response.error || 'Failed to logout session');
        return false;
      }
    },
    [refreshSessions],
  );

  // Fetch sessions on mount and when teamId changes
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    loading,
    error,
    createSession,
    deleteSession,
    refreshSessions,
    requestQRCode,
    getSessionStatus,
    logoutSession,
  };
}
