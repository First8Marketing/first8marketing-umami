-- ==============================================================================
-- WhatsApp Analytics Integration - Performance Indexes
-- ==============================================================================
-- Description: Creates comprehensive indexes for optimal query performance
-- Version: 1.0.0
-- Date: 2025-11-23
-- PostgreSQL Version: 17+
-- Dependencies: 001_whatsapp_schema.sql, 002_whatsapp_rls_policies.sql
--
-- Index Strategy:
--   - Composite indexes for common query patterns
--   - Time-based indexes for analytics queries
--   - Foreign key indexes for joins
--   - Partial indexes for filtered queries
--   - GIN indexes for JSONB and array columns
--   - Text search indexes where applicable
--
-- Performance Target: < 50ms for common queries
-- ==============================================================================

-- ==============================================================================
-- Indexes for: whatsapp_session
-- ==============================================================================
-- Purpose: Optimize session lookup, tenant filtering, and status queries
-- ==============================================================================

-- Primary tenant isolation index (critical for RLS)
CREATE INDEX IF NOT EXISTS idx_wa_session_team_id 
    ON whatsapp_session(team_id) 
    WHERE deleted_at IS NULL;

-- Status-based queries (active sessions, failed sessions)
CREATE INDEX IF NOT EXISTS idx_wa_session_status 
    ON whatsapp_session(status) 
    WHERE deleted_at IS NULL;

-- Composite: Team + Status (most common filtered query)
CREATE INDEX IF NOT EXISTS idx_wa_session_team_status 
    ON whatsapp_session(team_id, status) 
    WHERE deleted_at IS NULL;

-- Phone number lookup (for reconnection)
CREATE INDEX IF NOT EXISTS idx_wa_session_phone 
    ON whatsapp_session(phone_number) 
    WHERE deleted_at IS NULL;

-- Active sessions only (partial index)
CREATE INDEX IF NOT EXISTS idx_wa_session_active 
    ON whatsapp_session(team_id, last_seen_at DESC) 
    WHERE status = 'active' AND deleted_at IS NULL;

-- Time-based queries (recently created/updated)
CREATE INDEX IF NOT EXISTS idx_wa_session_created_at 
    ON whatsapp_session(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_session_updated_at 
    ON whatsapp_session(updated_at DESC);

-- JSONB index for session_data queries (if needed)
CREATE INDEX IF NOT EXISTS idx_wa_session_data_gin 
    ON whatsapp_session USING GIN (session_data);

COMMENT ON INDEX idx_wa_session_team_id IS 'Primary tenant isolation index';
COMMENT ON INDEX idx_wa_session_team_status IS 'Composite index for filtered session queries';
COMMENT ON INDEX idx_wa_session_active IS 'Partial index for active sessions only';

-- ==============================================================================
-- Indexes for: whatsapp_conversation
-- ==============================================================================
-- Purpose: Optimize conversation list, filtering, and metrics
-- ==============================================================================

-- Primary tenant isolation index
CREATE INDEX IF NOT EXISTS idx_wa_conv_team_id 
    ON whatsapp_conversation(team_id);

-- Session-based conversation lookup
CREATE INDEX IF NOT EXISTS idx_wa_conv_session_id 
    ON whatsapp_conversation(session_id);

-- Chat ID lookup (unique per session, but indexed for joins)
CREATE INDEX IF NOT EXISTS idx_wa_conv_chat_id 
    ON whatsapp_conversation(chat_id);

-- Composite: Team + Status (conversation list with filter)
CREATE INDEX IF NOT EXISTS idx_wa_conv_team_status 
    ON whatsapp_conversation(team_id, status);

-- Composite: Team + Last Message Time (sorted conversation list)
CREATE INDEX IF NOT EXISTS idx_wa_conv_team_last_msg 
    ON whatsapp_conversation(team_id, last_message_at DESC);

-- Contact phone lookup
CREATE INDEX IF NOT EXISTS idx_wa_conv_contact_phone 
    ON whatsapp_conversation(contact_phone);

-- Stage tracking (funnel analytics)
CREATE INDEX IF NOT EXISTS idx_wa_conv_stage 
    ON whatsapp_conversation(stage) 
    WHERE stage IS NOT NULL;

-- Composite: Team + Stage (funnel queries)
CREATE INDEX IF NOT EXISTS idx_wa_conv_team_stage 
    ON whatsapp_conversation(team_id, stage) 
    WHERE stage IS NOT NULL;

-- Assignment queries
CREATE INDEX IF NOT EXISTS idx_wa_conv_assigned_to 
    ON whatsapp_conversation(assigned_to) 
    WHERE assigned_to IS NOT NULL;

-- Open conversations only (partial index for performance)
CREATE INDEX IF NOT EXISTS idx_wa_conv_open 
    ON whatsapp_conversation(team_id, last_message_at DESC) 
    WHERE status = 'open';

-- Unread conversations (partial index)
CREATE INDEX IF NOT EXISTS idx_wa_conv_unread 
    ON whatsapp_conversation(team_id, unread_count, last_message_at DESC) 
    WHERE unread_count > 0;

-- GIN index for tags array
CREATE INDEX IF NOT EXISTS idx_wa_conv_tags_gin 
    ON whatsapp_conversation USING GIN (tags);

-- JSONB index for metadata
CREATE INDEX IF NOT EXISTS idx_wa_conv_metadata_gin 
    ON whatsapp_conversation USING GIN (metadata);

COMMENT ON INDEX idx_wa_conv_team_last_msg IS 'Composite index for sorted conversation list';
COMMENT ON INDEX idx_wa_conv_open IS 'Partial index for open conversations (most common query)';
COMMENT ON INDEX idx_wa_conv_unread IS 'Partial index for unread conversations';

-- ==============================================================================
-- Indexes for: whatsapp_message
-- ==============================================================================
-- Purpose: Optimize message queries, threading, and analytics
-- HIGH-VOLUME TABLE: Index strategy is critical
-- ==============================================================================

-- Primary tenant isolation index
CREATE INDEX IF NOT EXISTS idx_wa_msg_team_id 
    ON whatsapp_message(team_id);

-- Session-based message queries
CREATE INDEX IF NOT EXISTS idx_wa_msg_session_id 
    ON whatsapp_message(session_id);

-- Conversation thread queries (most common)
CREATE INDEX IF NOT EXISTS idx_wa_msg_conversation_id 
    ON whatsapp_message(conversation_id);

-- WhatsApp message ID lookup (for updates)
CREATE INDEX IF NOT EXISTS idx_wa_msg_wa_id 
    ON whatsapp_message(wa_message_id);

-- Chat ID lookup (for real-time message delivery)
CREATE INDEX IF NOT EXISTS idx_wa_msg_chat_id 
    ON whatsapp_message(chat_id);

-- Composite: Team + Timestamp (time-series analytics)
CREATE INDEX IF NOT EXISTS idx_wa_msg_team_timestamp 
    ON whatsapp_message(team_id, timestamp DESC);

-- Composite: Conversation + Timestamp (message thread)
CREATE INDEX IF NOT EXISTS idx_wa_msg_conv_timestamp 
    ON whatsapp_message(conversation_id, timestamp ASC);

-- Composite: Session + Timestamp
CREATE INDEX IF NOT EXISTS idx_wa_msg_session_timestamp 
    ON whatsapp_message(session_id, timestamp DESC);

-- Direction-based queries (inbound vs outbound analytics)
CREATE INDEX IF NOT EXISTS idx_wa_msg_direction 
    ON whatsapp_message(direction);

-- Composite: Team + Direction + Timestamp
CREATE INDEX IF NOT EXISTS idx_wa_msg_team_dir_time 
    ON whatsapp_message(team_id, direction, timestamp DESC);

-- Message type filtering
CREATE INDEX IF NOT EXISTS idx_wa_msg_type 
    ON whatsapp_message(message_type);

-- Composite: Team + Type + Timestamp (media analytics)
CREATE INDEX IF NOT EXISTS idx_wa_msg_team_type_time 
    ON whatsapp_message(team_id, message_type, timestamp DESC);

-- From/To phone lookups (contact history)
CREATE INDEX IF NOT EXISTS idx_wa_msg_from_phone 
    ON whatsapp_message(from_phone);

CREATE INDEX IF NOT EXISTS idx_wa_msg_to_phone 
    ON whatsapp_message(to_phone);

-- Unread messages (partial index for performance)
CREATE INDEX IF NOT EXISTS idx_wa_msg_unread 
    ON whatsapp_message(team_id, conversation_id, timestamp DESC) 
    WHERE is_read = FALSE;

-- Media messages only (partial index)
CREATE INDEX IF NOT EXISTS idx_wa_msg_media 
    ON whatsapp_message(team_id, message_type, timestamp DESC) 
    WHERE message_type IN ('image', 'video', 'audio', 'document');

-- Replied messages (threading)
CREATE INDEX IF NOT EXISTS idx_wa_msg_quoted 
    ON whatsapp_message(quoted_msg_id) 
    WHERE quoted_msg_id IS NOT NULL;

-- Messages with reactions (partial index)
CREATE INDEX IF NOT EXISTS idx_wa_msg_reactions 
    ON whatsapp_message(team_id, timestamp DESC) 
    WHERE has_reactions = TRUE;

-- GIN index for reactions JSONB
CREATE INDEX IF NOT EXISTS idx_wa_msg_reactions_gin 
    ON whatsapp_message USING GIN (reactions);

-- GIN index for metadata JSONB
CREATE INDEX IF NOT EXISTS idx_wa_msg_metadata_gin 
    ON whatsapp_message USING GIN (metadata);

-- Full-text search on message body (optional, use if needed)
-- CREATE INDEX IF NOT EXISTS idx_wa_msg_body_fts 
--     ON whatsapp_message USING GIN (to_tsvector('english', message_body));

COMMENT ON INDEX idx_wa_msg_conv_timestamp IS 'Critical index for message thread queries';
COMMENT ON INDEX idx_wa_msg_team_timestamp IS 'Time-series analytics index';
COMMENT ON INDEX idx_wa_msg_unread IS 'Partial index for unread message queries';
COMMENT ON INDEX idx_wa_msg_media IS 'Partial index for media message analytics';

-- ==============================================================================
-- Indexes for: whatsapp_event
-- ==============================================================================
-- Purpose: Optimize event processing and analytics queries
-- ==============================================================================

-- Primary tenant isolation index
CREATE INDEX IF NOT EXISTS idx_wa_event_team_id 
    ON whatsapp_event(team_id);

-- Session-based event queries
CREATE INDEX IF NOT EXISTS idx_wa_event_session_id 
    ON whatsapp_event(session_id);

-- Event type filtering
CREATE INDEX IF NOT EXISTS idx_wa_event_type 
    ON whatsapp_event(event_type);

-- Composite: Team + Event Type + Timestamp
CREATE INDEX IF NOT EXISTS idx_wa_event_team_type_time 
    ON whatsapp_event(team_id, event_type, timestamp DESC);

-- Timestamp-based queries (event timeline)
CREATE INDEX IF NOT EXISTS idx_wa_event_timestamp 
    ON whatsapp_event(timestamp DESC);

-- Composite: Session + Timestamp
CREATE INDEX IF NOT EXISTS idx_wa_event_session_time 
    ON whatsapp_event(session_id, timestamp DESC);

-- Unprocessed events (partial index for queue processing)
CREATE INDEX IF NOT EXISTS idx_wa_event_unprocessed 
    ON whatsapp_event(team_id, created_at ASC) 
    WHERE processed = FALSE;

-- Failed processing (partial index for retry logic)
CREATE INDEX IF NOT EXISTS idx_wa_event_failed 
    ON whatsapp_event(team_id, created_at ASC) 
    WHERE processed = FALSE AND processing_error IS NOT NULL;

-- Events not sent to analytics (partial index)
CREATE INDEX IF NOT EXISTS idx_wa_event_unsent_analytics 
    ON whatsapp_event(team_id, timestamp ASC) 
    WHERE sent_to_analytics = FALSE AND processed = TRUE;

-- Message-related events
CREATE INDEX IF NOT EXISTS idx_wa_event_message_id 
    ON whatsapp_event(message_id) 
    WHERE message_id IS NOT NULL;

-- Conversation-related events
CREATE INDEX IF NOT EXISTS idx_wa_event_conversation_id 
    ON whatsapp_event(conversation_id) 
    WHERE conversation_id IS NOT NULL;

-- GIN index for event_data JSONB
CREATE INDEX IF NOT EXISTS idx_wa_event_data_gin 
    ON whatsapp_event USING GIN (event_data);

COMMENT ON INDEX idx_wa_event_unprocessed IS 'Partial index for event processing queue';
COMMENT ON INDEX idx_wa_event_unsent_analytics IS 'Partial index for analytics pipeline';

-- ==============================================================================
-- Indexes for: whatsapp_user_identity_correlation
-- ==============================================================================
-- Purpose: Optimize user correlation lookups and verification
-- ==============================================================================

-- Primary tenant isolation index
CREATE INDEX IF NOT EXISTS idx_wa_corr_team_id 
    ON whatsapp_user_identity_correlation(team_id);

-- Website-specific correlations
CREATE INDEX IF NOT EXISTS idx_wa_corr_website_id 
    ON whatsapp_user_identity_correlation(website_id) 
    WHERE website_id IS NOT NULL;

-- WhatsApp phone lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_wa_corr_phone 
    ON whatsapp_user_identity_correlation(wa_phone);

-- Composite: Team + Phone (primary correlation lookup)
CREATE INDEX IF NOT EXISTS idx_wa_corr_team_phone 
    ON whatsapp_user_identity_correlation(team_id, wa_phone);

-- Umami user ID lookup
CREATE INDEX IF NOT EXISTS idx_wa_corr_umami_user 
    ON whatsapp_user_identity_correlation(umami_user_id) 
    WHERE umami_user_id IS NOT NULL;

-- Umami distinct ID lookup
CREATE INDEX IF NOT EXISTS idx_wa_corr_distinct_id 
    ON whatsapp_user_identity_correlation(umami_distinct_id) 
    WHERE umami_distinct_id IS NOT NULL;

-- Umami session ID lookup
CREATE INDEX IF NOT EXISTS idx_wa_corr_session_id 
    ON whatsapp_user_identity_correlation(umami_session_id) 
    WHERE umami_session_id IS NOT NULL;

-- Confidence score filtering (high confidence correlations)
CREATE INDEX IF NOT EXISTS idx_wa_corr_confidence 
    ON whatsapp_user_identity_correlation(confidence_score DESC);

-- Composite: Team + Confidence (high-quality correlations)
CREATE INDEX IF NOT EXISTS idx_wa_corr_team_confidence 
    ON whatsapp_user_identity_correlation(team_id, confidence_score DESC) 
    WHERE confidence_score > 0.7;

-- Correlation method filtering
CREATE INDEX IF NOT EXISTS idx_wa_corr_method 
    ON whatsapp_user_identity_correlation(correlation_method);

-- Unverified correlations (partial index for admin review queue)
CREATE INDEX IF NOT EXISTS idx_wa_corr_unverified 
    ON whatsapp_user_identity_correlation(team_id, confidence_score DESC, created_at DESC) 
    WHERE verified = FALSE AND is_active = TRUE;

-- Verified correlations only (partial index)
CREATE INDEX IF NOT EXISTS idx_wa_corr_verified 
    ON whatsapp_user_identity_correlation(team_id, wa_phone, umami_user_id) 
    WHERE verified = TRUE AND is_active = TRUE;

-- Verification tracking
CREATE INDEX IF NOT EXISTS idx_wa_corr_verified_by 
    ON whatsapp_user_identity_correlation(verified_by, verified_at DESC) 
    WHERE verified = TRUE;

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_wa_corr_created_at 
    ON whatsapp_user_identity_correlation(created_at DESC);

-- GIN index for correlation_evidence JSONB
CREATE INDEX IF NOT EXISTS idx_wa_corr_evidence_gin 
    ON whatsapp_user_identity_correlation USING GIN (correlation_evidence);

COMMENT ON INDEX idx_wa_corr_team_phone IS 'Primary correlation lookup index';
COMMENT ON INDEX idx_wa_corr_unverified IS 'Partial index for admin verification queue';
COMMENT ON INDEX idx_wa_corr_team_confidence IS 'High-confidence correlations only';

-- ==============================================================================
-- Index Statistics and Maintenance
-- ==============================================================================
-- Purpose: Helper functions for index monitoring and maintenance
-- ==============================================================================

-- Function to analyze index usage statistics
CREATE OR REPLACE FUNCTION whatsapp_analyze_index_usage()
RETURNS TABLE(
    schemaname TEXT,
    tablename TEXT,
    indexname TEXT,
    idx_scan BIGINT,
    idx_tup_read BIGINT,
    idx_tup_fetch BIGINT,
    size_mb NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.schemaname::TEXT,
        s.tablename::TEXT,
        s.indexrelname::TEXT,
        s.idx_scan,
        s.idx_tup_read,
        s.idx_tup_fetch,
        ROUND(pg_relation_size(s.indexrelid) / 1024.0 / 1024.0, 2) AS size_mb
    FROM pg_stat_user_indexes s
    WHERE s.schemaname = 'public'
    AND (s.tablename LIKE 'whatsapp_%')
    ORDER BY s.idx_scan, size_mb DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION whatsapp_analyze_index_usage() 
    IS 'Analyzes index usage statistics for WhatsApp tables';

-- Function to identify unused indexes
CREATE OR REPLACE FUNCTION whatsapp_find_unused_indexes()
RETURNS TABLE(
    schemaname TEXT,
    tablename TEXT,
    indexname TEXT,
    size_mb NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.schemaname::TEXT,
        s.tablename::TEXT,
        s.indexrelname::TEXT,
        ROUND(pg_relation_size(s.indexrelid) / 1024.0 / 1024.0, 2) AS size_mb
    FROM pg_stat_user_indexes s
    WHERE s.schemaname = 'public'
    AND (s.tablename LIKE 'whatsapp_%')
    AND s.idx_scan = 0
    AND s.indexrelname NOT LIKE '%_pkey'
    ORDER BY size_mb DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION whatsapp_find_unused_indexes() 
    IS 'Identifies unused indexes that may be candidates for removal';

-- Function to get table and index sizes
CREATE OR REPLACE FUNCTION whatsapp_table_sizes()
RETURNS TABLE(
    tablename TEXT,
    table_size_mb NUMERIC,
    indexes_size_mb NUMERIC,
    total_size_mb NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.relname::TEXT,
        ROUND(pg_table_size(c.oid) / 1024.0 / 1024.0, 2) AS table_size_mb,
        ROUND(pg_indexes_size(c.oid) / 1024.0 / 1024.0, 2) AS indexes_size_mb,
        ROUND(pg_total_relation_size(c.oid) / 1024.0 / 1024.0, 2) AS total_size_mb
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname LIKE 'whatsapp_%'
    ORDER BY pg_total_relation_size(c.oid) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION whatsapp_table_sizes() 
    IS 'Reports table and index sizes for WhatsApp tables';

-- ==============================================================================
-- Maintenance Recommendations
-- ==============================================================================
/*
Regular Index Maintenance Tasks:

1. Analyze Index Usage (monthly):
   SELECT * FROM whatsapp_analyze_index_usage();

2. Identify Unused Indexes (quarterly):
   SELECT * FROM whatsapp_find_unused_indexes();

3. Monitor Table Sizes (weekly):
   SELECT * FROM whatsapp_table_sizes();

4. Reindex Bloated Indexes (as needed):
   REINDEX INDEX CONCURRENTLY idx_name;

5. Update Statistics (daily via autovacuum or manual):
   ANALYZE whatsapp_message;
   ANALYZE whatsapp_event;

6. Vacuum Tables (autovacuum handles this, but manual if needed):
   VACUUM ANALYZE whatsapp_message;
*/

-- ==============================================================================
-- Performance Testing Queries
-- ==============================================================================
/*
Test these queries to validate index usage with EXPLAIN ANALYZE:

-- 1. Conversation List (should use idx_wa_conv_team_last_msg)
EXPLAIN ANALYZE
SELECT * FROM whatsapp_conversation 
WHERE team_id = 'your-team-id'::uuid 
AND status = 'open'
ORDER BY last_message_at DESC 
LIMIT 50;

-- 2. Message Thread (should use idx_wa_msg_conv_timestamp)
EXPLAIN ANALYZE
SELECT * FROM whatsapp_message 
WHERE conversation_id = 'your-conv-id'::uuid 
ORDER BY timestamp ASC;

-- 3. Recent Events (should use idx_wa_event_team_type_time)
EXPLAIN ANALYZE
SELECT * FROM whatsapp_event 
WHERE team_id = 'your-team-id'::uuid 
AND event_type = 'message_received'
AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- 4. User Correlation Lookup (should use idx_wa_corr_team_phone)
EXPLAIN ANALYZE
SELECT * FROM whatsapp_user_identity_correlation 
WHERE team_id = 'your-team-id'::uuid 
AND wa_phone = '+1234567890';

-- 5. Unread Messages (should use idx_wa_msg_unread)
EXPLAIN ANALYZE
SELECT COUNT(*) FROM whatsapp_message 
WHERE team_id = 'your-team-id'::uuid 
AND is_read = FALSE;
*/

-- ==============================================================================
-- Migration Complete
-- ==============================================================================

DO $$
DECLARE
    index_count INTEGER;
BEGIN
    -- Count created indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND (tablename LIKE 'whatsapp_%');
    
    RAISE NOTICE '✓ WhatsApp indexes migration 003 completed successfully';
    RAISE NOTICE '  - Created comprehensive index strategy';
    RAISE NOTICE '  - Total indexes on WhatsApp tables: %', index_count;
    RAISE NOTICE '  - Includes: B-tree, GIN, and partial indexes';
    RAISE NOTICE '  - Query performance target: < 50ms';
    RAISE NOTICE '  - Ready for functions and triggers (migration 004)';
    RAISE NOTICE '  ';
    RAISE NOTICE '💡 Run whatsapp_analyze_index_usage() to monitor index performance';
END $$;

-- Display table sizes
SELECT * FROM whatsapp_table_sizes();