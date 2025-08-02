import { authenticateUser } from './auth/verify.js';
import { supabase } from './utils/supabase.js';

// This is a simplified handler that will be expanded
export default async function handler(req, res) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Cache-Control, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Authenticate the user first
    const user = await authenticateUser(req, res);
    if (!user) {
      // authenticateUser will have already sent a response
      return;
    }

    const { id: userId } = user;

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('users')
        .select('email, linked_accounts, scan_frequency')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const allAccounts = [data.email, ...(data.linked_accounts || [])];
      const uniqueAccounts = [...new Set(allAccounts)];

      // Return settings including scan frequency
      const settings = {
        email: {
          accounts: uniqueAccounts,
          scanFrequency: data.scan_frequency || 'manual',
        },
      };
      
      return res.status(200).json(settings);

    } else if (req.method === 'PUT') {
      const patch = req.body || {};
      
      // Prepare update object
      const updateData = {};
      
      if (patch.email?.accounts) {
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('email')
          .eq('id', userId)
          .single();
          
        if (userError) throw userError;
        
        const primaryEmail = user.email;
        const linkedAccounts = patch.email.accounts.filter(acc => acc !== primaryEmail);
        updateData.linked_accounts = linkedAccounts;
      }
      
      // Handle scan frequency update
      if (patch.email?.scanFrequency) {
        updateData.scan_frequency = patch.email.scanFrequency;
      }
      
      // Update database if there are changes
      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('users')
          .update(updateData)
          .eq('id', userId);
          
        if (updateError) throw updateError;
      }
      
      // Fetch and return the updated settings
      const { data: updatedData, error: fetchError } = await supabase
        .from('users')
        .select('email, linked_accounts, scan_frequency')
        .eq('id', userId)
        .single();

      if (fetchError) throw fetchError;

      const allAccounts = [updatedData.email, ...(updatedData.linked_accounts || [])];
      const uniqueAccounts = [...new Set(allAccounts)];

      const updatedSettings = {
        email: {
          accounts: uniqueAccounts,
          scanFrequency: updatedData.scan_frequency || 'manual',
        },
      };
      
      return res.status(200).json(updatedSettings);
    }

    // Default response for unhandled methods
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).end('Method Not Allowed');

  } catch (error) {
    console.error('Error in settings handler:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
} 