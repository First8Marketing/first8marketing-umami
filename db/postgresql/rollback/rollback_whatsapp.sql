-- ==============================================================================
-- WhatsApp Analytics Integration - Complete Rollback Script
-- ==============================================================================
-- Description: Safely removes all WhatsApp integration components
-- Version: 1.0.0
-- Date: 2025-11-23
-- PostgreSQL Version: 17+
--
-- WARNING: This script will permanently delete all WhatsApp data and schema objects
-- 
-- Rollback Order:
--   1. Drop triggers
--   2. Drop functions
--   3. Drop indexes
--   4. Drop RLS policies and disable RLS
--   5. Drop tables (respecting foreign key dependencies)
--   6. Clean up extensions (if no longer needed)
--
-- Usage:
--   psql -U your_user -d your_database -f rollback_whatsapp.sql
--
-- Backup Recommendation:
--   pg_dump -U your_user -d your_database --schema-only -t 'whatsapp_*' > whatsapp_schema_backup.sql
--   pg_dump -U your_user -d your_database --data-only -t 'whatsapp_*' > whatsapp_data_backup.sql
-- ==============================================================================

\set ON_ERROR_STOP on

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'WhatsApp Integration Rollback Starting';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'WARNING: This will delete all WhatsApp data!';
    RAISE NOTICE 'Timestamp: %', NOW();
    RAISE NOTICE '';
END $$;

-- ==============================================================================
-- Section 1: Drop Triggers
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Step 1: Dropping triggers...';
END $$;

-- Drop triggers from whatsapp_session
DROP TRIGGER IF EXISTS trigger_whatsapp_session_updated_at ON whatsapp_session CASCADE;
DROP TRIGGER IF EXISTS trigger_validate_session_phone ON whatsapp_session CASCADE;
DROP TRIGGER IF EXISTS trigger_audit_session_changes ON whatsapp_session CASCADE;

-- Drop triggers from whatsapp_conversation
DROP TRIGGER IF EXISTS trigger_whatsapp_conversation_updated_at ON whatsapp_conversation CASCADE;
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON whatsapp_conversation CASCADE;

-- Drop triggers from whatsapp_message
DROP TRIGGER IF EXISTS trigger_validate_message ON whatsapp_message CASCADE;
DROP TRIGGER IF EXISTS trigger_update_unread_count ON whatsapp_message CASCADE;

-- Drop triggers from whatsapp_user_identity_correlation
DROP TRIGGER IF EXISTS trigger_whatsapp_correlation_updated_at ON whatsapp_user_identity_correlation CASCADE;

DO $$
BEGIN
    RAISE NOTICE '✓ Triggers dropped';
END $$;

-- ==============================================================================
-- Section 2: Drop Functions
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Step 2: Dropping functions...';
END $$;

-- Drop trigger functions
DROP FUNCTION IF EXISTS update_whatsapp_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_conversation_message_count() CASCADE;
DROP FUNCTION IF EXISTS whatsapp_validate_phone_number() CASCADE;
DROP FUNCTION IF EXISTS whatsapp_validate_message() CASCADE;
DROP FUNCTION IF EXISTS whatsapp_update_unread_count() CASCADE;
DROP FUNCTION IF EXISTS whatsapp_audit_state_changes() CASCADE;

-- Drop RLS helper functions
DROP FUNCTION IF EXISTS whatsapp_current_team_id() CASCADE;
DROP FUNCTION IF EXISTS whatsapp_current_user_role() CASCADE;
DROP FUNCTION IF EXISTS whatsapp_is_admin() CASCADE;

-- Drop analytics functions
DROP FUNCTION IF EXISTS whatsapp_conversation_response_metrics(UUID) CASCADE;
DROP FUNCTION IF EXISTS whatsapp_team_message_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS whatsapp_funnel_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS whatsapp_conversation_heatmap(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS whatsapp_active_sessions_summary(UUID) CASCADE;

-- Drop correlation functions
DROP FUNCTION IF EXISTS whatsapp_calculate_correlation_score(VARCHAR, JSONB) CASCADE;
DROP FUNCTION IF EXISTS whatsapp_find_potential_correlations(UUID, VARCHAR, NUMERIC) CASCADE;

-- Drop maintenance functions
DROP FUNCTION IF EXISTS whatsapp_archive_old_messages(INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS whatsapp_cleanup_expired_qr_codes() CASCADE;
DROP FUNCTION IF EXISTS whatsapp_recalculate_conversation_metrics(UUID) CASCADE;

-- Drop utility functions
DROP FUNCTION IF EXISTS whatsapp_session_health_report(UUID) CASCADE;
DROP FUNCTION IF EXISTS whatsapp_analyze_index_usage() CASCADE;
DROP FUNCTION IF EXISTS whatsapp_find_unused_indexes() CASCADE;
DROP FUNCTION IF EXISTS whatsapp_table_sizes() CASCADE;
DROP FUNCTION IF EXISTS whatsapp_audit_rls_policies() CASCADE;

DO $$
BEGIN
    RAISE NOTICE '✓ Functions dropped';
END $$;

-- ==============================================================================
-- Section 3: Drop Indexes
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Step 3: Dropping indexes...';
END $$;

-- Drop whatsapp_session indexes
DROP INDEX IF EXISTS idx_wa_session_team_id CASCADE;
DROP INDEX IF EXISTS idx_wa_session_status CASCADE;
DROP INDEX IF EXISTS idx_wa_session_team_status CASCADE;
DROP INDEX IF EXISTS idx_wa_session_phone CASCADE;
DROP INDEX IF EXISTS idx_wa_session_active CASCADE;
DROP INDEX IF EXISTS idx_wa_session_created_at CASCADE;
DROP INDEX IF EXISTS idx_wa_session_updated_at CASCADE;
DROP INDEX IF EXISTS idx_wa_session_data_gin CASCADE;

-- Drop whatsapp_conversation indexes
DROP INDEX IF EXISTS idx_wa_conv_team_id CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_session_id CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_chat_id CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_team_status CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_team_last_msg CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_contact_phone CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_stage CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_team_stage CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_assigned_to CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_open CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_unread CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_tags_gin CASCADE;
DROP INDEX IF EXISTS idx_wa_conv_metadata_gin CASCADE;

-- Drop whatsapp_message indexes
DROP INDEX IF EXISTS idx_wa_msg_team_id CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_session_id CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_conversation_id CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_wa_id CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_chat_id CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_team_timestamp CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_conv_timestamp CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_session_timestamp CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_direction CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_team_dir_time CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_type CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_team_type_time CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_from_phone CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_to_phone CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_unread CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_media CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_quoted CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_reactions CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_reactions_gin CASCADE;
DROP INDEX IF EXISTS idx_wa_msg_metadata_gin CASCADE;

-- Drop whatsapp_event indexes
DROP INDEX IF EXISTS idx_wa_event_team_id CASCADE;
DROP INDEX IF EXISTS idx_wa_event_session_id CASCADE;
DROP INDEX IF EXISTS idx_wa_event_type CASCADE;
DROP INDEX IF EXISTS idx_wa_event_team_type_time CASCADE;
DROP INDEX IF EXISTS idx_wa_event_timestamp CASCADE;
DROP INDEX IF EXISTS idx_wa_event_session_time CASCADE;
DROP INDEX IF EXISTS idx_wa_event_unprocessed CASCADE;
DROP INDEX IF EXISTS idx_wa_event_failed CASCADE;
DROP INDEX IF EXISTS idx_wa_event_unsent_analytics CASCADE;
DROP INDEX IF EXISTS idx_wa_event_message_id CASCADE;
DROP INDEX IF EXISTS idx_wa_event_conversation_id CASCADE;
DROP INDEX IF EXISTS idx_wa_event_data_gin CASCADE;

-- Drop whatsapp_user_identity_correlation indexes
DROP INDEX IF EXISTS idx_wa_corr_team_id CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_website_id CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_phone CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_team_phone CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_umami_user CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_distinct_id CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_session_id CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_confidence CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_team_confidence CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_method CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_unverified CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_verified CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_verified_by CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_created_at CASCADE;
DROP INDEX IF EXISTS idx_wa_corr_evidence_gin CASCADE;

DO $$
BEGIN
    RAISE NOTICE '✓ Indexes dropped';
END $$;

-- ==============================================================================
-- Section 4: Drop RLS Policies and Disable RLS
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Step 4: Dropping RLS policies and disabling RLS...';
END $$;

-- Drop policies from whatsapp_session
DROP POLICY IF EXISTS whatsapp_session_select_policy ON whatsapp_session CASCADE;
DROP POLICY IF EXISTS whatsapp_session_insert_policy ON whatsapp_session CASCADE;
DROP POLICY IF EXISTS whatsapp_session_update_policy ON whatsapp_session CASCADE;
DROP POLICY IF EXISTS whatsapp_session_delete_policy ON whatsapp_session CASCADE;

-- Drop policies from whatsapp_conversation
DROP POLICY IF EXISTS whatsapp_conversation_select_policy ON whatsapp_conversation CASCADE;
DROP POLICY IF EXISTS whatsapp_conversation_insert_policy ON whatsapp_conversation CASCADE;
DROP POLICY IF EXISTS whatsapp_conversation_update_policy ON whatsapp_conversation CASCADE;
DROP POLICY IF EXISTS whatsapp_conversation_delete_policy ON whatsapp_conversation CASCADE;

-- Drop policies from whatsapp_message
DROP POLICY IF EXISTS whatsapp_message_select_policy ON whatsapp_message CASCADE;
DROP POLICY IF EXISTS whatsapp_message_insert_policy ON whatsapp_message CASCADE;
DROP POLICY IF EXISTS whatsapp_message_update_policy ON whatsapp_message CASCADE;
DROP POLICY IF EXISTS whatsapp_message_delete_policy ON whatsapp_message CASCADE;

-- Drop policies from whatsapp_event
DROP POLICY IF EXISTS whatsapp_event_select_policy ON whatsapp_event CASCADE;
DROP POLICY IF EXISTS whatsapp_event_insert_policy ON whatsapp_event CASCADE;
DROP POLICY IF EXISTS whatsapp_event_update_policy ON whatsapp_event CASCADE;
DROP POLICY IF EXISTS whatsapp_event_delete_policy ON whatsapp_event CASCADE;

-- Drop policies from whatsapp_user_identity_correlation
DROP POLICY IF EXISTS whatsapp_correlation_select_policy ON whatsapp_user_identity_correlation CASCADE;
DROP POLICY IF EXISTS whatsapp_correlation_insert_policy ON whatsapp_user_identity_correlation CASCADE;
DROP POLICY IF EXISTS whatsapp_correlation_update_policy ON whatsapp_user_identity_correlation CASCADE;
DROP POLICY IF EXISTS whatsapp_correlation_delete_policy ON whatsapp_user_identity_correlation CASCADE;

-- Disable RLS on tables
ALTER TABLE IF EXISTS whatsapp_session DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_conversation DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_message DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_event DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_user_identity_correlation DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    RAISE NOTICE '✓ RLS policies dropped and RLS disabled';
END $$;

-- ==============================================================================
-- Section 5: Drop Tables (Respecting Dependencies)
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Step 5: Dropping tables...';
END $$;

-- Drop tables in reverse order of dependencies
-- Child tables first (those with foreign keys to parent tables)

DROP TABLE IF EXISTS whatsapp_event CASCADE;
DO $$ BEGIN RAISE NOTICE '  ✓ Dropped whatsapp_event'; END $$;

DROP TABLE IF EXISTS whatsapp_message CASCADE;
DO $$ BEGIN RAISE NOTICE '  ✓ Dropped whatsapp_message'; END $$;

DROP TABLE IF EXISTS whatsapp_user_identity_correlation CASCADE;
DO $$ BEGIN RAISE NOTICE '  ✓ Dropped whatsapp_user_identity_correlation'; END $$;

DROP TABLE IF EXISTS whatsapp_conversation CASCADE;
DO $$ BEGIN RAISE NOTICE '  ✓ Dropped whatsapp_conversation'; END $$;

DROP TABLE IF EXISTS whatsapp_session CASCADE;
DO $$ BEGIN RAISE NOTICE '  ✓ Dropped whatsapp_session'; END $$;

DO $$
BEGIN
    RAISE NOTICE '✓ All tables dropped';
END $$;

-- ==============================================================================
-- Section 6: Verify Cleanup
-- ==============================================================================

DO $$
DECLARE
    remaining_tables INTEGER;
    remaining_functions INTEGER;
    remaining_indexes INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Step 6: Verifying cleanup...';
    
    -- Check for remaining tables
    SELECT COUNT(*) INTO remaining_tables
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename LIKE 'whatsapp_%';
    
    -- Check for remaining functions
    SELECT COUNT(*) INTO remaining_functions
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND p.proname LIKE 'whatsapp_%';
    
    -- Check for remaining indexes
    SELECT COUNT(*) INTO remaining_indexes
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND (tablename LIKE 'whatsapp_%' OR indexname LIKE 'idx_wa_%');
    
    RAISE NOTICE '  Tables remaining: %', remaining_tables;
    RAISE NOTICE '  Functions remaining: %', remaining_functions;
    RAISE NOTICE '  Indexes remaining: %', remaining_indexes;
    
    IF remaining_tables > 0 OR remaining_functions > 0 OR remaining_indexes > 0 THEN
        RAISE WARNING 'Some WhatsApp objects may still exist!';
    ELSE
        RAISE NOTICE '✓ Complete cleanup verified';
    END IF;
END $$;

-- ==============================================================================
-- Section 7: Optional Extension Cleanup
-- ==============================================================================
-- Uncomment only if these extensions are no longer needed by any other part of the database

/*
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Step 7: Extension cleanup (skipped by default)...';
    RAISE NOTICE '  To remove extensions, uncomment the DROP EXTENSION commands';
    RAISE NOTICE '  WARNING: Only do this if no other tables use these extensions!';
END $$;

-- DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
-- DROP EXTENSION IF EXISTS "pgcrypto" CASCADE;
*/

-- ==============================================================================
-- Rollback Complete
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'WhatsApp Integration Rollback Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Timestamp: %', NOW();
    RAISE NOTICE '';
    RAISE NOTICE '📋 Summary:';
    RAISE NOTICE '  ✓ All triggers dropped';
    RAISE NOTICE '  ✓ All functions dropped';
    RAISE NOTICE '  ✓ All indexes dropped';
    RAISE NOTICE '  ✓ All RLS policies dropped';
    RAISE NOTICE '  ✓ All tables dropped';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  IMPORTANT:';
    RAISE NOTICE '  - All WhatsApp data has been permanently deleted';
    RAISE NOTICE '  - Restore from backup if this was unintended';
    RAISE NOTICE '  - Review application code to remove WhatsApp references';
    RAISE NOTICE '';
END $$;

-- ==============================================================================
-- Post-Rollback Recommendations
-- ==============================================================================
/*
After running this rollback script:

1. Verify Application Code:
   - Remove WhatsApp service code
   - Remove API endpoints related to WhatsApp
   - Remove frontend components for WhatsApp features
   - Update configuration files

2. Clean Up Related Files:
   - Remove migration files (001-004) if no longer needed
   - Archive documentation for future reference
   - Update deployment scripts

3. Database Maintenance:
   - Run VACUUM ANALYZE to reclaim space
   - Update table statistics: ANALYZE;
   - Check for orphaned data in related tables

4. Monitoring:
   - Remove WhatsApp-related monitoring queries
   - Update dashboards
   - Clean up alert configurations

5. Backup Strategy:
   - Keep a final backup of WhatsApp data for compliance
   - Update backup procedures to exclude WhatsApp tables
   - Document the rollback in your change log

To restore (if needed):
   psql -U your_user -d your_database -f whatsapp_schema_backup.sql
   psql -U your_user -d your_database -f whatsapp_data_backup.sql
   
   Then re-run migrations in order:
   001_whatsapp_schema.sql
   002_whatsapp_rls_policies.sql
   003_whatsapp_indexes.sql
   004_whatsapp_functions_triggers.sql
*/