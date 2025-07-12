import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testScanStatus() {
  try {
    console.log('Testing scan status...');
    
    // Check scan_history table
    const { data: scans, error: scanError } = await supabase
      .from('scan_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (scanError) {
      console.error('Error fetching scans:', scanError);
      return;
    }
    
    console.log(`Found ${scans.length} recent scans:`);
    scans.forEach(scan => {
      console.log(`- Scan ID: ${scan.scan_id}`);
      console.log(`  Status: ${scan.status}`);
      console.log(`  User ID: ${scan.user_id}`);
      console.log(`  Emails found: ${scan.emails_found}`);
      console.log(`  Emails processed: ${scan.emails_processed}`);
      console.log(`  Created: ${scan.created_at}`);
      console.log(`  Updated: ${scan.updated_at}`);
      console.log('');
    });
    
    // Check email_data table
    if (scans.length > 0) {
      const latestScanId = scans[0].scan_id;
      console.log(`Checking email_data for scan ${latestScanId}...`);
      
      const { data: emails, error: emailError } = await supabase
        .from('email_data')
        .select('*')
        .eq('scan_id', latestScanId);
      
      if (emailError) {
        console.error('Error fetching emails:', emailError);
      } else {
        console.log(`Found ${emails.length} emails for scan ${latestScanId}`);
        if (emails.length > 0) {
          console.log('Sample email:', {
            id: emails[0].id,
            subject: emails[0].subject,
            from: emails[0].from_address,
            content_length: emails[0].content?.length || 0
          });
        }
      }
    }
    
    // Check subscription_analysis table
    console.log('\nChecking subscription_analysis table...');
    const { data: analysis, error: analysisError } = await supabase
      .from('subscription_analysis')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (analysisError) {
      console.error('Error fetching analysis:', analysisError);
    } else {
      console.log(`Found ${analysis.length} subscription analyses`);
      analysis.forEach(item => {
        console.log(`- Analysis ID: ${item.id}`);
        console.log(`  Subscription: ${item.subscription_name}`);
        console.log(`  Price: ${item.price} ${item.currency}`);
        console.log(`  Confidence: ${item.confidence_score}`);
        console.log('');
      });
    }
    
    // Check subscriptions table
    console.log('Checking subscriptions table...');
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (subError) {
      console.error('Error fetching subscriptions:', subError);
    } else {
      console.log(`Found ${subscriptions.length} subscriptions`);
      subscriptions.forEach(sub => {
        console.log(`- Subscription: ${sub.name}`);
        console.log(`  Price: ${sub.price} ${sub.currency}`);
        console.log(`  Billing: ${sub.billing_cycle}`);
        console.log(`  Provider: ${sub.provider}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testScanStatus(); 