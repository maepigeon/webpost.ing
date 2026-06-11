-- System-wide configurable settings, editable by admins.
CREATE TABLE IF NOT EXISTS system_settings (
    key   VARCHAR(64)  PRIMARY KEY,
    value VARCHAR(256) NOT NULL
);

INSERT INTO system_settings(key, value) VALUES
    ('max_daily_registrations', '5')
ON CONFLICT (key) DO NOTHING;
