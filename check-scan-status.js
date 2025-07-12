// Check scan status in database
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://dstsluflwxzkwouxcjkh.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkScanStatus() {
  try {
    console.log('Checking scan status in database...');
    
    // Check all scans
    const { data: allScans, error: scanError } = await supabase
      .from('scan_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (scanError) {
      console.error('Error fetching scans:', scanError);
      return;
    }
    
    console.log(`Found ${allScans.length} scans:`);
    allScans.forEach(scan => {
      console.log(`- Scan ID: ${scan.scan_id}`);
      console.log(`  Status: ${scan.status}`);
      console.log(`  Progress: ${scan.progress}%`);
      console.log(`  Emails found: ${scan.emails_found}`);
      console.log(`  Emails processed: ${scan.emails_processed}`);
      console.log(`  Subscriptions found: ${scan.subscriptions_found}`);
      console.log(`  Created: ${scan.created_at}`);
      console.log(`  Updated: ${scan.updated_at}`);
      console.log('');
    });
    
    // Check subscription analysis records
    console.log('Checking subscription analysis records...');
    const { data: analysis, error: analysisError } = await supabase
      .from('subscription_analysis')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (analysisError) {
      console.error('Error fetching analysis:', analysisError);
    } else {
      console.log(`Found ${analysis.length} subscription analyses:`);
      analysis.forEach(item => {
        console.log(`- Analysis ID: ${item.id}`);
        console.log(`  Scan ID: ${item.scan_id}`);
        console.log(`  Status: ${item.analysis_status}`);
        console.log(`  Subscription: ${item.subscription_name}`);
        console.log(`  Price: ${item.price} ${item.currency}`);
        console.log(`  Confidence: ${item.confidence_score}`);
        console.log(`  Email Data ID: ${item.email_data_id}`);
        console.log('');
      });
    }
    
    // Check email data records
    console.log('Checking email data records...');
    const { data: emailData, error: emailError } = await supabase
      .from('email_data')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (emailError) {
      console.error('Error fetching email data:', emailError);
    } else {
      console.log(`Found ${emailData.length} email data records:`);
      emailData.forEach(email => {
        console.log(`- Email ID: ${email.id}`);
        console.log(`  Scan ID: ${email.scan_id}`);
        console.log(`  Subject: ${email.subject}`);
        console.log(`  Sender: ${email.sender}`);
        console.log(`  Gmail Message ID: ${email.gmail_message_id}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('Check failed:', error);
  }
}

checkScanStatus(); 