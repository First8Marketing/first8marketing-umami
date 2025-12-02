/**
 * WhatsApp Analytics Integration - QR Code Handler
 *
 * Manages QR code generation, storage, expiration, and refresh for WhatsApp authentication.
 */

import QRCode from 'qrcode';
import { cache } from '@/lib/whatsapp-redis';
import { getLogger } from '@/lib/whatsapp-logger';
import { InternalError } from '@/lib/whatsapp-errors';

const logger = getLogger();

// QR code constants
const QR_CODE_TTL = 90; // 90 seconds as per WhatsApp spec
const QR_CODE_PREFIX = 'qr';

/**
 * QR code data interface
 */
export interface QRCodeData {
  sessionId: string;
  qrCode: string;
  base64: string;
  generatedAt: Date;
  expiresAt: Date;
}

/**
 * QR Code Handler
 */
export class QRCodeHandler {
  /**
   * Generate QR code from raw WhatsApp QR string
   */
  static async generateQRCode(qrString: string): Promise<string> {
    try {
      const base64 = await QRCode.toDataURL(qrString, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        margin: 1,
        width: 512,
      });

      logger.debug('qr-handler', 'QR code generated');
      return base64;
    } catch (error) {
      logger.error('qr-handler', 'Failed to generate QR code', error as Error);
      throw new InternalError('Failed to generate QR code');
    }
  }

  /**
   * Store QR code in cache with expiration
   */
  static async storeQRCode(sessionId: string, qrString: string): Promise<QRCodeData> {
    try {
      const base64 = await this.generateQRCode(qrString);
      const generatedAt = new Date();
      const expiresAt = new Date(generatedAt.getTime() + QR_CODE_TTL * 1000);

      const qrData: QRCodeData = {
        sessionId,
        qrCode: qrString,
        base64,
        generatedAt,
        expiresAt,
      };

      // Store in Redis with TTL
      await cache.set(`${QR_CODE_PREFIX}:${sessionId}`, qrData, QR_CODE_TTL);

      logger.info('qr-handler', 'QR code stored', {
        sessionId,
        expiresAt: expiresAt.toISOString(),
      });

      return qrData;
    } catch (error) {
      logger.error('qr-handler', 'Failed to store QR code', error as Error);
      throw error;
    }
  }

  /**
   * Retrieve QR code from cache
   */
  static async getQRCode(sessionId: string): Promise<QRCodeData | null> {
    try {
      const qrData = await cache.get<QRCodeData>(`${QR_CODE_PREFIX}:${sessionId}`);

      if (!qrData) {
        logger.debug('qr-handler', 'QR code not found in cache', { sessionId });
        return null;
      }

      // Check if expired
      const now = new Date();
      const expiresAt = new Date(qrData.expiresAt);

      if (now > expiresAt) {
        logger.debug('qr-handler', 'QR code expired', { sessionId });
        await this.deleteQRCode(sessionId);
        return null;
      }

      return qrData;
    } catch (error) {
      logger.error('qr-handler', 'Failed to get QR code', error as Error);
      return null;
    }
  }

  /**
   * Delete QR code from cache
   */
  static async deleteQRCode(sessionId: string): Promise<void> {
    try {
      await cache.delete(`${QR_CODE_PREFIX}:${sessionId}`);
      logger.debug('qr-handler', 'QR code deleted', { sessionId });
    } catch (error) {
      logger.error('qr-handler', 'Failed to delete QR code', error as Error);
    }
  }

  /**
   * Refresh QR code (if a new one is generated)
   */
  static async refreshQRCode(sessionId: string, newQrString: string): Promise<QRCodeData> {
    try {
      // Delete old QR code
      await this.deleteQRCode(sessionId);

      // Store new QR code
      const qrData = await this.storeQRCode(sessionId, newQrString);

      logger.info('qr-handler', 'QR code refreshed', { sessionId });

      return qrData;
    } catch (error) {
      logger.error('qr-handler', 'Failed to refresh QR code', error as Error);
      throw error;
    }
  }

  /**
   * Check if QR code exists and is valid
   */
  static async isQRCodeValid(sessionId: string): Promise<boolean> {
    const qrData = await this.getQRCode(sessionId);
    return qrData !== null;
  }

  /**
   * Get QR code as base64 data URL
   */
  static async getQRCodeBase64(sessionId: string): Promise<string | null> {
    const qrData = await this.getQRCode(sessionId);
    return qrData?.base64 || null;
  }

  /**
   * Get remaining TTL for QR code
   */
  static async getQRCodeTTL(sessionId: string): Promise<number | null> {
    const qrData = await this.getQRCode(sessionId);

    if (!qrData) {
      return null;
    }

    const now = new Date();
    const expiresAt = new Date(qrData.expiresAt);
    const ttl = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));

    return ttl;
  }

  /**
   * Validate QR code format
   */
  static validateQRCodeString(qrString: string): boolean {
    // WhatsApp QR codes typically start with a specific pattern
    // This is a basic validation
    return typeof qrString === 'string' && qrString.length > 0;
  }

  /**
   * Generate ASCII art QR code for terminal display
   */
  static async generateASCIIQRCode(qrString: string): Promise<string> {
    try {
      const ascii = await QRCode.toString(qrString, {
        type: 'terminal',
        small: true,
      });

      return ascii;
    } catch (error) {
      logger.error('qr-handler', 'Failed to generate ASCII QR code', error as Error);
      throw new InternalError('Failed to generate ASCII QR code');
    }
  }

  /**
   * Clean up expired QR codes (batch operation)
   */
  static async cleanupExpiredQRCodes(): Promise<number> {
    try {
      // This would require scanning Redis keys with pattern
      // For now, we rely on Redis TTL for automatic cleanup
      logger.debug('qr-handler', 'QR code cleanup relies on Redis TTL');
      return 0;
    } catch (error) {
      logger.error('qr-handler', 'Failed to cleanup expired QR codes', error as Error);
      return 0;
    }
  }
}

/**
 * Export convenience functions
 */
export const generateQRCode = QRCodeHandler.generateQRCode.bind(QRCodeHandler);
export const storeQRCode = QRCodeHandler.storeQRCode.bind(QRCodeHandler);
export const getQRCode = QRCodeHandler.getQRCode.bind(QRCodeHandler);
export const deleteQRCode = QRCodeHandler.deleteQRCode.bind(QRCodeHandler);
export const refreshQRCode = QRCodeHandler.refreshQRCode.bind(QRCodeHandler);
export const isQRCodeValid = QRCodeHandler.isQRCodeValid.bind(QRCodeHandler);
export const getQRCodeBase64 = QRCodeHandler.getQRCodeBase64.bind(QRCodeHandler);
export const getQRCodeTTL = QRCodeHandler.getQRCodeTTL.bind(QRCodeHandler);

export default QRCodeHandler;
