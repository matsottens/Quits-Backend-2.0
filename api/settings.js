import { authenticateUser } from './auth/verify.js';
import { supabase } from './utils/supabase.js';

// This is a simplified handler that will be expanded
export default async function handler(req, res) {
  // Set CORS headers for all responses
  const origin = req.headers.origin || '';
  if (origin.includes('localhost') || origin.includes('quits.cc')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  }
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
      console.log('Settings API: Received GET request for user:', userId);
      
      const { data, error } = await supabase
        .from('users')
        .select('email, linked_accounts, scan_frequency')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Settings API: Database query error:', error);
        throw error;
      }

      if (!data) {
        console.log('Settings API: No user row found; returning defaults');
        return res.status(200).json({
          email: {
            accounts: [],
            scanFrequency: 'manual'
          }
        });
      }

      console.log('Settings API: Raw database data:', data);
      
      const allAccounts = [data.email, ...(data.linked_accounts || [])];
      const uniqueAccounts = [...new Set(allAccounts)];

      // Return settings including scan frequency
      const settings = {
        email: {
          accounts: uniqueAccounts,
          scanFrequency: data.scan_frequency || 'manual',
        },
      };
      
      console.log('Settings API: Returning settings:', settings);
      return res.status(200).json(settings);

    } else if (req.method === 'PUT') {
      const patch = req.body || {};
      console.log('Settings API: Received PUT request with patch:', patch);
      console.log('Settings API: User ID:', userId);
      
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
        console.log('Settings API: Updating scan_frequency to:', patch.email.scanFrequency);
      }
      
      console.log('Settings API: Update data to be applied:', updateData);
      
      // Update database if there are changes
      if (Object.keys(updateData).length > 0) {
        console.log('Settings API: Applying database update...');
        const { data: updateResult, error: updateError } = await supabase
          .from('users')
          .update(updateData)
          .eq('id', userId)
          .select();
          
        if (updateError) {
          console.error('Settings API: Database update error:', updateError);
          throw updateError;
        }
        
        console.log('Settings API: Database update successful:', updateResult);
      } else {
        console.log('Settings API: No changes to apply');
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