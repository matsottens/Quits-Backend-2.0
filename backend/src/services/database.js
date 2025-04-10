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

    // For now, return a mock user for testing
    return {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name || 'User',
      picture: userInfo.picture || null
    };
    
    // In a real implementation, we'd do:
    // const { data, error } = await supabase
    //   .from('users')
    //   .upsert({
    //     id: userInfo.id,
    //     email: userInfo.email,
    //     name: userInfo.name,
    //     profile_picture: userInfo.picture,
    //     verified_email: userInfo.verified_email,
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