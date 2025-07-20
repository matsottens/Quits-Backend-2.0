import { supabase } from '../config/supabase';

// Create or update a user in the database
export const upsertUser = async (userInfo) => {
  try {
    console.log('Upserting user:', userInfo.email);

    // Ensure that optional fields are properly handled
    const sanitizedUserInfo = {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name || null,
      avatar_url: userInfo.picture || null, // Use avatar_url which matches the actual schema
      google_id: userInfo.google_id || userInfo.id || null, // Use google_id which exists in schema
      verified_email: typeof userInfo.verified_email === 'boolean' ? userInfo.verified_email : null
    };

    // Try full upsert first with all columns including google_user_id and google_id
    let { data, error } = await supabase
      .from('users')
      .upsert({
        id: sanitizedUserInfo.id,
        email: sanitizedUserInfo.email,
        name: sanitizedUserInfo.name,
        avatar_url: sanitizedUserInfo.avatar_url,
        google_id: sanitizedUserInfo.google_id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select('id, email, name, avatar_url, google_id')
      .single();

    // Fallback if google_id column is missing (Supabase may return 42703 or PGRST204)
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      console.warn('Google ID column missing – retrying upsert without it');
      const retry = await supabase
        .from('users')
        .upsert({
          id: sanitizedUserInfo.id,
          email: sanitizedUserInfo.email,
          name: sanitizedUserInfo.name,
          avatar_url: sanitizedUserInfo.avatar_url,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select('id, email, name, avatar_url')
        .single();
      data = retry.data;
      error = retry.error;
      
      // If fallback succeeded, try to update google_id separately
      if (!error && sanitizedUserInfo.google_id) {
        try {
          await supabase
            .from('users')
            .update({ google_id: sanitizedUserInfo.google_id })
            .eq('id', sanitizedUserInfo.id);
        } catch (colErr) {
          // Swallow column-missing errors
        }
      }
    }
    
    if (error) {
      console.error('Supabase upsert error:', error);
      // Fallback to mock implementation if database operation fails
      return {
        id: sanitizedUserInfo.id,
        email: sanitizedUserInfo.email,
        name: sanitizedUserInfo.name || 'User',
        picture: sanitizedUserInfo.picture || null
      };
    }

    // Check if this is a new user (created_at == updated_at or created_at is very recent)
    if (data && data.created_at && data.updated_at && data.created_at === data.updated_at) {
      console.log('New user detected, creating mock subscription for:', data.email);
      
      // Insert a mock subscription for the new user
      try {
        const { error: subError } = await supabase
          .from('subscriptions')
          .insert({
            user_id: data.id,
            name: 'Welcome Subscription',
            price: 0,
            billing_cycle: 'monthly',
            next_billing_date: null,
            category: 'welcome',
            is_manual: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        if (subError) {
          console.error('Failed to create mock subscription for new user:', subError);
        } else {
          console.log('Mock subscription created for new user:', data.email);
        }
      } catch (subErr) {
        console.error('Exception creating mock subscription for new user:', subErr);
      }
    } else {
      console.log('Existing user, skipping mock subscription creation for:', data.email);
    }
    
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      // Use avatar_url from database or fall back to original picture
      picture: data.avatar_url || sanitizedUserInfo.avatar_url || null
    };
  } catch (error) {
    console.error('Error upserting user:', error);
    // Fallback to mock implementation
    return {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name || 'User', 
      picture: userInfo.picture || userInfo.avatar_url || null
    };
  }
}; 