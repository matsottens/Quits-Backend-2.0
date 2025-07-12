-- Supabase Migration Script
-- Create the scan_history table if it doesn't exist

CREATE TABLE IF NOT EXISTS public.scan_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    emails_found INTEGER DEFAULT 0,
    emails_to_process INTEGER DEFAULT 0,
    emails_processed INTEGER DEFAULT 0,
    emails_scanned INTEGER DEFAULT 0,
    subscriptions_found INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create the email_data table to store individual email information
CREATE TABLE IF NOT EXISTS public.email_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    gmail_message_id TEXT NOT NULL,
    subject TEXT,
    sender TEXT,
    date TIMESTAMP WITH TIME ZONE,
    content TEXT,
    content_preview TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Create the subscription_analysis table to store Gemini analysis results
CREATE TABLE IF NOT EXISTS public.subscription_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_data_id UUID NOT NULL,
    user_id UUID NOT NULL,
    scan_id TEXT NOT NULL,
    subscription_name TEXT,
    price DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    billing_cycle VARCHAR(20),
    next_billing_date DATE,
    service_provider TEXT,
    confidence_score DECIMAL(3, 2),
    analysis_status VARCHAR(20) DEFAULT 'pending',
    gemini_response TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    FOREIGN KEY (email_data_id) REFERENCES public.email_data(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Create the subscription_examples table to store detected subscription patterns
CREATE TABLE IF NOT EXISTS public.subscription_examples (
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

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_scan_history_scan_id ON public.scan_history(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_history_user_id ON public.scan_history(user_id);
CREATE INDEX IF NOT EXISTS idx_email_data_scan_id ON public.email_data(scan_id);
CREATE INDEX IF NOT EXISTS idx_email_data_user_id ON public.email_data(user_id);
CREATE INDEX IF NOT EXISTS idx_email_data_gmail_message_id ON public.email_data(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_subscription_analysis_email_data_id ON public.subscription_analysis(email_data_id);
CREATE INDEX IF NOT EXISTS idx_subscription_analysis_user_id ON public.subscription_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_analysis_scan_id ON public.subscription_analysis(scan_id);
CREATE INDEX IF NOT EXISTS idx_subscription_examples_service_name ON public.subscription_examples(service_name);

-- Add comment for documentation
COMMENT ON TABLE public.scan_history IS 'Records of email scanning operations and their status';
COMMENT ON TABLE public.email_data IS 'Individual email data extracted from Gmail API';
COMMENT ON TABLE public.subscription_analysis IS 'Results of Gemini AI analysis of email data for subscription detection';
COMMENT ON TABLE public.subscription_examples IS 'Stores detected subscription patterns to improve future detection';

-- Insert initial example data for known subscriptions
INSERT INTO public.subscription_examples (service_name, sender_pattern, subject_pattern, amount, currency, billing_frequency, confidence)
VALUES 
('NBA League Pass', 'NBA <NBA@nbaemail.nba.com>', 'NBA League Pass Subscription Confirmation', 16.99, 'EUR', 'monthly', 0.95),
('Babbel', 'Apple <no_reply@email.apple.com>', 'Your subscription confirmation', 53.99, 'EUR', 'quarterly', 0.95),
('Vercel Premium', 'Vercel Inc. <invoice+statements@vercel.com>', 'Your receipt from Vercel Inc.', 20.00, 'USD', 'monthly', 0.95),
('Ahrefs Starter', 'Ahrefs <billing@ahrefs.com>', 'Thank you for your payment', 27.00, 'EUR', 'monthly', 0.95)
ON CONFLICT (id) DO NOTHING;

-- Grant access to authenticated users
ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_examples ENABLE ROW LEVEL SECURITY;

-- Create policies for row level security
CREATE POLICY "Users can view their own scan history"
ON public.scan_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "API can insert scan records"
ON public.scan_history
FOR INSERT
WITH CHECK (true);

CREATE POLICY "API can update scan records"
ON public.scan_history
FOR UPDATE
USING (true);

-- Email data policies
CREATE POLICY "Users can view their own email data"
ON public.email_data
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "API can insert email data"
ON public.email_data
FOR INSERT
WITH CHECK (true);

CREATE POLICY "API can update email data"
ON public.email_data
FOR UPDATE
USING (true);

-- Subscription analysis policies
CREATE POLICY "Users can view their own subscription analysis"
ON public.subscription_analysis
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "API can insert subscription analysis"
ON public.subscription_analysis
FOR INSERT
WITH CHECK (true);

CREATE POLICY "API can update subscription analysis"
ON public.subscription_analysis
FOR UPDATE
USING (true);

-- Subscription examples policies (read-only for all authenticated users)
CREATE POLICY "Users can view subscription examples"
ON public.subscription_examples
FOR SELECT
USING (true);

CREATE POLICY "API can insert subscription examples"
ON public.subscription_examples
FOR INSERT
WITH CHECK (true); 