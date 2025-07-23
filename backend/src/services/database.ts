import { supabase } from '../config/supabase';

// Create or update a user in the database
export const upsertUser = async (userInfo: any) => {
  try {
    console.log('Upserting user:', userInfo.email);

    // Prepare user fields – only include defined properties to avoid Supabase null/undefined issues
    const sanitizedUserInfo: any = {
      email: userInfo.email,
      name: userInfo.name || null,
      avatar_url: userInfo.picture || null,
      google_id: userInfo.google_id || (userInfo.id && !/^[0-9a-fA-F-]{36}$/.test(userInfo.id) ? userInfo.id : null),
      // maintain legacy picture property for callers that still expect it
      picture: userInfo.picture || null,
      verified_email: typeof userInfo.verified_email === 'boolean' ? userInfo.verified_email : null,
      // Only set password_hash if supplied (avoids overwriting existing hashes)
      ...(userInfo.password_hash ? { password_hash: userInfo.password_hash } : {}),
    };

    // If caller provided a valid UUID, keep it so we can upsert on primary key
    if (userInfo.id && /^[0-9a-fA-F-]{36}$/.test(userInfo.id)) {
      sanitizedUserInfo.id = userInfo.id;
    }

    // Decide which column to use for conflict resolution
    const conflictTarget = sanitizedUserInfo.id ? 'id' : sanitizedUserInfo.google_id ? 'google_id' : 'email';

    let { data, error } = await supabase
      .from('users')
      .upsert({
        ...sanitizedUserInfo,
        updated_at: new Date().toISOString(),
      }, { onConflict: conflictTarget })
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

      // If duplicate email, fetch existing user so we return correct UUID
      if (error.code === '23505') {
        try {
          const { data: existing, error: fetchErr } = await supabase
            .from('users')
            .select('id, email, name, avatar_url')
            .eq('email', sanitizedUserInfo.email)
            .single();

          if (!fetchErr && existing) {
            console.log('Found existing user after duplicate email:', existing.id);
            // If we attempted to set a password and existing row lacks it, update
            if (sanitizedUserInfo.password_hash && !existing.password_hash) {
              await supabase
                .from('users')
                .update({ password_hash: sanitizedUserInfo.password_hash })
                .eq('id', existing.id);
            }
            return {
              id: existing.id,
              email: existing.email,
              name: existing.name,
              avatar_url: existing.avatar_url
            };
          }
        } catch (lookupErr) {
          console.error('Lookup existing user failed:', lookupErr);
        }
      }

      // Generic fallback
      return {
        id: sanitizedUserInfo.id || null,
        email: sanitizedUserInfo.email,
        name: sanitizedUserInfo.name ?? 'User',
        avatar_url: sanitizedUserInfo.avatar_url ?? null
      };
    }
    // main success return
return {
  id: data.id,
  email: data.email,
  name: data.name,
  avatar_url: data.avatar_url ?? sanitizedUserInfo.avatar_url ?? null
};

// final catch fallback
return {
  id: userInfo.id,
  email: userInfo.email,
  name: userInfo.name ?? 'User',
  avatar_url: userInfo.avatar_url ?? null
};

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
      avatar_url: data.avatar_url || sanitizedUserInfo.avatar_url || null
    };
  } catch (error) {
    console.error('Error upserting user:', error);
    // Fallback to mock implementation
    return {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name ?? 'User', 
      avatar_url: userInfo.picture || userInfo.avatar_url || null
      // fallback uses avatar_url if available
      // picture retained for backward compatibility but property may be undefined
    };
  }
}; 