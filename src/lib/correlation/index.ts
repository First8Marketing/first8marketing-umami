/**
 * WhatsApp Analytics Integration - Correlation Module Index
 *
 * Centralized exports for all correlation engine components.
 */

// Core engine
export {
  WhatsAppCorrelationEngine,
  createCorrelationEngine,
  type CorrelationRequest,
  type CorrelationResult,
  type CorrelationEngineOptions,
} from '../whatsapp-correlation-engine';

// Confidence scorer
export {
  ConfidenceScorer,
  createConfidenceScorer,
  calculateConfidence,
  type CorrelationEvidence,
  type ConfidenceResult,
  type ConfidenceConfig,
} from './confidence-scorer';

// Phone matcher
export {
  PhoneMatcher,
  createPhoneMatcher,
  type PhoneMatchResult,
  type PhoneNormalizationOptions,
} from './phone-matcher';

// Email matcher
export {
  EmailMatcher,
  createEmailMatcher,
  type EmailMatchResult,
  type EmailValidationOptions,
} from './email-matcher';

// Session matcher
export {
  SessionMatcher,
  createSessionMatcher,
  type SessionMatchResult,
  type SessionMatchOptions,
  type TemporalWindow,
} from './session-matcher';

// Behavioral matcher
export {
  BehavioralMatcher,
  createBehavioralMatcher,
  type BehavioralMatchResult,
  type ActivityPattern,
  type TopicMatch,
} from './behavioral-matcher';

// Journey mapper
export {
  JourneyMapper,
  createJourneyMapper,
  type UserJourney,
  type JourneyTouchpoint,
  type JourneyStageInfo,
  type ConversionEvent,
  type JourneyStage,
  type TouchpointChannel,
  type JourneyMapOptions,
} from './journey-mapper';

// Verification manager
export {
  VerificationManager,
  createVerificationManager,
  type VerificationQueueItem,
  type VerificationDecision,
  type VerificationStats,
} from './verification-manager';

// Re-export default instances for convenience
import confidenceScorer from './confidence-scorer';
import phoneMatcher from './phone-matcher';
import emailMatcher from './email-matcher';
import sessionMatcher from './session-matcher';
import behavioralMatcher from './behavioral-matcher';
import journeyMapper from './journey-mapper';
import verificationManager from './verification-manager';
import correlationEngine from '../whatsapp-correlation-engine';

export const defaultInstances = {
  confidenceScorer,
  phoneMatcher,
  emailMatcher,
  sessionMatcher,
  behavioralMatcher,
  journeyMapper,
  verificationManager,
  correlationEngine,
};

export default defaultInstances;
