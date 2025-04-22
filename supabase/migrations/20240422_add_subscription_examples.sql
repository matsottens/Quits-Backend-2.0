-- Add subscription_examples table to store detected subscription patterns
CREATE TABLE IF NOT EXISTS subscription_examples (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name TEXT NOT NULL,
    sender_pattern TEXT NOT NULL,
    subject_pattern TEXT NOT NULL,
    amount DECIMAL(10, 2),
    currency TEXT,
    billing_frequency TEXT,
    confidence DECIMAL(3, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index on service_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscription_examples_service_name ON subscription_examples(service_name);

-- Add comment to the table
COMMENT ON TABLE subscription_examples IS 'Stores detected subscription patterns to improve future detection';

-- Insert initial example data for known subscriptions
INSERT INTO subscription_examples (service_name, sender_pattern, subject_pattern, amount, currency, billing_frequency, confidence)
VALUES 
('NBA League Pass', 'NBA <NBA@nbaemail.nba.com>', 'NBA League Pass Subscription Confirmation', 16.99, 'EUR', 'monthly', 0.95),
('Babbel', 'Apple <no_reply@email.apple.com>', 'Your subscription confirmation', 53.99, 'EUR', 'quarterly', 0.95),
('Vercel Premium', 'Vercel Inc. <invoice+statements@vercel.com>', 'Your receipt from Vercel Inc.', 20.00, 'USD', 'monthly', 0.95),
('Ahrefs Starter', 'Ahrefs <billing@ahrefs.com>', 'Thank you for your payment', 27.00, 'EUR', 'monthly', 0.95)
ON CONFLICT (id) DO NOTHING; 