-- ==============================================================================
-- WhatsApp Analytics Integration - Row-Level Security (RLS) Policies
-- ==============================================================================
-- Description: Implements comprehensive multi-tenant data isolation using RLS
-- Version: 1.0.0
-- Date: 2025-11-23
-- PostgreSQL Version: 17+
-- Dependencies: 001_whatsapp_schema.sql
--
-- Security Model:
--   - Tenant isolation via team_id
--   - Role-based access control (admin, manager, agent, viewer)
--   - Session variable: app.current_team_id
--   - Admin bypass capability
--
-- Roles Supported:
--   - admin: Full CRUD access to all team data
--   - manager: CRUD access except sensitive operations
--   - agent: Read + limited write (messages, conversations)
--   - viewer: Read-only access
-- ==============================================================================

-- ==============================================================================
-- Enable Row-Level Security on All WhatsApp Tables
-- ==============================================================================

ALTER TABLE whatsapp_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_user_identity_correlation ENABLE ROW LEVEL SECURITY;

-- Log RLS enablement
DO $$
BEGIN
    RAISE NOTICE '✓ Row-Level Security enabled on all WhatsApp tables';
END $$;

-- ==============================================================================
-- Helper Function: Get Current Team ID from Session Variable
-- ==============================================================================

CREATE OR REPLACE FUNCTION whatsapp_current_team_id()
RETURNS UUID AS $$
BEGIN
    -- Retrieve team_id from session variable set by application
    -- Application must execute: SET app.current_team_id = '<team_uuid>';
    RETURN current_setting('app.current_team_id', true)::UUID;
EXCEPTION
    WHEN OTHERS THEN
        -- Return NULL if variable not set or invalid
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION whatsapp_current_team_id() IS 'Returns current team_id from session variable for RLS policies';

-- ==============================================================================
-- Helper Function: Get Current User Role from Session Variable
-- ==============================================================================

CREATE OR REPLACE FUNCTION whatsapp_current_user_role()
RETURNS VARCHAR AS $$
BEGIN
    -- Retrieve user role from session variable set by application
    -- Application must execute: SET app.current_user_role = 'admin|manager|agent|viewer';
    RETURN current_setting('app.current_user_role', true)::VARCHAR;
EXCEPTION
    WHEN OTHERS THEN
        -- Return 'viewer' as most restrictive default
        RETURN 'viewer';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION whatsapp_current_user_role() IS 'Returns current user role from session variable for RLS policies';

-- ==============================================================================
-- Helper Function: Check if Current User is Admin
-- ==============================================================================

CREATE OR REPLACE FUNCTION whatsapp_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN whatsapp_current_user_role() = 'admin';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION whatsapp_is_admin() IS 'Returns true if current user has admin role';

-- ==============================================================================
-- RLS Policies for: whatsapp_session
-- ==============================================================================
-- Purpose: Control access to WhatsApp session management
-- Rules:
--   - All users: Can view sessions for their team
--   - Admin/Manager: Can create/update/delete sessions
--   - Agent/Viewer: Read-only access
-- ==============================================================================

-- SELECT Policy: All authenticated users can view their team's sessions
CREATE POLICY whatsapp_session_select_policy ON whatsapp_session
    FOR SELECT
    USING (
        team_id = whatsapp_current_team_id()
        OR whatsapp_is_admin()
    );

-- INSERT Policy: Only admin and manager can create sessions
CREATE POLICY whatsapp_session_insert_policy ON whatsapp_session
    FOR INSERT
    WITH CHECK (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager')
    );

-- UPDATE Policy: Admin and manager can update sessions
CREATE POLICY whatsapp_session_update_policy ON whatsapp_session
    FOR UPDATE
    USING (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager')
    )
    WITH CHECK (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager')
    );

-- DELETE Policy: Only admin can delete sessions
CREATE POLICY whatsapp_session_delete_policy ON whatsapp_session
    FOR DELETE
    USING (
        team_id = whatsapp_current_team_id()
        AND whatsapp_is_admin()
    );

COMMENT ON POLICY whatsapp_session_select_policy ON whatsapp_session 
    IS 'Users can view sessions for their team';
COMMENT ON POLICY whatsapp_session_insert_policy ON whatsapp_session 
    IS 'Admin and manager can create sessions';
COMMENT ON POLICY whatsapp_session_update_policy ON whatsapp_session 
    IS 'Admin and manager can update sessions';
COMMENT ON POLICY whatsapp_session_delete_policy ON whatsapp_session 
    IS 'Only admin can delete sessions';

-- ==============================================================================
-- RLS Policies for: whatsapp_conversation
-- ==============================================================================
-- Purpose: Control access to conversation threads
-- Rules:
--   - All users: Can view conversations for their team
--   - Admin/Manager/Agent: Can create and update conversations
--   - Admin only: Can delete conversations
-- ==============================================================================

-- SELECT Policy: All users can view their team's conversations
CREATE POLICY whatsapp_conversation_select_policy ON whatsapp_conversation
    FOR SELECT
    USING (
        team_id = whatsapp_current_team_id()
        OR whatsapp_is_admin()
    );

-- INSERT Policy: Admin, manager, and agent can create conversations
CREATE POLICY whatsapp_conversation_insert_policy ON whatsapp_conversation
    FOR INSERT
    WITH CHECK (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager', 'agent')
    );

-- UPDATE Policy: Admin, manager, and agent can update conversations
CREATE POLICY whatsapp_conversation_update_policy ON whatsapp_conversation
    FOR UPDATE
    USING (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager', 'agent')
    )
    WITH CHECK (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager', 'agent')
    );

-- DELETE Policy: Only admin can delete conversations
CREATE POLICY whatsapp_conversation_delete_policy ON whatsapp_conversation
    FOR DELETE
    USING (
        team_id = whatsapp_current_team_id()
        AND whatsapp_is_admin()
    );

COMMENT ON POLICY whatsapp_conversation_select_policy ON whatsapp_conversation 
    IS 'Users can view conversations for their team';
COMMENT ON POLICY whatsapp_conversation_insert_policy ON whatsapp_conversation 
    IS 'Admin, manager, and agent can create conversations';
COMMENT ON POLICY whatsapp_conversation_update_policy ON whatsapp_conversation 
    IS 'Admin, manager, and agent can update conversations';
COMMENT ON POLICY whatsapp_conversation_delete_policy ON whatsapp_conversation 
    IS 'Only admin can delete conversations';

-- ==============================================================================
-- RLS Policies for: whatsapp_message
-- ==============================================================================
-- Purpose: Control access to messages
-- Rules:
--   - All users: Can view messages for their team
--   - Admin/Manager/Agent: Can send messages (insert)
--   - Admin/Manager: Can update message metadata
--   - Admin only: Can delete messages
-- ==============================================================================

-- SELECT Policy: All users can view their team's messages
CREATE POLICY whatsapp_message_select_policy ON whatsapp_message
    FOR SELECT
    USING (
        team_id = whatsapp_current_team_id()
        OR whatsapp_is_admin()
    );

-- INSERT Policy: Admin, manager, and agent can send messages
CREATE POLICY whatsapp_message_insert_policy ON whatsapp_message
    FOR INSERT
    WITH CHECK (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager', 'agent')
    );

-- UPDATE Policy: Admin and manager can update message metadata (e.g., mark as read)
CREATE POLICY whatsapp_message_update_policy ON whatsapp_message
    FOR UPDATE
    USING (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager')
    )
    WITH CHECK (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager')
    );

-- DELETE Policy: Only admin can delete messages
CREATE POLICY whatsapp_message_delete_policy ON whatsapp_message
    FOR DELETE
    USING (
        team_id = whatsapp_current_team_id()
        AND whatsapp_is_admin()
    );

COMMENT ON POLICY whatsapp_message_select_policy ON whatsapp_message 
    IS 'Users can view messages for their team';
COMMENT ON POLICY whatsapp_message_insert_policy ON whatsapp_message 
    IS 'Admin, manager, and agent can send messages';
COMMENT ON POLICY whatsapp_message_update_policy ON whatsapp_message 
    IS 'Admin and manager can update message metadata';
COMMENT ON POLICY whatsapp_message_delete_policy ON whatsapp_message 
    IS 'Only admin can delete messages';

-- ==============================================================================
-- RLS Policies for: whatsapp_event
-- ==============================================================================
-- Purpose: Control access to WhatsApp events
-- Rules:
--   - All users: Can view events for their team
--   - System/Admin: Can insert events (typically system-generated)
--   - Admin/Manager: Can update processing status
--   - Admin only: Can delete events
-- ==============================================================================

-- SELECT Policy: All users can view their team's events
CREATE POLICY whatsapp_event_select_policy ON whatsapp_event
    FOR SELECT
    USING (
        team_id = whatsapp_current_team_id()
        OR whatsapp_is_admin()
    );

-- INSERT Policy: All authenticated users can insert events (system-generated)
CREATE POLICY whatsapp_event_insert_policy ON whatsapp_event
    FOR INSERT
    WITH CHECK (
        team_id = whatsapp_current_team_id()
    );

-- UPDATE Policy: Admin and manager can update event processing status
CREATE POLICY whatsapp_event_update_policy ON whatsapp_event
    FOR UPDATE
    USING (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager')
    )
    WITH CHECK (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager')
    );

-- DELETE Policy: Only admin can delete events
CREATE POLICY whatsapp_event_delete_policy ON whatsapp_event
    FOR DELETE
    USING (
        team_id = whatsapp_current_team_id()
        AND whatsapp_is_admin()
    );

COMMENT ON POLICY whatsapp_event_select_policy ON whatsapp_event 
    IS 'Users can view events for their team';
COMMENT ON POLICY whatsapp_event_insert_policy ON whatsapp_event 
    IS 'System can insert events for team';
COMMENT ON POLICY whatsapp_event_update_policy ON whatsapp_event 
    IS 'Admin and manager can update event processing status';
COMMENT ON POLICY whatsapp_event_delete_policy ON whatsapp_event 
    IS 'Only admin can delete events';

-- ==============================================================================
-- RLS Policies for: whatsapp_user_identity_correlation
-- ==============================================================================
-- Purpose: Control access to user identity correlations
-- Rules:
--   - All users: Can view correlations for their team
--   - System/Admin/Manager: Can create correlations
--   - Admin/Manager: Can verify/update correlations
--   - Admin only: Can delete correlations
-- ==============================================================================

-- SELECT Policy: All users can view their team's correlations
CREATE POLICY whatsapp_correlation_select_policy ON whatsapp_user_identity_correlation
    FOR SELECT
    USING (
        team_id = whatsapp_current_team_id()
        OR whatsapp_is_admin()
    );

-- INSERT Policy: Admin and manager can create correlations
CREATE POLICY whatsapp_correlation_insert_policy ON whatsapp_user_identity_correlation
    FOR INSERT
    WITH CHECK (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager')
    );

-- UPDATE Policy: Admin and manager can verify and update correlations
CREATE POLICY whatsapp_correlation_update_policy ON whatsapp_user_identity_correlation
    FOR UPDATE
    USING (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager')
    )
    WITH CHECK (
        team_id = whatsapp_current_team_id()
        AND whatsapp_current_user_role() IN ('admin', 'manager')
    );

-- DELETE Policy: Only admin can delete correlations
CREATE POLICY whatsapp_correlation_delete_policy ON whatsapp_user_identity_correlation
    FOR DELETE
    USING (
        team_id = whatsapp_current_team_id()
        AND whatsapp_is_admin()
    );

COMMENT ON POLICY whatsapp_correlation_select_policy ON whatsapp_user_identity_correlation 
    IS 'Users can view correlations for their team';
COMMENT ON POLICY whatsapp_correlation_insert_policy ON whatsapp_user_identity_correlation 
    IS 'Admin and manager can create correlations';
COMMENT ON POLICY whatsapp_correlation_update_policy ON whatsapp_user_identity_correlation 
    IS 'Admin and manager can verify correlations';
COMMENT ON POLICY whatsapp_correlation_delete_policy ON whatsapp_user_identity_correlation 
    IS 'Only admin can delete correlations';

-- ==============================================================================
-- Force RLS for Table Owners (Optional but Recommended)
-- ==============================================================================
-- Purpose: Ensures that even table owners (e.g., database admin) are subject to RLS
-- This is a security best practice for multi-tenant applications
-- Uncomment if you want to enforce RLS even for superusers
-- ==============================================================================

-- ALTER TABLE whatsapp_session FORCE ROW LEVEL SECURITY;
-- ALTER TABLE whatsapp_conversation FORCE ROW LEVEL SECURITY;
-- ALTER TABLE whatsapp_message FORCE ROW LEVEL SECURITY;
-- ALTER TABLE whatsapp_event FORCE ROW LEVEL SECURITY;
-- ALTER TABLE whatsapp_user_identity_correlation FORCE ROW LEVEL SECURITY;

-- ==============================================================================
-- Testing and Validation Queries
-- ==============================================================================
-- Purpose: Sample queries to test RLS policies
-- Usage: Execute these after setting session variables
-- ==============================================================================

/*
-- Test RLS Policies (run these after setting session variables):

-- Set team context for testing
SET app.current_team_id = 'your-team-uuid-here';
SET app.current_user_role = 'admin'; -- or 'manager', 'agent', 'viewer'

-- Test SELECT policy
SELECT COUNT(*) FROM whatsapp_session;
SELECT COUNT(*) FROM whatsapp_conversation;
SELECT COUNT(*) FROM whatsapp_message;

-- Test with different roles
SET app.current_user_role = 'viewer';
-- This should work (read access)
SELECT * FROM whatsapp_message LIMIT 10;
-- This should fail (no write access)
INSERT INTO whatsapp_message (team_id, session_id, ...) VALUES (...);

-- Test cross-team isolation (should return 0 rows)
SET app.current_team_id = 'different-team-uuid';
SELECT COUNT(*) FROM whatsapp_session;

-- Reset session variables
RESET app.current_team_id;
RESET app.current_user_role;
*/

-- ==============================================================================
-- Application Integration Guide
-- ==============================================================================
/*
In your application code, set these session variables before each query:

JavaScript/TypeScript Example (using pg client):
```javascript
await client.query("SET app.current_team_id = $1", [teamId]);
await client.query("SET app.current_user_role = $1", [userRole]);
// Now execute your queries
const result = await client.query("SELECT * FROM whatsapp_session");
```

Python Example (using psycopg2):
```python
cursor.execute("SET app.current_team_id = %s", (team_id,))
cursor.execute("SET app.current_user_role = %s", (user_role,))
# Now execute your queries
cursor.execute("SELECT * FROM whatsapp_session")
```

Best Practices:
1. Set session variables at the start of each transaction
2. Use connection pooling with session variable reset
3. Validate team_id and user_role on application side
4. Log RLS policy violations for security monitoring
5. Test with different roles during development
*/

-- ==============================================================================
-- Performance Considerations
-- ==============================================================================
/*
RLS Policy Performance Tips:
1. Session variables are cached per connection (fast)
2. Indexes on team_id are critical (already added in schema)
3. Monitor query performance with EXPLAIN ANALYZE
4. Consider partitioning by team_id for very large tables
5. Use connection pooling to reuse authenticated connections

Example Performance Query:
EXPLAIN ANALYZE
SELECT * FROM whatsapp_message 
WHERE team_id = whatsapp_current_team_id()
ORDER BY timestamp DESC 
LIMIT 100;
*/

-- ==============================================================================
-- Security Audit Function
-- ==============================================================================
-- Purpose: Helper function to audit RLS policy effectiveness
-- ==============================================================================

CREATE OR REPLACE FUNCTION whatsapp_audit_rls_policies()
RETURNS TABLE(
    table_name TEXT,
    rls_enabled BOOLEAN,
    force_rls BOOLEAN,
    policy_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.relname::TEXT,
        c.relrowsecurity,
        c.relforcerowsecurity,
        COUNT(p.polname)
    FROM pg_class c
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE c.relname LIKE 'whatsapp_%'
    AND c.relkind = 'r'
    GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
    ORDER BY c.relname;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION whatsapp_audit_rls_policies() 
    IS 'Audits RLS policy configuration for WhatsApp tables';

-- ==============================================================================
-- Migration Complete
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '✓ WhatsApp RLS policies migration 002 completed successfully';
    RAISE NOTICE '  - Enabled RLS on 5 tables';
    RAISE NOTICE '  - Created 20 security policies';
    RAISE NOTICE '  - Created 4 helper functions';
    RAISE NOTICE '  - Ready for performance indexes (migration 003)';
    RAISE NOTICE '  ';
    RAISE NOTICE '⚠ IMPORTANT: Application must set session variables:';
    RAISE NOTICE '    SET app.current_team_id = <team_uuid>;';
    RAISE NOTICE '    SET app.current_user_role = <role>;';
END $$;

-- Display audit results
SELECT * FROM whatsapp_audit_rls_policies();