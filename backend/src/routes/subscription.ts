import express, { Response, RequestHandler } from 'express';
import { supabase } from '../config/supabase';
import { authenticateUser, AuthRequest } from '../middleware/auth';

const router = express.Router();

// All subscription routes require authentication
// Apply authentication middleware to all routes
router.use(authenticateUser as RequestHandler);

// Get all subscriptions for the authenticated user
router.get('/', (async (req: AuthRequest, res) => {
  try {
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', (req as any).dbUserId);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
    
    // Wrap in an object to match frontend expectation
    return res.json({ subscriptions });
  } catch (err) {
    console.error('Error fetching subscriptions:', err);
    return res.status(500).json({ error: 'An error occurred while fetching subscriptions' });
  }
}) as RequestHandler);

// Get a specific subscription
router.get('/:id', (async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const dbUserId = (req as any).dbUserId;

    console.log(`[SUB] Fetching subscription id=${id}, dbUserId=${dbUserId}`);
    
    // Retrieve the subscription first
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('[SUB] Supabase error fetching by id:', error);
    }

    if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
      console.error('Subscription query error:', error);
      return res.status(500).json({ subscription: null, error: 'Database error while fetching subscription' });
    }

    if (!subscription) {
      // No row found
      return res.status(404).json({ subscription: null, error: 'Subscription not found' });
    }

    // If both IDs are present, enforce ownership
    if (dbUserId && subscription.user_id && subscription.user_id !== dbUserId) {
      return res.status(403).json({ subscription: null, error: 'Access denied: subscription belongs to another user' });
    }

    return res.json({ subscription });
  } catch (err) {
    console.error('Error fetching subscription:', err);
    return res.status(500).json({ subscription: null, error: 'An error occurred while fetching the subscription' });
  }
}) as RequestHandler);

// Create a new subscription
router.post('/', (async (req: AuthRequest, res) => {
  try {
    const { name, price, currency, billing_cycle, next_billing_date } = req.body;
    
    if (!name || !price || !currency || !billing_cycle) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Use internal UUID (dbUserId) for the FK relationship
    const dbUserId = (req as any).dbUserId || req.user?.id;

    console.log('[SUB] Creating subscription for dbUserId:', dbUserId);

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: dbUserId,
        name,
        price,
        currency,
        billing_cycle,
        next_billing_date: next_billing_date || null
      })
      .select()
      .single();
      
    if (error) {
      console.error('[SUB] Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to create subscription', details: error.message || error });
    }
    
    // Wrap in object for consistent frontend handling
    return res.status(201).json({ subscription });
  } catch (err) {
    console.error('Error creating subscription:', err);
    return res.status(500).json({ error: 'An error occurred while creating the subscription' });
  }
}) as RequestHandler);

// Update a subscription
router.put('/:id', (async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, price, currency, billing_cycle, next_billing_date, status } = req.body;
    
    // First verify the subscription belongs to the user
    const { data: existing, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('id', id)
      .eq('user_id', (req as any).dbUserId)
      .single();
      
    if (fetchError) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    
    const { data: subscription, error: updateError } = await supabase
      .from('subscriptions')
      .update({
        name,
        price,
        currency,
        billing_cycle,
        next_billing_date,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
      
    if (updateError) {
      return res.status(500).json({ error: 'Failed to update subscription' });
    }
    
    // Wrap in object for consistent frontend handling
    return res.json({ subscription });
  } catch (err) {
    console.error('Error updating subscription:', err);
    return res.status(500).json({ error: 'An error occurred while updating the subscription' });
  }
}) as RequestHandler);

// Delete a subscription
router.delete('/:id', (async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    // First verify the subscription belongs to the user
    const { data: existing, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('id', id)
      .eq('user_id', (req as any).dbUserId)
      .single();
      
    if (fetchError) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    
    const { error: deleteError } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', id);
      
    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete subscription' });
    }
    
    return res.status(204).send();
  } catch (err) {
    console.error('Error deleting subscription:', err);
    return res.status(500).json({ error: 'An error occurred while deleting the subscription' });
  }
}) as RequestHandler);

export default router; 