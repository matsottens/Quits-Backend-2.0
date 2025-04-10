import { supabase } from '../config/supabase.js';

// Type for Google user info
export interface GoogleUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  verified_email?: boolean;
}

// Create or update a user in the database
export const upsertUser = async (userInfo: GoogleUserInfo) => {
  try {
    console.log('Upserting user:', userInfo.email);

    // Ensure that optional fields are properly handled
    const sanitizedUserInfo = {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name || null,
      picture: userInfo.picture || null,
      verified_email: typeof userInfo.verified_email === 'boolean' ? userInfo.verified_email : null
    };

    // For now, return a mock user for testing
    return {
      id: sanitizedUserInfo.id,
      email: sanitizedUserInfo.email,
      name: sanitizedUserInfo.name || 'User',
      picture: sanitizedUserInfo.picture || null
    };
    
    // In a real implementation, we'd do:
    // const { data, error } = await supabase
    //   .from('users')
    //   .upsert({
    //     id: sanitizedUserInfo.id,
    //     email: sanitizedUserInfo.email,
    //     name: sanitizedUserInfo.name,
    //     profile_picture: sanitizedUserInfo.picture,
    //     verified_email: sanitizedUserInfo.verified_email,
    //     updated_at: new Date().toISOString()
    //   }, { onConflict: 'id' })
    //   .select()
    //   .single();
    //
    // if (error) throw error;
    // return data;
  } catch (error) {
    console.error('Error upserting user:', error);
    throw error;
  }
}; 