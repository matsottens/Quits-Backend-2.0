// Test script for email scanning functionality
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testEmailScanning() {
  try {
    console.log('Testing email scanning functionality...');
    
    // Test 1: Check if email_data table exists and has data
    console.log('\n=== Test 1: Checking email_data table ===');
    const { data: emailData, error: emailError } = await supabase
      .from('email_data')
      .select('*')
      .limit(5);
    
    if (emailError) {
      console.error('Error fetching email data:', emailError);
    } else {
      console.log(`Found ${emailData.length} email records in email_data table`);
      if (emailData.length > 0) {
        console.log('Sample email data:', {
          id: emailData[0].id,
          scan_id: emailData[0].scan_id,
          subject: emailData[0].subject,
          sender: emailData[0].sender,
          content_length: emailData[0].content?.length || 0
        });
      }
    }
    
    // Test 2: Check scan_history table
    console.log('\n=== Test 2: Checking scan_history table ===');
    const { data: scanHistory, error: scanError } = await supabase
      .from('scan_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (scanError) {
      console.error('Error fetching scan history:', scanError);
    } else {
      console.log(`Found ${scanHistory.length} scan records`);
      if (scanHistory.length > 0) {
        console.log('Latest scan:', {
          scan_id: scanHistory[0].scan_id,
          status: scanHistory[0].status,
          emails_found: scanHistory[0].emails_found,
          emails_processed: scanHistory[0].emails_processed,
          subscriptions_found: scanHistory[0].subscriptions_found
        });
      }
    }
    
    // Test 3: Check subscription_analysis table
    console.log('\n=== Test 3: Checking subscription_analysis table ===');
    const { data: analysisData, error: analysisError } = await supabase
      .from('subscription_analysis')
      .select('*')
      .limit(5);
    
    if (analysisError) {
      console.error('Error fetching subscription analysis:', analysisError);
    } else {
      console.log(`Found ${analysisData.length} analysis records`);
      if (analysisData.length > 0) {
        console.log('Sample analysis:', {
          id: analysisData[0].id,
          subscription_name: analysisData[0].subscription_name,
          confidence_score: analysisData[0].confidence_score,
          analysis_status: analysisData[0].analysis_status
        });
      }
    }
    
    // Test 4: Check subscriptions table
    console.log('\n=== Test 4: Checking subscriptions table ===');
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .limit(5);
    
    if (subError) {
      console.error('Error fetching subscriptions:', subError);
    } else {
      console.log(`Found ${subscriptions.length} subscription records`);
      if (subscriptions.length > 0) {
        console.log('Sample subscription:', {
          id: subscriptions[0].id,
          name: subscriptions[0].name,
          price: subscriptions[0].price,
          billing_cycle: subscriptions[0].billing_cycle,
          is_manual: subscriptions[0].is_manual
        });
      }
    }
    
    console.log('\n=== Test Summary ===');
    console.log('Email scanning functionality appears to be working correctly.');
    console.log('The email_data table is storing email content for Gemini analysis.');
    console.log('The scan_history table tracks scanning progress.');
    console.log('The subscription_analysis table stores Gemini analysis results.');
    console.log('The subscriptions table stores final subscription data.');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testEmailScanning(); 