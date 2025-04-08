import { supabase } from '../config/supabase.js';

interface GoogleUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  verified_email?: boolean;
}

interface Subscription {
  id?: string;
  user_id: string;
  name: string;
  price: number;
  billing_period: string;
  next_payment_date?: string;
  created_at?: string;
  updated_at?: string;
}

export async function upsertUser(userInfo: GoogleUserInfo) {
  const { data: user, error } = await supabase
    .from('users')
    .upsert({
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      avatar_url: userInfo.picture,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'id'
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting user:', error);
    throw error;
  }

  return user;
}

export async function createSubscription(subscription: Subscription) {
  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      ...subscription,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating subscription:', error);
    throw error;
  }

  return data;
}

export async function getUserSubscriptions(userId: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user subscriptions:', error);
    throw error;
  }

  return data;
}

export async function updateSubscription(id: string, updates: Partial<Subscription>) {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }

  return data;
}

export async function deleteSubscription(id: string) {
  const { error } = await supabase
    .from('subscriptions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting subscription:', error);
    throw error;
  }
} 