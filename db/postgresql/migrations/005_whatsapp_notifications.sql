-- WhatsApp Analytics Integration - Notifications Schema
-- Creates tables for in-app notifications and user preferences

-- Notifications table
CREATE TABLE IF NOT EXISTS whatsapp_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL,
    user_id UUID,
    type VARCHAR(20) NOT NULL CHECK (type IN ('success', 'error', 'warning', 'info')),
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    read BOOLEAN NOT NULL DEFAULT FALSE,
    dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE,
    action_url VARCHAR(500),
    action_label VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Notification preferences table
CREATE TABLE IF NOT EXISTS whatsapp_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    team_id UUID NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    priorities JSONB NOT NULL DEFAULT '{"critical": true, "high": true, "medium": true, "low": false}'::jsonb,
    types JSONB NOT NULL DEFAULT '{"session": true, "message": true, "conversation": true, "analytics": true, "system": true}'::jsonb,
    channels JSONB NOT NULL DEFAULT '{"inApp": true, "email": false, "push": false}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, team_id)
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_team_id ON whatsapp_notifications(team_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON whatsapp_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON whatsapp_notifications(read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_dismissed ON whatsapp_notifications(dismissed) WHERE dismissed = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON whatsapp_notifications(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON whatsapp_notifications(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON whatsapp_notifications(priority);

-- Indexes for preferences
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_team ON whatsapp_notification_preferences(user_id, team_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_whatsapp_notification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notifications_updated_at
    BEFORE UPDATE ON whatsapp_notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_notification_updated_at();

CREATE TRIGGER trg_notification_prefs_updated_at
    BEFORE UPDATE ON whatsapp_notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_notification_updated_at();

-- Row-level security policies for notifications
ALTER TABLE whatsapp_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_team_isolation ON whatsapp_notifications
    USING (team_id::text = current_setting('app.current_team_id', TRUE));

-- Row-level security for preferences
ALTER TABLE whatsapp_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_prefs_team_isolation ON whatsapp_notification_preferences
    USING (team_id::text = current_setting('app.current_team_id', TRUE));

-- Comments for documentation
COMMENT ON TABLE whatsapp_notifications IS 'Stores in-app notifications for WhatsApp analytics events';
COMMENT ON TABLE whatsapp_notification_preferences IS 'User notification preferences and settings';
COMMENT ON COLUMN whatsapp_notifications.priority IS 'Notification priority: critical, high, medium, low';
COMMENT ON COLUMN whatsapp_notifications.type IS 'Notification type: success, error, warning, info';
COMMENT ON COLUMN whatsapp_notifications.expires_at IS 'Optional expiration time for auto-cleanup';