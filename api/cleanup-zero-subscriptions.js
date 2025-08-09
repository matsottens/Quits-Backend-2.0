// Cleanup API to remove zero-price subscriptions
import { supabase } from './utils/supabase.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Find all subscriptions with price 0 or null
    const { data: zeroSubs, error: findError } = await supabase
      .from('subscriptions')
      .select('id, name, price, user_id')
      .or('price.eq.0,price.is.null');

    if (findError) {
      console.error('Cleanup: Failed to find zero-price subscriptions:', findError.message);
      return res.status(500).json({ error: findError.message });
    }

    if (!zeroSubs || zeroSubs.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No zero-price subscriptions found',
        deleted: 0 
      });
    }

    console.log(`Cleanup: Found ${zeroSubs.length} zero-price subscriptions to delete`);
    zeroSubs.forEach(sub => {
      console.log(`- ${sub.name}: $${sub.price} (ID: ${sub.id})`);
    });

    // Delete all zero-price subscriptions
    const { error: deleteError } = await supabase
      .from('subscriptions')
      .delete()
      .or('price.eq.0,price.is.null');

    if (deleteError) {
      console.error('Cleanup: Failed to delete zero-price subscriptions:', deleteError.message);
      return res.status(500).json({ error: deleteError.message });
    }

    console.log(`Cleanup: Successfully deleted ${zeroSubs.length} zero-price subscriptions`);

    return res.status(200).json({ 
      success: true, 
      message: `Deleted ${zeroSubs.length} zero-price subscriptions`,
      deleted: zeroSubs.length,
      deletedSubs: zeroSubs.map(sub => ({ name: sub.name, price: sub.price }))
    });

  } catch (error) {
    console.error('Cleanup: Fatal error:', error);
    return res.status(500).json({ error: error.message });
  }
}
