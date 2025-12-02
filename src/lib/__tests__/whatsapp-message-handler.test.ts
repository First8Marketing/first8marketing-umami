/**
 * WhatsApp Message Handler - Unit Tests
 * Tests message parsing, storage, media processing, and retrieval
 */

import { MessageHandler, ParsedMessage } from '../whatsapp-message-handler';
import type { TenantContext, WhatsAppMessage } from '@/types/whatsapp';

// Mock dependencies
jest.mock('../whatsapp-db');
jest.mock('../whatsapp-logger');

import { executeWithContext } from '../whatsapp-db';
import { getLogger } from '../whatsapp-logger';

const mockExecuteWithContext = executeWithContext as jest.MockedFunction<typeof executeWithContext>;
const mockGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;

describe('MessageHandler', () => {
  let mockContext: TenantContext;
  let mockLogger: any;

  beforeEach(() => {
    mockContext = {
      teamId: 'team-123',
      userRole: 'admin',
    };

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    mockGetLogger.mockReturnValue(mockLogger);

    mockExecuteWithContext.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseMessage', () => {
    /**
     * Test parsing of a simple text message
     */
    it('should parse text message correctly', () => {
      const mockMessage = {
        id: { _serialized: 'msg-123', id: 'msg-123' },
        from: '1234567890@c.us',
        to: '9876543210@c.us',
        body: 'Hello, this is a test message',
        type: 'chat',
        timestamp: 1640000000,
        hasMedia: false,
        hasQuotedMsg: false,
        fromMe: false,
        _data: {
          deviceType: 'android',
          broadcast: false,
          isForwarded: false,
        },
      } as any;

      const parsed = MessageHandler.parseMessage(mockMessage);

      expect(parsed).toEqual({
        waMessageId: 'msg-123',
        direction: 'inbound',
        fromPhone: '1234567890',
        toPhone: '9876543210',
        chatId: '1234567890@c.us',
        messageType: 'text',
        messageBody: 'Hello, this is a test message',
        timestamp: new Date(1640000000000),
        quotedMsgId: undefined,
        metadata: {
          hasMedia: false,
          deviceType: 'android',
          broadcast: false,
          isForwarded: false,
          mentionedIds: [],
        },
      });
    });

    /**
     * Test parsing of outbound message (fromMe: true)
     */
    it('should parse outbound message correctly', () => {
      const mockMessage = {
        id: { _serialized: 'msg-456', id: 'msg-456' },
        from: '9876543210@c.us',
        to: '1234567890@c.us',
        body: 'This is my response',
        type: 'chat',
        timestamp: 1640000100,
        hasMedia: false,
        hasQuotedMsg: false,
        fromMe: true,
        _data: {
          deviceType: 'web',
          broadcast: false,
          isForwarded: false,
        },
      } as any;

      const parsed = MessageHandler.parseMessage(mockMessage);

      expect(parsed.direction).toBe('outbound');
      expect(parsed.messageBody).toBe('This is my response');
    });

    /**
     * Test parsing of media message
     */
    it('should parse media message type correctly', () => {
      const mockMessage = {
        id: { _serialized: 'msg-789', id: 'msg-789' },
        from: '1234567890@c.us',
        to: '9876543210@c.us',
        body: 'Check out this image!',
        type: 'image',
        timestamp: 1640000200,
        hasMedia: true,
        hasQuotedMsg: false,
        fromMe: false,
        _data: {
          deviceType: 'android',
          broadcast: false,
          isForwarded: false,
        },
      } as any;

      const parsed = MessageHandler.parseMessage(mockMessage);

      expect(parsed.messageType).toBe('image');
      expect(parsed.metadata?.hasMedia).toBe(true);
    });

    /**
     * Test parsing of quoted message
     */
    it('should parse quoted message correctly', () => {
      const mockMessage = {
        id: { _serialized: 'msg-101', id: 'msg-101' },
        from: '1234567890@c.us',
        to: '9876543210@c.us',
        body: 'Replying to previous message',
        type: 'chat',
        timestamp: 1640000300,
        hasMedia: false,
        hasQuotedMsg: true,
        fromMe: false,
        _data: {
          deviceType: 'android',
          broadcast: false,
          isForwarded: false,
          quotedMsg: {
            id: { _serialized: 'quoted-msg-100' },
          },
        },
      } as any;

      const parsed = MessageHandler.parseMessage(mockMessage);

      expect(parsed.quotedMsgId).toBe('quoted-msg-100');
    });

    /**
     * Test message type mapping for various WhatsApp message types
     */
    it('should map message types correctly', () => {
      const types = [
        { whatsapp: 'chat', expected: 'text' },
        { whatsapp: 'image', expected: 'image' },
        { whatsapp: 'video', expected: 'video' },
        { whatsapp: 'audio', expected: 'audio' },
        { whatsapp: 'ptt', expected: 'audio' },
        { whatsapp: 'document', expected: 'document' },
        { whatsapp: 'sticker', expected: 'sticker' },
        { whatsapp: 'location', expected: 'location' },
        { whatsapp: 'vcard', expected: 'contact' },
      ];

      types.forEach(({ whatsapp, expected }) => {
        const mockMessage = {
          id: { _serialized: `msg-${whatsapp}`, id: `msg-${whatsapp}` },
          from: '1234567890@c.us',
          to: '9876543210@c.us',
          body: 'Test',
          type: whatsapp,
          timestamp: 1640000000,
          hasMedia: whatsapp !== 'chat',
          hasQuotedMsg: false,
          fromMe: false,
          _data: {},
        } as any;

        const parsed = MessageHandler.parseMessage(mockMessage);
        expect(parsed.messageType).toBe(expected);
      });
    });
  });

  describe('storeMessage', () => {
    /**
     * Test successful message storage in database
     */
    it('should store message in database', async () => {
      const parsedMessage: ParsedMessage = {
        waMessageId: 'wa-msg-123',
        direction: 'inbound',
        fromPhone: '1234567890',
        toPhone: '9876543210',
        chatId: '1234567890@c.us',
        messageType: 'text',
        messageBody: 'Test message',
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        metadata: { hasMedia: false },
      };

      const mockStoredMessage: WhatsAppMessage = {
        messageId: 'db-msg-123',
        teamId: 'team-123',
        sessionId: 'session-123',
        waMessageId: 'wa-msg-123',
        direction: 'inbound',
        fromPhone: '1234567890',
        toPhone: '9876543210',
        chatId: '1234567890@c.us',
        messageType: 'text',
        messageBody: 'Test message',
        timestamp: '2025-01-01T00:00:00.000Z',
        isRead: false,
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [mockStoredMessage],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await MessageHandler.storeMessage(mockContext, 'session-123', parsedMessage);

      expect(result).toEqual(mockStoredMessage);
      expect(mockExecuteWithContext).toHaveBeenCalledWith(
        mockContext,
        expect.stringContaining('INSERT INTO whatsapp_message'),
        expect.arrayContaining([
          expect.any(String), // message_id
          'team-123',
          'session-123',
          null, // conversation_id
          'wa-msg-123',
          'inbound',
          '1234567890',
          '9876543210',
          '1234567890@c.us',
          'text',
          'Test message',
        ]),
      );
    });

    /**
     * Test storing message with media metadata
     */
    it('should store message with media metadata', async () => {
      const parsedMessage: ParsedMessage = {
        waMessageId: 'wa-msg-456',
        direction: 'inbound',
        fromPhone: '1234567890',
        toPhone: '9876543210',
        chatId: '1234567890@c.us',
        messageType: 'image',
        messageBody: 'Photo caption',
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
        metadata: { hasMedia: true },
      };

      const mediaData = {
        url: 'https://cdn.example.com/photo.jpg',
        mimeType: 'image/jpeg',
        size: 102400,
        caption: 'Photo caption',
      };

      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [{ messageId: 'db-msg-456' }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      await MessageHandler.storeMessage(mockContext, 'session-123', parsedMessage, mediaData);

      expect(mockExecuteWithContext).toHaveBeenCalledWith(
        mockContext,
        expect.anything(),
        expect.arrayContaining([
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          'image',
          'Photo caption',
          'https://cdn.example.com/photo.jpg',
          'image/jpeg',
          102400,
        ]),
      );
    });
  });

  describe('markMessageAsRead', () => {
    it('should mark message as read', async () => {
      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      await MessageHandler.markMessageAsRead(mockContext, 'msg-123');

      expect(mockExecuteWithContext).toHaveBeenCalledWith(
        mockContext,
        expect.stringContaining('UPDATE whatsapp_message'),
        ['msg-123'],
      );
    });
  });

  describe('getMessage', () => {
    it('should retrieve message by ID', async () => {
      const mockMessage: WhatsAppMessage = {
        messageId: 'msg-123',
        teamId: 'team-123',
        sessionId: 'session-123',
        waMessageId: 'wa-msg-123',
        direction: 'inbound',
        fromPhone: '1234567890',
        toPhone: '9876543210',
        chatId: '1234567890@c.us',
        messageType: 'text',
        messageBody: 'Test message',
        timestamp: '2025-01-01T00:00:00.000Z',
        isRead: false,
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [mockMessage],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await MessageHandler.getMessage(mockContext, 'msg-123');

      expect(result).toEqual(mockMessage);
    });

    it('should return null for non-existent message', async () => {
      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await MessageHandler.getMessage(mockContext, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getConversationMessages', () => {
    it('should retrieve messages for conversation with pagination', async () => {
      const mockMessages: WhatsAppMessage[] = [
        {
          messageId: 'msg-1',
          teamId: 'team-123',
          sessionId: 'session-123',
          waMessageId: 'wa-msg-1',
          direction: 'inbound',
          fromPhone: '1234567890',
          toPhone: '9876543210',
          chatId: '1234567890@c.us',
          messageType: 'text',
          messageBody: 'First message',
          timestamp: '2025-01-01T00:00:00.000Z',
          isRead: true,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        {
          messageId: 'msg-2',
          teamId: 'team-123',
          sessionId: 'session-123',
          waMessageId: 'wa-msg-2',
          direction: 'outbound',
          fromPhone: '9876543210',
          toPhone: '1234567890',
          chatId: '1234567890@c.us',
          messageType: 'text',
          messageBody: 'Second message',
          timestamp: '2025-01-01T00:01:00.000Z',
          isRead: false,
          createdAt: '2025-01-01T00:01:00.000Z',
        },
      ];

      mockExecuteWithContext.mockResolvedValueOnce({
        rows: mockMessages,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await MessageHandler.getConversationMessages(mockContext, 'conv-123', 50, 0);

      expect(result).toEqual(mockMessages);
      expect(result).toHaveLength(2);
      expect(mockExecuteWithContext).toHaveBeenCalledWith(
        mockContext,
        expect.stringContaining('WHERE conversation_id = $1'),
        ['conv-123', 50, 0],
      );
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread message count for team', async () => {
      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [{ count: '5' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await MessageHandler.getUnreadCount(mockContext);

      expect(result).toBe(5);
    });

    it('should return unread count for specific chat', async () => {
      mockExecuteWithContext.mockResolvedValueOnce({
        rows: [{ count: '3' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await MessageHandler.getUnreadCount(mockContext, 'chat-123');

      expect(result).toBe(3);
      expect(mockExecuteWithContext).toHaveBeenCalledWith(
        mockContext,
        expect.stringContaining('AND chat_id = $2'),
        ['team-123', 'chat-123'],
      );
    });

    it('should return 0 on error', async () => {
      mockExecuteWithContext.mockRejectedValueOnce(new Error('Database error'));

      const result = await MessageHandler.getUnreadCount(mockContext);

      expect(result).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('searchMessages', () => {
    it('should search messages by term', async () => {
      const mockMessages: WhatsAppMessage[] = [
        {
          messageId: 'msg-1',
          teamId: 'team-123',
          sessionId: 'session-123',
          waMessageId: 'wa-msg-1',
          direction: 'inbound',
          fromPhone: '1234567890',
          toPhone: '9876543210',
          chatId: '1234567890@c.us',
          messageType: 'text',
          messageBody: 'Hello world',
          timestamp: '2025-01-01T00:00:00.000Z',
          isRead: false,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ];

      mockExecuteWithContext.mockResolvedValueOnce({
        rows: mockMessages,
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await MessageHandler.searchMessages(mockContext, 'hello', 50);

      expect(result).toEqual(mockMessages);
      expect(mockExecuteWithContext).toHaveBeenCalledWith(
        mockContext,
        expect.stringContaining('message_body ILIKE $2'),
        ['team-123', '%hello%', '%hello%', 50],
      );
    });
  });
});
