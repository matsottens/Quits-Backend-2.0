-- Create subscriptions table for storing user subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    billing_cycle VARCHAR(20) NOT NULL,
    next_billing_date DATE,
    provider VARCHAR,
    category VARCHAR DEFAULT 'auto-detected',
    email_id VARCHAR,
    is_manual BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_name ON public.subscriptions(name);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing_date ON public.subscriptions(next_billing_date);

-- Add comment for documentation
COMMENT ON TABLE public.subscriptions IS 'User subscriptions detected from email analysis or manually added';

-- Enable row level security
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies for row level security
CREATE POLICY "Users can view their own subscriptions"
ON public.subscriptions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
ON public.subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
ON public.subscriptions
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions"
ON public.subscriptions
FOR DELETE
USING (auth.uid() = user_id);

-- Allow API to insert subscriptions (for Gemini scan)
CREATE POLICY "API can insert subscriptions"
ON public.subscriptions
FOR INSERT
WITH CHECK (true); 