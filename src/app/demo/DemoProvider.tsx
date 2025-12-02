'use client';

import { createContext, useContext, ReactNode, useMemo } from 'react';
import {
  DEMO_CONFIG,
  getWhatsAppUrl,
  getMailtoUrl,
  isDemoMode,
  isDemoConfigValid,
} from '@/lib/demo';

/**
 * Demo Context Type
 */
export interface DemoContextType {
  isDemo: boolean;
  isConfigValid: boolean;
  config: {
    websiteId: string;
    shareId: string;
    email: string;
    whatsapp: string;
    brandName: string;
    tagline: string;
    ctaText: string;
    ctaUrl: string;
  };
  urls: {
    whatsapp: string;
    mailto: string;
  };
}

/**
 * Default context value
 */
const defaultContext: DemoContextType = {
  isDemo: false,
  isConfigValid: false,
  config: {
    websiteId: '',
    shareId: '',
    email: '',
    whatsapp: '',
    brandName: 'First8Marketing',
    tagline: '',
    ctaText: 'Schedule a Demo',
    ctaUrl: '',
  },
  urls: {
    whatsapp: '',
    mailto: '',
  },
};

/**
 * Demo Context
 */
const DemoContext = createContext<DemoContextType>(defaultContext);

/**
 * Demo Provider Props
 */
interface DemoProviderProps {
  children: ReactNode;
}

/**
 * Demo Provider Component
 *
 * Provides demo mode configuration and utilities to child components
 */
export function DemoProvider({ children }: DemoProviderProps) {
  const value = useMemo<DemoContextType>(() => {
    const isDemo = isDemoMode();
    const isConfigValid = isDemoConfigValid();

    return {
      isDemo,
      isConfigValid,
      config: {
        websiteId: DEMO_CONFIG.websiteId,
        shareId: DEMO_CONFIG.shareId,
        email: DEMO_CONFIG.email,
        whatsapp: DEMO_CONFIG.whatsapp,
        brandName: DEMO_CONFIG.brandName,
        tagline: DEMO_CONFIG.tagline,
        ctaText: DEMO_CONFIG.ctaText,
        ctaUrl: DEMO_CONFIG.ctaUrl,
      },
      urls: {
        whatsapp: getWhatsAppUrl(`Hi! I'm interested in ${DEMO_CONFIG.brandName}`),
        mailto: getMailtoUrl(
          `Interest in ${DEMO_CONFIG.brandName}`,
          `Hi,\n\nI viewed your demo and I'm interested in learning more about ${DEMO_CONFIG.brandName}.\n\nPlease get in touch.\n\nThank you!`,
        ),
      },
    };
  }, []);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

/**
 * Hook to access demo context
 */
export function useDemo(): DemoContextType {
  const context = useContext(DemoContext);

  if (context === undefined) {
    return defaultContext;
  }

  return context;
}

/**
 * Export context for advanced use cases
 */
export { DemoContext };
