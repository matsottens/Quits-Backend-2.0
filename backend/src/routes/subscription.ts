import express, { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateUser, AuthRequest } from '../middleware/auth.js';
import {
  createSubscription, getUserSubscriptions, updateSubscription, deleteSubscription
} from '../services/database.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateUser);

// Get all subscriptions for the authenticated user
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const subscriptions = await getUserSubscriptions(userId);
    res.json(subscriptions);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// Get a single subscription by ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Fetch the subscription and ensure it belongs to the user
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !subscription) {
      console.error('Error fetching subscription or not found:', error);
      return res.status(404).json({ error: 'Subscription not found or access denied' });
    }

    res.json(subscription);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Create a new subscription
router.post('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const subscriptionData = { ...req.body, user_id: userId }; // Add user_id

    // Basic validation (Add more specific validation as needed)
    if (!subscriptionData.name || !subscriptionData.price || !subscriptionData.billing_period) {
      return res.status(400).json({ error: 'Missing required subscription fields' });
    }

    const newSubscription = await createSubscription(subscriptionData);
    res.status(201).json(newSubscription);
  } catch (error) {
    console.error('Error creating subscription:', error);
    // Check for specific Supabase errors (e.g., unique constraints)
    if (error instanceof Error && 'code' in error && (error as any).code === '23505') { // Unique violation
        return res.status(409).json({ error: 'Subscription already exists or conflict' });
    }
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// Update an existing subscription
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    const updates = req.body;

    // Ensure the user owns the subscription before updating
    const { data: existingSubscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingSubscription) {
      return res.status(404).json({ error: 'Subscription not found or access denied' });
    }

    // Prevent updating user_id or id
    delete updates.user_id;
    delete updates.id;
    delete updates.created_at;

    const updatedSubscription = await updateSubscription(id, updates);
    res.json(updatedSubscription);
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Delete a subscription
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Ensure the user owns the subscription before deleting
    const { data: existingSubscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingSubscription) {
      return res.status(404).json({ error: 'Subscription not found or access denied' });
    }

    await deleteSubscription(id);
    res.status(204).send(); // No content on successful deletion
  } catch (error) {
    console.error('Error deleting subscription:', error);
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

export default router; 