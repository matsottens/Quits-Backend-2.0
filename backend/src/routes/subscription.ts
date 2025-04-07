import express from 'express';
import { authenticateUser } from '../middlewares/auth.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Middleware to authenticate user
router.use(authenticateUser);

// Get all subscriptions for a user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
      
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
    
    res.status(200).json({ subscriptions });
  } catch (error) {
    console.error('Fetch subscriptions error:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// Get a single subscription
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
      
    if (error) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    
    res.status(200).json({ subscription });
  } catch (error) {
    console.error('Fetch subscription error:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Create a new subscription manually
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      name, 
      price, 
      currency, 
      billing_cycle, 
      next_billing_date,
      provider,
      category,
      notes
    } = req.body;
    
    // Validate required fields
    if (!name || !price || !billing_cycle) {
      return res.status(400).json({ error: 'Name, price, and billing cycle are required' });
    }
    
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        name,
        price,
        currency: currency || 'USD',
        billing_cycle,
        next_billing_date,
        provider: provider || '',
        category: category || '',
        notes: notes || '',
        is_manual: true,
      })
      .select();
      
    if (error) {
      return res.status(500).json({ error: 'Failed to create subscription' });
    }
    
    res.status(201).json({ subscription: subscription[0] });
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// Update a subscription
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.user_id;
    delete updateData.created_at;
    delete updateData.email_id;
    
    // Check if subscription exists and belongs to user
    const { data: existingSubscription, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
      
    if (fetchError) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    
    const { data: updatedSubscription, error: updateError } = await supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select();
      
    if (updateError) {
      return res.status(500).json({ error: 'Failed to update subscription' });
    }
    
    res.status(200).json({ subscription: updatedSubscription[0] });
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Delete a subscription
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const { error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
      
    if (error) {
      return res.status(500).json({ error: 'Failed to delete subscription' });
    }
    
    res.status(200).json({ message: 'Subscription deleted successfully' });
  } catch (error) {
    console.error('Delete subscription error:', error);
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

export default router; 