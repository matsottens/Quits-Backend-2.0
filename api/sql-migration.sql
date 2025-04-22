-- Create scan_history table if it doesn't exist
CREATE TABLE IF NOT EXISTS scan_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users NOT NULL,
    status TEXT DEFAULT 'in_progress',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    emails_scanned INTEGER DEFAULT 0,
    subscriptions_found INTEGER DEFAULT 0,
    total_emails INTEGER DEFAULT 0
);

-- Create subscription_examples table if it doesn't exist
CREATE TABLE IF NOT EXISTS subscription_examples (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name TEXT NOT NULL,
    sender_pattern TEXT,
    subject_pattern TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_scan_history_user_id ON scan_history(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_examples_service_name ON subscription_examples(service_name);

-- Insert common subscription examples 
INSERT INTO subscription_examples (service_name, sender_pattern, subject_pattern)
VALUES 
    ('Vercel', 'invoice@vercel.com', 'receipt'),
    ('Vercel', 'statements@vercel.com', 'invoice'),
    ('Babbel', 'noreply@babbel.com', 'subscription'),
    ('Babbel', 'service@babbel.com', 'payment'),
    ('NBA League Pass', 'noreply@nba.com', 'League Pass'),
    ('NBA League Pass', 'nbaleaguepass@nba.com', 'subscription'),
    ('Ahrefs', 'billing@ahrefs.com', 'invoice'),
    ('Ahrefs', 'support@ahrefs.com', 'payment'),
    ('Netflix', 'info@netflix.com', 'membership'),
    ('Netflix', 'info@account.netflix.com', 'billing'),
    ('Spotify', 'no-reply@spotify.com', 'receipt'),
    ('Spotify', 'spotify@spotify.com', 'subscription'),
    ('Amazon Prime', 'auto-confirm@amazon.com', 'Prime membership'),
    ('Amazon Prime', 'store-news@amazon.com', 'Prime'),
    ('Disney+', 'disneyplus@mail.disneyplus.com', 'subscription'),
    ('Disney+', 'disneypluscs@mail.disneyplus.com', 'billing'),
    ('YouTube Premium', 'payments-noreply@google.com', 'YouTube Premium'),
    ('YouTube Premium', 'youtube@youtube.com', 'Premium'),
    ('Adobe Creative Cloud', 'mail@mail.adobe.com', 'subscription'),
    ('Adobe Creative Cloud', 'adobeid@adobe.com', 'payment'),
    ('New York Times', 'nytimes@email.newyorktimes.com', 'subscription'),
    ('New York Times', 'nytdirect@nytimes.com', 'billing'),
    ('HBO Max', 'HBOMaxHelp@hbo.com', 'subscription'),
    ('HBO Max', 'HBOMax@mail.hbomax.com', 'billing'),
    ('Apple', 'no_reply@email.apple.com', 'receipt'),
    ('Apple', 'apple@email.apple.com', 'subscription'),
    ('Microsoft', 'account-security-noreply@accountprotection.microsoft.com', 'billing'),
    ('Microsoft', 'microsoft-noreply@microsoft.com', 'subscription'),
    ('Hulu', 'hulu@hulumail.com', 'subscription'),
    ('Hulu', 'billing@hulu.com', 'payment');

-- Don't fail if examples already exist
ON CONFLICT DO NOTHING; 