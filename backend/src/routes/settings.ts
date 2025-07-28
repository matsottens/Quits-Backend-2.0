import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

// Temporary in-memory store per user
const userSettings: Record<string, any> = {};

const router = express.Router();

// All settings routes require authentication
router.use(authenticateUser);

router.get('/', async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('users')
      .select('email, linked_accounts')
      .eq('id', userId)
      .single();

    if (error) throw error;

    // Combine primary email with linked accounts
    const allAccounts = [data.email, ...(data.linked_accounts || [])];
    const uniqueAccounts = [...new Set(allAccounts)];

    // Merge with in-memory settings for now
    const settings = {
      ...(userSettings[userId] || {}),
      email: {
        ...(userSettings[userId]?.email || {}),
        accounts: uniqueAccounts,
      },
    };
    
    return res.json(settings);
  } catch (dbError) {
    console.error('Error fetching user settings from DB:', dbError);
    // Fallback to in-memory store on error
    const settings = userSettings[userId] || {};
    return res.status(500).json(settings);
  }
});

router.put('/', async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const patch = req.body || {};
  
  // Update in-memory settings
  userSettings[userId] = {
    ...userSettings[userId],
    ...patch,
  };
  
  // If accounts are being updated, persist to DB
  if (patch.email?.accounts) {
    try {
      // We need to diff against the user's primary email
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();
        
      if (userError) throw userError;
      
      const primaryEmail = user.email;
      const linkedAccounts = patch.email.accounts.filter((acc: string) => acc !== primaryEmail);
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ linked_accounts: linkedAccounts })
        .eq('id', userId);
        
      if (updateError) throw updateError;
      
      console.log(`Updated linked_accounts for user ${userId}`);
      
    } catch (dbError) {
      console.error('Error persisting linked_accounts to DB:', dbError);
      // Don't fail the request, but log the error
    }
  }

  return res.json(userSettings[userId]);
});

router.get('/export', async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const settings = userSettings[userId] || {};
  const json = JSON.stringify(settings, null, 2);

  // Set headers so browser treats response as file download
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="quits-settings.json"');
  return res.send(json);
});

export default router; 