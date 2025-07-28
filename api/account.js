import { authenticateUser } from './auth/verify.js';
import { supabase } from './utils/supabase.js';

export default async function handler(req, res) {
  const user = await authenticateUser(req, res);
  if (!user) return; // authenticateUser sends response on failure

  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);

      if (error) throw error;

      console.log(`[account] User ${user.id} deleted successfully.`);
      return res.status(200).json({ success: true, message: 'Account deleted successfully' });
    } catch (dbError) {
      console.error('[account] Error deleting user:', dbError);
      return res.status(500).json({ success: false, error: 'Failed to delete account' });
    }
  } else {
    res.setHeader('Allow', ['DELETE']);
    return res.status(405).end('Method Not Allowed');
  }
} 