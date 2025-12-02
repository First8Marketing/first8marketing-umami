/**
 * WhatsApp Global State Store (Zustand)
 * Manages global WhatsApp state including sessions, real-time connection, and notifications
 */

import { create } from 'zustand';
import type { WhatsAppSession, WhatsAppMessage, RealTimeStatus } from '@/types/whatsapp';

interface WhatsAppState {
  // Sessions
  sessions: WhatsAppSession[];
  activeSession: WhatsAppSession | null;

  // Real-time state
  realTimeStatus: RealTimeStatus;
  connected: boolean;

  // Notifications
  unreadCount: number;
  recentMessages: WhatsAppMessage[];

  // UI State
  sidebarOpen: boolean;

  // Actions
  setSessions: (sessions: WhatsAppSession[]) => void;
  setActiveSession: (session: WhatsAppSession | null) => void;
  updateSession: (sessionId: string, updates: Partial<WhatsAppSession>) => void;
  addSession: (session: WhatsAppSession) => void;
  removeSession: (sessionId: string) => void;

  setRealTimeStatus: (status: RealTimeStatus) => void;
  setConnected: (connected: boolean) => void;

  setUnreadCount: (count: number) => void;
  incrementUnreadCount: () => void;
  addRecentMessage: (message: WhatsAppMessage) => void;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

/**
 * WhatsApp state store
 */
export const useWhatsAppStore = create<WhatsAppState>((set, _get) => ({
  // Initial state
  sessions: [],
  activeSession: null,

  realTimeStatus: {
    connected: false,
    activeSessions: 0,
    activeConversations: 0,
    messagesPerMinute: 0,
    lastUpdate: new Date().toISOString(),
  },
  connected: false,

  unreadCount: 0,
  recentMessages: [],

  sidebarOpen: true,

  // Session actions
  setSessions: sessions => set({ sessions }),

  setActiveSession: session => set({ activeSession: session }),

  updateSession: (sessionId, updates) =>
    set(state => ({
      sessions: state.sessions.map(s => (s.sessionId === sessionId ? { ...s, ...updates } : s)),
      activeSession:
        state.activeSession?.sessionId === sessionId
          ? { ...state.activeSession, ...updates }
          : state.activeSession,
    })),

  addSession: session =>
    set(state => ({
      sessions: [...state.sessions, session],
    })),

  removeSession: sessionId =>
    set(state => ({
      sessions: state.sessions.filter(s => s.sessionId !== sessionId),
      activeSession: state.activeSession?.sessionId === sessionId ? null : state.activeSession,
    })),

  // Real-time actions
  setRealTimeStatus: status => set({ realTimeStatus: status }),

  setConnected: connected => set({ connected }),

  // Notification actions
  setUnreadCount: count => set({ unreadCount: count }),

  incrementUnreadCount: () =>
    set(state => ({
      unreadCount: state.unreadCount + 1,
    })),

  addRecentMessage: message =>
    set(state => ({
      recentMessages: [message, ...state.recentMessages].slice(0, 10),
    })),

  // UI actions
  toggleSidebar: () =>
    set(state => ({
      sidebarOpen: !state.sidebarOpen,
    })),

  setSidebarOpen: open => set({ sidebarOpen: open }),
}));

/**
 * Selector hooks for optimized re-renders
 */
export const useActiveSessions = () =>
  useWhatsAppStore(state => state.sessions.filter(s => s.status === 'active'));

export const useSessionById = (sessionId: string) =>
  useWhatsAppStore(state => state.sessions.find(s => s.sessionId === sessionId));

export const useUnreadCount = () => useWhatsAppStore(state => state.unreadCount);

export const useRealTimeConnection = () =>
  useWhatsAppStore(state => ({
    connected: state.connected,
    status: state.realTimeStatus,
  }));
