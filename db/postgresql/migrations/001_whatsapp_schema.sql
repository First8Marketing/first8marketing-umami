-- ==============================================================================
-- WhatsApp Analytics Integration - Main Schema Creation
-- ==============================================================================
-- Description: Creates core tables for WhatsApp integration with first8marketing-umami
-- Version: 1.0.0
-- Date: 2025-11-23
-- PostgreSQL Version: 17+
-- Dependencies: Existing umami tables (team, website, session, user)
--
-- Tables Created:
--   1. whatsapp_session - WhatsApp connection sessions per tenant
--   2. whatsapp_message - Individual messages with full metadata
--   3. whatsapp_conversation - Conversation thread management
--   4. whatsapp_event - WhatsApp-specific events for analytics
--   5. whatsapp_user_identity_correlation - Links WhatsApp users to umami users
--
-- Features:
--   - Multi-tenant isolation via team_id
--   - Full message metadata and threading support
--   - Media attachment support (URL-based)
--   - Encryption-ready fields
--   - Cross-channel user correlation
--   - Comprehensive audit trail
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- Table: whatsapp_session
-- ==============================================================================
-- Purpose: Manages WhatsApp connection sessions per tenant/team
-- Tenant Isolation: team_id (FK to team table)
-- Session Lifecycle: authenticating → active → disconnected → failed
-- ==============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_session (
    -- Primary identification
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL,
    
    -- WhatsApp account details
    phone_number VARCHAR(20) NOT NULL,
    session_name VARCHAR(100) NOT NULL,
    
    -- Session status and state
    status VARCHAR(20) NOT NULL DEFAULT 'authenticating'
        CHECK (status IN ('authenticating', 'active', 'disconnected', 'failed', 'reconnecting')),
    
    -- QR code for authentication (temporary, cleared after auth)
    qr_code TEXT,
    qr_code_expires_at TIMESTAMPTZ,
    
    -- Session activity tracking
    last_seen_at TIMESTAMPTZ,
    connection_attempts INTEGER DEFAULT 0,
    last_error TEXT,
    
    -- RemoteAuth session data (encrypted)
    session_data JSONB,
    
    -- Browser/Puppeteer configuration
    browser_config JSONB DEFAULT '{
        "headless": true,
        "args": ["--no-sandbox", "--disable-setuid-sandbox"]
    }'::jsonb,
    
    -- WhatsApp account metadata
    account_info JSONB DEFAULT '{}'::jsonb,
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT fk_whatsapp_session_team 
        FOREIGN KEY (team_id) 
        REFERENCES team(team_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT unique_active_phone_per_team 
        UNIQUE (team_id, phone_number) 
        WHERE deleted_at IS NULL
);

-- Add comments for documentation
COMMENT ON TABLE whatsapp_session IS 'WhatsApp connection sessions per tenant with state management';
COMMENT ON COLUMN whatsapp_session.session_id IS 'Unique identifier for WhatsApp session';
COMMENT ON COLUMN whatsapp_session.team_id IS 'Tenant/team owning this session (multi-tenant isolation)';
COMMENT ON COLUMN whatsapp_session.phone_number IS 'WhatsApp Business phone number (format: +1234567890)';
COMMENT ON COLUMN whatsapp_session.status IS 'Current session state: authenticating, active, disconnected, failed, reconnecting';
COMMENT ON COLUMN whatsapp_session.qr_code IS 'Base64 QR code for authentication (temporary, cleared after successful auth)';
COMMENT ON COLUMN whatsapp_session.session_data IS 'Encrypted RemoteAuth session data for persistence';
COMMENT ON COLUMN whatsapp_session.browser_config IS 'Puppeteer browser configuration (JSONB)';

-- ==============================================================================
-- Table: whatsapp_conversation
-- ==============================================================================
-- Purpose: Manages conversation threads and their metadata
-- Relationships: Links to whatsapp_session and team
-- Lifecycle: open → closed → archived
-- ==============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_conversation (
    -- Primary identification
    conversation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL,
    session_id UUID NOT NULL,
    
    -- WhatsApp conversation identifiers
    chat_id VARCHAR(100) NOT NULL,
    
    -- Contact information
    contact_phone VARCHAR(20) NOT NULL,
    contact_name VARCHAR(255),
    contact_profile_pic_url TEXT,
    
    -- Conversation state
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed', 'archived', 'blocked')),
    
    -- Funnel tracking (for analytics)
    stage VARCHAR(50),
    stage_updated_at TIMESTAMPTZ,
    
    -- Conversation metrics
    first_message_at TIMESTAMPTZ NOT NULL,
    last_message_at TIMESTAMPTZ NOT NULL,
    message_count INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,
    
    -- Assignment and tags
    assigned_to UUID, -- FK to user table
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Custom metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT fk_conversation_team 
        FOREIGN KEY (team_id) 
        REFERENCES team(team_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_conversation_session 
        FOREIGN KEY (session_id) 
        REFERENCES whatsapp_session(session_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_conversation_assigned_user 
        FOREIGN KEY (assigned_to) 
        REFERENCES "user"(user_id) 
        ON DELETE SET NULL,
    
    CONSTRAINT unique_chat_per_session 
        UNIQUE (session_id, chat_id)
);

COMMENT ON TABLE whatsapp_conversation IS 'WhatsApp conversation threads with status and metrics';
COMMENT ON COLUMN whatsapp_conversation.chat_id IS 'WhatsApp chat identifier (format: phone@c.us or group@g.us)';
COMMENT ON COLUMN whatsapp_conversation.status IS 'Conversation status: open, closed, archived, blocked';
COMMENT ON COLUMN whatsapp_conversation.stage IS 'Sales funnel stage (e.g., initial_contact, qualification, proposal)';
COMMENT ON COLUMN whatsapp_conversation.assigned_to IS 'User ID of team member assigned to this conversation';
COMMENT ON COLUMN whatsapp_conversation.tags IS 'Array of tags for categorization';

-- ==============================================================================
-- Table: whatsapp_message
-- ==============================================================================
-- Purpose: Stores all WhatsApp messages with complete metadata
-- Features: Media support, threading, reactions, encryption-ready
-- Volume: High-volume table, requires partitioning strategy
-- ==============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_message (
    -- Primary identification
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL,
    session_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    
    -- WhatsApp message identifiers
    wa_message_id VARCHAR(100) NOT NULL,
    
    -- Message direction and participants
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    from_phone VARCHAR(20) NOT NULL,
    to_phone VARCHAR(20) NOT NULL,
    chat_id VARCHAR(100) NOT NULL,
    
    -- Message type and content
    message_type VARCHAR(20) NOT NULL DEFAULT 'text'
        CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'poll', 'reaction')),
    
    -- Message content (consider encryption for sensitive data)
    message_body TEXT,
    message_body_encrypted BYTEA, -- Optional encrypted version
    
    -- Media attachments (URL-based, not binary)
    media_url TEXT,
    media_mime_type VARCHAR(100),
    media_size BIGINT,
    media_caption TEXT,
    thumbnail_url TEXT,
    
    -- Message threading and context
    is_forwarded BOOLEAN DEFAULT FALSE,
    is_reply BOOLEAN DEFAULT FALSE,
    quoted_msg_id VARCHAR(100),
    
    -- Message status tracking
    timestamp TIMESTAMPTZ NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    is_delivered BOOLEAN DEFAULT FALSE,
    delivered_at TIMESTAMPTZ,
    
    -- Reactions and engagement
    has_reactions BOOLEAN DEFAULT FALSE,
    reactions JSONB DEFAULT '[]'::jsonb,
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT fk_message_team 
        FOREIGN KEY (team_id) 
        REFERENCES team(team_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_message_session 
        FOREIGN KEY (session_id) 
        REFERENCES whatsapp_session(session_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_message_conversation 
        FOREIGN KEY (conversation_id) 
        REFERENCES whatsapp_conversation(conversation_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT unique_wa_message_per_session 
        UNIQUE (session_id, wa_message_id)
);

COMMENT ON TABLE whatsapp_message IS 'All WhatsApp messages with full metadata and media support';
COMMENT ON COLUMN whatsapp_message.wa_message_id IS 'WhatsApp internal message ID';
COMMENT ON COLUMN whatsapp_message.direction IS 'Message direction: inbound (received) or outbound (sent)';
COMMENT ON COLUMN whatsapp_message.message_type IS 'Type of message content';
COMMENT ON COLUMN whatsapp_message.message_body_encrypted IS 'Encrypted message content (optional, for sensitive data)';
COMMENT ON COLUMN whatsapp_message.media_url IS 'URL to media file (stored externally, not in database)';
COMMENT ON COLUMN whatsapp_message.quoted_msg_id IS 'ID of message being replied to (threading)';
COMMENT ON COLUMN whatsapp_message.reactions IS 'JSONB array of reactions (emoji responses)';

-- ==============================================================================
-- Table: whatsapp_event
-- ==============================================================================
-- Purpose: Stores WhatsApp-specific events for analytics and tracking
-- Events: message_sent, message_received, status_changed, call events, etc.
-- Integration: Links to umami analytics pipeline
-- ==============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_event (
    -- Primary identification
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL,
    session_id UUID NOT NULL,
    
    -- Event classification
    event_type VARCHAR(50) NOT NULL
        CHECK (event_type IN (
            'message_sent', 'message_received', 'message_read', 'message_delivered',
            'reaction_added', 'reaction_removed',
            'status_updated', 'presence_changed',
            'group_join', 'group_leave', 'group_created',
            'call_started', 'call_ended', 'call_missed',
            'contact_added', 'contact_blocked',
            'session_connected', 'session_disconnected',
            'qr_generated', 'auth_success', 'auth_failure'
        )),
    
    -- Event data payload
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Related entities (optional foreign keys)
    message_id UUID,
    conversation_id UUID,
    
    -- Event metadata
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    processing_error TEXT,
    
    -- Analytics integration
    sent_to_analytics BOOLEAN DEFAULT FALSE,
    analytics_event_id UUID,
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT fk_event_team 
        FOREIGN KEY (team_id) 
        REFERENCES team(team_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_event_session 
        FOREIGN KEY (session_id) 
        REFERENCES whatsapp_session(session_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_event_message 
        FOREIGN KEY (message_id) 
        REFERENCES whatsapp_message(message_id) 
        ON DELETE SET NULL,
    
    CONSTRAINT fk_event_conversation 
        FOREIGN KEY (conversation_id) 
        REFERENCES whatsapp_conversation(conversation_id) 
        ON DELETE SET NULL
);

COMMENT ON TABLE whatsapp_event IS 'WhatsApp-specific events for analytics and tracking';
COMMENT ON COLUMN whatsapp_event.event_type IS 'Type of event (message, status, call, etc.)';
COMMENT ON COLUMN whatsapp_event.event_data IS 'JSONB payload containing event-specific data';
COMMENT ON COLUMN whatsapp_event.processed IS 'Whether event has been processed by analytics pipeline';
COMMENT ON COLUMN whatsapp_event.sent_to_analytics IS 'Whether event has been sent to umami analytics';

-- ==============================================================================
-- Table: whatsapp_user_identity_correlation
-- ==============================================================================
-- Purpose: Links WhatsApp users to umami website users for cross-channel analytics
-- Features: Confidence scoring, multiple correlation methods, manual verification
-- Privacy: GDPR-compliant with user consent tracking
-- ==============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_user_identity_correlation (
    -- Primary identification
    correlation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL,
    website_id UUID,
    
    -- WhatsApp identity
    wa_phone VARCHAR(20) NOT NULL,
    wa_contact_name VARCHAR(255),
    
    -- Umami user identifiers
    umami_user_id VARCHAR(36),
    umami_distinct_id VARCHAR(50),
    umami_session_id UUID,
    
    -- Correlation metadata
    confidence_score DECIMAL(3,2) NOT NULL DEFAULT 0.00
        CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
    
    correlation_method VARCHAR(50) NOT NULL
        CHECK (correlation_method IN ('phone', 'email', 'session', 'manual', 'ml_model', 'user_agent')),
    
    -- Supporting evidence
    correlation_evidence JSONB DEFAULT '{}'::jsonb,
    
    -- Verification status
    verified BOOLEAN DEFAULT FALSE,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    
    -- Privacy and consent
    user_consent BOOLEAN DEFAULT FALSE,
    consent_date TIMESTAMPTZ,
    
    -- Active status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT fk_correlation_team 
        FOREIGN KEY (team_id) 
        REFERENCES team(team_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_correlation_website 
        FOREIGN KEY (website_id) 
        REFERENCES website(website_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_correlation_session 
        FOREIGN KEY (umami_session_id) 
        REFERENCES session(session_id) 
        ON DELETE SET NULL,
    
    CONSTRAINT fk_correlation_verified_by 
        FOREIGN KEY (verified_by) 
        REFERENCES "user"(user_id) 
        ON DELETE SET NULL,
    
    -- Only one verified correlation per WhatsApp phone and umami user per team
    CONSTRAINT unique_verified_correlation 
        UNIQUE (team_id, wa_phone, umami_user_id) 
        WHERE verified = TRUE AND is_active = TRUE
);

COMMENT ON TABLE whatsapp_user_identity_correlation IS 'Links WhatsApp users to umami users for cross-channel analytics';
COMMENT ON COLUMN whatsapp_user_identity_correlation.confidence_score IS 'Correlation confidence from 0.00 to 1.00';
COMMENT ON COLUMN whatsapp_user_identity_correlation.correlation_method IS 'Method used to establish correlation';
COMMENT ON COLUMN whatsapp_user_identity_correlation.correlation_evidence IS 'JSONB containing supporting evidence for correlation';
COMMENT ON COLUMN whatsapp_user_identity_correlation.verified IS 'Whether correlation has been manually verified by admin';
COMMENT ON COLUMN whatsapp_user_identity_correlation.user_consent IS 'Whether user has consented to data correlation (GDPR)';

-- ==============================================================================
-- Update Timestamp Trigger Function
-- ==============================================================================
-- Purpose: Automatically update updated_at timestamp on row modification
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_whatsapp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_whatsapp_updated_at() IS 'Trigger function to automatically update updated_at timestamp';

-- ==============================================================================
-- Apply Update Timestamp Triggers
-- ==============================================================================

CREATE TRIGGER trigger_whatsapp_session_updated_at
    BEFORE UPDATE ON whatsapp_session
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_updated_at();

CREATE TRIGGER trigger_whatsapp_conversation_updated_at
    BEFORE UPDATE ON whatsapp_conversation
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_updated_at();

CREATE TRIGGER trigger_whatsapp_correlation_updated_at
    BEFORE UPDATE ON whatsapp_user_identity_correlation
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_updated_at();

-- ==============================================================================
-- Message Count Trigger Function
-- ==============================================================================
-- Purpose: Automatically update message_count in conversation when messages are added
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_conversation_message_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Update message count and last_message_at for the conversation
    UPDATE whatsapp_conversation
    SET 
        message_count = message_count + 1,
        last_message_at = NEW.timestamp,
        updated_at = NOW()
    WHERE conversation_id = NEW.conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_conversation_message_count() IS 'Automatically updates conversation message count and last message timestamp';

CREATE TRIGGER trigger_update_conversation_on_message
    AFTER INSERT ON whatsapp_message
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_message_count();

-- ==============================================================================
-- Initial Data / Configuration
-- ==============================================================================
-- Purpose: Insert any required initial configuration or reference data
-- ==============================================================================

-- None required for initial setup

-- ==============================================================================
-- Migration Complete
-- ==============================================================================

-- Grant permissions (adjust based on your user/role setup)
-- GRANT ALL ON whatsapp_session TO your_app_user;
-- GRANT ALL ON whatsapp_conversation TO your_app_user;
-- GRANT ALL ON whatsapp_message TO your_app_user;
-- GRANT ALL ON whatsapp_event TO your_app_user;
-- GRANT ALL ON whatsapp_user_identity_correlation TO your_app_user;

-- Log migration success
DO $$
BEGIN
    RAISE NOTICE '✓ WhatsApp schema migration 001 completed successfully';
    RAISE NOTICE '  - Created 5 core tables';
    RAISE NOTICE '  - Created 3 trigger functions';
    RAISE NOTICE '  - Established foreign key relationships';
    RAISE NOTICE '  - Ready for RLS policies (migration 002)';
END $$;