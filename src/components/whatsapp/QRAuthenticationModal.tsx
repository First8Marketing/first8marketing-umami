'use client';

/**
 * QR Code Authentication Modal Component
 * Handles WhatsApp QR code authentication flow with countdown and auto-refresh
 */

import { useState, useEffect, useCallback } from 'react';
import { useWhatsAppSession } from '@/hooks/useWhatsAppSession';

interface QRAuthenticationModalProps {
  isOpen: boolean;
  sessionId: string;
  qrCode?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function QRAuthenticationModal({
  isOpen,
  sessionId,
  qrCode: initialQrCode,
  onClose,
  onSuccess,
}: QRAuthenticationModalProps) {
  const [qrCode, setQrCode] = useState<string | null>(initialQrCode || null);
  const [timeLeft, setTimeLeft] = useState(90);
  const [status, setStatus] = useState<'waiting' | 'scanning' | 'success' | 'expired'>('waiting');
  const [error, setError] = useState<string | null>(null);

  const { requestQRCode, getSessionStatus } = useWhatsAppSession('');

  // Fetch QR code
  const fetchQRCode = useCallback(async () => {
    setError(null);
    setStatus('waiting');
    setTimeLeft(90);

    try {
      const data = await requestQRCode(sessionId);
      if (data) {
        setQrCode(data.qrCode);
      } else {
        setError('Failed to generate QR code');
      }
    } catch (_err) {
      setError('Error loading QR code');
    }
  }, [sessionId, requestQRCode]);

  // Check authentication status
  const checkAuthStatus = useCallback(async () => {
    try {
      const status = await getSessionStatus(sessionId);
      if (status === 'active' || status === 'authenticated') {
        setStatus('success');
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (_err) {
      // eslint-disable-next-line no-console
      console.error('Error checking auth status:', _err);
    }
  }, [sessionId, getSessionStatus, onSuccess]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || status !== 'waiting') return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, status]);

  // Auto-refresh QR code before expiration
  useEffect(() => {
    if (timeLeft === 10 && status === 'waiting') {
      fetchQRCode();
    }
  }, [timeLeft, status, fetchQRCode]);

  // Poll for authentication status
  useEffect(() => {
    if (!isOpen || status !== 'waiting') return;

    const pollInterval = setInterval(checkAuthStatus, 2000);

    return () => clearInterval(pollInterval);
  }, [isOpen, status, checkAuthStatus]);

  // Initial QR code fetch
  useEffect(() => {
    if (isOpen && !qrCode) {
      fetchQRCode();
    }
  }, [isOpen, qrCode, fetchQRCode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Scan QR Code</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* QR Code Display - Waiting */}
        {status === 'waiting' && (
          <div className="text-center">
            {qrCode ? (
              <div className="relative">
                <img
                  src={qrCode}
                  alt="WhatsApp QR Code"
                  className="w-64 h-64 mx-auto mb-4 border-4 border-blue-500 rounded-lg"
                />
                <div className="absolute top-2 right-2 bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                  {timeLeft}s
                </div>
              </div>
            ) : (
              <div className="w-64 h-64 mx-auto mb-4 flex items-center justify-center border-4 border-gray-200 rounded-lg">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
              </div>
            )}

            {/* Instructions */}
            <div className="bg-blue-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold mb-2">How to scan:</h3>
              <ol className="text-left text-sm space-y-2">
                <li className="flex gap-2">
                  <span className="font-bold">1.</span>
                  <span>Open WhatsApp on your phone</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">2.</span>
                  <span>
                    Tap Menu or Settings and select <strong>Linked Devices</strong>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">3.</span>
                  <span>
                    Tap <strong>Link a Device</strong>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">4.</span>
                  <span>Point your phone at this screen to scan the code</span>
                </li>
              </ol>
            </div>

            <p className="text-sm text-gray-600">
              QR code will refresh automatically in {timeLeft} seconds
            </p>
          </div>
        )}

        {/* Expired State */}
        {status === 'expired' && (
          <div className="text-center">
            <div className="text-6xl mb-4">⏰</div>
            <h3 className="text-xl font-semibold mb-2">QR Code Expired</h3>
            <p className="text-gray-600 mb-6">
              The QR code has expired. Please generate a new one.
            </p>
            <button
              onClick={fetchQRCode}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Generate New QR Code
            </button>
          </div>
        )}

        {/* Success State */}
        {status === 'success' && (
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">✓</div>
            <h3 className="text-xl font-semibold mb-2 text-green-600">Successfully Connected!</h3>
            <p className="text-gray-600 mb-4">Your WhatsApp is now linked to this session</p>
            <div className="animate-pulse text-sm text-gray-500">Redirecting...</div>
          </div>
        )}
      </div>
    </div>
  );
}
