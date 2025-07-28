import { authenticateUser } from './auth/verify.js';
import { supabase } from './utils/supabase.js';

// This is a simplified handler that will be expanded
export default async function handler(req, res) {
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
        .select('email, linked_accounts')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const allAccounts = [data.email, ...(data.linked_accounts || [])];
      const uniqueAccounts = [...new Set(allAccounts)];

      // For now, we only care about the accounts
      const settings = {
        email: {
          accounts: uniqueAccounts,
        },
      };
      
      return res.status(200).json(settings);

    } else if (req.method === 'PUT') {
      const patch = req.body || {};
      
      if (patch.email?.accounts) {
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('email')
          .eq('id', userId)
          .single();
          
        if (userError) throw userError;
        
        const primaryEmail = user.email;
        const linkedAccounts = patch.email.accounts.filter(acc => acc !== primaryEmail);
        
        const { error: updateError } = await supabase
          .from('users')
          .update({ linked_accounts: linkedAccounts })
          .eq('id', userId);
          
        if (updateError) throw updateError;
      }
      
      // Return a minimal success response
      return res.status(200).json({ success: true, message: 'Settings updated' });
    }

    // Default response for unhandled methods
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).end('Method Not Allowed');

  } catch (error) {
    console.error('Error in settings handler:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
} 