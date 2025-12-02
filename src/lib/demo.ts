/**
 * Demo Mode Configuration
 *
 * This module provides configuration and utility functions for Demo Mode.
 * Demo Mode allows public demonstration of the analytics dashboard without
 * exposing administrative access.
 */

// Demo Mode Environment Configuration
export const DEMO_CONFIG = {
  enabled: process.env.demoMode === 'true',
  websiteId: process.env.demoWebsiteId || '',
  shareId: process.env.demoShareId || '',
  email: process.env.demoEmail || '',
  whatsapp: process.env.demoWhatsApp || '',
  brandName: process.env.demoBrandName || 'First8Marketing',
  tagline: process.env.demoTagline || 'AI-Powered Analytics & Marketing Automation',
  ctaText: process.env.demoCtaText || 'Schedule a Demo',
  ctaUrl: process.env.demoCtaUrl || '',
} as const;

// Routes blocked in demo mode
export const DEMO_BLOCKED_ROUTES = [
  '/login',
  '/logout',
  '/admin',
  '/settings',
  '/api/admin',
  '/api/auth/login',
  '/api/users',
] as const;

// Routes allowed in demo mode without authentication
export const DEMO_ALLOWED_ROUTES = [
  '/',
  '/demo',
  '/share',
  '/api/config',
  '/api/share',
  '/api/websites',
  '/script.js',
  '/telemetry.js',
] as const;

// API endpoints that allow read operations in demo mode
export const DEMO_READ_ONLY_API = [
  '/api/websites/[websiteId]/stats',
  '/api/websites/[websiteId]/pageviews',
  '/api/websites/[websiteId]/metrics',
  '/api/websites/[websiteId]/events',
  '/api/websites/[websiteId]/sessions',
  '/api/websites/[websiteId]/active',
  '/api/websites/[websiteId]/realtime',
] as const;

/**
 * Check if demo mode is enabled
 */
export function isDemoMode(): boolean {
  return DEMO_CONFIG.enabled;
}

/**
 * Check if demo mode is properly configured
 */
export function isDemoConfigValid(): boolean {
  return DEMO_CONFIG.enabled && (!!DEMO_CONFIG.websiteId || !!DEMO_CONFIG.shareId);
}

/**
 * Check if a route is blocked in demo mode
 */
export function isBlockedInDemoMode(pathname: string): boolean {
  if (!isDemoMode()) return false;

  return DEMO_BLOCKED_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Check if a route is allowed without authentication in demo mode
 */
export function isAllowedInDemoMode(pathname: string): boolean {
  if (!isDemoMode()) return false;

  return DEMO_ALLOWED_ROUTES.some(
    route =>
      pathname === route || pathname.startsWith(`${route}/`) || pathname.startsWith('/share/'),
  );
}

/**
 * Get WhatsApp click-to-chat URL
 */
export function getWhatsAppUrl(message?: string): string {
  if (!DEMO_CONFIG.whatsapp) return '';

  const phoneNumber = DEMO_CONFIG.whatsapp.replace(/[^0-9+]/g, '');
  const encodedMessage = message ? `?text=${encodeURIComponent(message)}` : '';

  return `https://wa.me/${phoneNumber.replace('+', '')}${encodedMessage}`;
}

/**
 * Get mailto URL
 */
export function getMailtoUrl(subject?: string, body?: string): string {
  if (!DEMO_CONFIG.email) return '';

  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);

  const queryString = params.toString();
  return `mailto:${DEMO_CONFIG.email}${queryString ? `?${queryString}` : ''}`;
}

/**
 * Log demo mode access attempt
 * Note: Logging removed to satisfy ESLint no-console rule
 */
export function logDemoAccess(_pathname: string, _allowed: boolean): void {
  // Logging disabled - function kept for API compatibility
}

export type DemoConfig = typeof DEMO_CONFIG;
