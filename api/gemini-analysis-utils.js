// Gemini analysis utility functions
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Function to normalize service names for better duplicate detection
const normalizeServiceName = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // Remove non-alphanumeric characters
    .replace(/\b(inc|llc|ltd|corp|co|company|limited|incorporated)\b/g, '') // Remove company suffixes
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
};

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

// Function to convert analysis results to subscriptions
async function convertAnalysisToSubscriptions(userId, scanId) {
  console.log(`Converting analysis results to subscriptions for user ${userId}, scan ${scanId}`);
  
  try {
    // Get all successful analysis results for this scan (including those with null subscription names)
    const { data: analysisResults, error: fetchError } = await supabase
      .from('subscription_analysis')
      .select('*')
      .eq('user_id', userId)
      .eq('scan_id', scanId)
      .eq('analysis_status', 'completed');

    if (fetchError) {
      console.error('Error fetching analysis results:', fetchError);
      return;
    }

    if (!analysisResults || analysisResults.length === 0) {
      console.log('No successful analysis results to convert');
      return;
    }

    console.log(`Found ${analysisResults.length} successful analysis results to convert`);

    let convertedCount = 0;
    for (const analysis of analysisResults) {
      try {
        // Skip if no subscription name was found
        if (!analysis.subscription_name) {
          console.log(`Skipping analysis ${analysis.id} - no subscription name found`);
          continue;
        }

        // Normalize the subscription name for duplicate checking
        const normalizedName = normalizeServiceName(analysis.subscription_name);
        console.log(`Normalized subscription name: "${analysis.subscription_name}" -> "${normalizedName}"`);

        // Check if subscription already exists using normalized name
        const { data: existingSubscriptions, error: checkError } = await supabase
          .from('subscriptions')
          .select('id, name')
          .eq('user_id', userId)
          .ilike('name', `%${normalizedName}%`);

        if (checkError) {
          console.error(`Error checking for existing subscriptions:`, checkError);
        } else if (existingSubscriptions && existingSubscriptions.length > 0) {
          console.log(`Subscription "${analysis.subscription_name}" (normalized: "${normalizedName}") already exists, skipping`);
          console.log(`Existing subscriptions found:`, existingSubscriptions.map(s => s.name));
          continue;
        }

        // Create new subscription from analysis result
        const { error: insertError } = await supabase
          .from('subscriptions')
          .insert({
            user_id: userId,
            name: analysis.subscription_name,
            price: analysis.price || 0,
            billing_cycle: analysis.billing_cycle || 'monthly',
            next_billing_date: analysis.next_billing_date,
            category: 'auto-detected',
            is_manual: false,
            source_analysis_id: analysis.id,
            service_provider: analysis.service_provider,
            confidence_score: analysis.confidence_score,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (insertError) {
          console.error(`Error creating subscription from analysis ${analysis.id}:`, insertError);
        } else {
          convertedCount++;
          console.log(`Created subscription: ${analysis.subscription_name} (confidence: ${analysis.confidence_score})`);
        }

      } catch (error) {
        console.error(`Error processing analysis ${analysis.id}:`, error);
      }
    }

    console.log(`Successfully converted ${convertedCount} analysis results to subscriptions`);

  } catch (error) {
    console.error('Error converting analysis to subscriptions:', error);
  }
}

// Function to analyze emails with Gemini
export async function analyzeEmailsForUser(userId, scanId) {
  console.log(`Starting email analysis for user ${userId}, scan ${scanId}`);

  // Fetch unanalyzed email data for this scan
  const { data: emailData, error: fetchError } = await supabase
    .from('email_data')
    .select('*')
    .eq('scan_id', scanId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error('Error fetching email data:', fetchError);
    throw new Error('Failed to fetch email data');
  }

  if (!emailData || emailData.length === 0) {
    console.log('No email data found for analysis');
    return {
      success: true,
      message: 'No email data found for analysis',
      analyzed_count: 0
    };
  }

  console.log(`Found ${emailData.length} emails to analyze`);

  // Process emails one at a time to avoid overwhelming the API
  let analyzedCount = 0;
  let errorCount = 0;

  for (const email of emailData) {
    try {
      console.log(`Analyzing email: ${email.subject}`);

      // Check if this email has already been analyzed
      const { data: existingAnalysis } = await supabase
        .from('subscription_analysis')
        .select('id')
        .eq('email_data_id', email.id)
        .single();

      if (existingAnalysis) {
        console.log(`Email ${email.id} already analyzed, skipping`);
        continue;
      }

      // Prepare email content for Gemini (truncate to avoid token limits)
      const emailContent = `
Subject: ${email.subject}
From: ${email.sender}
Date: ${email.date}
Content: ${email.content.substring(0, 1000)}
      `.trim();

      // Create Gemini prompt
      const geminiPrompt = `
This email has been pre-filtered as potentially subscription-related. Extract ALL subscription information you can find. Return only valid JSON:

{
  "is_subscription": boolean (true if any subscription info found),
  "subscription_name": string (extract the service/product name),
  "price": number (extract the amount, convert to number),
  "currency": string (USD, EUR, etc.),
  "billing_cycle": string (monthly, yearly, weekly, etc.),
  "next_billing_date": string (YYYY-MM-DD format if found),
  "service_provider": string (company name),
  "confidence_score": number (0.0 to 1.0 based on how clear the info is)
}

Be aggressive in finding subscription details. If you see any payment, service, or subscription information, extract it. If no clear subscription info, set is_subscription to false.

Email: ${emailContent}`;

      // Call Gemini API with shorter timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      try {
        const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: geminiPrompt
              }]
            }]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          console.error(`Gemini API error for email ${email.id}:`, errorText);
          throw new Error(`Gemini API error: ${geminiResponse.status}`);
        }

        const geminiData = await geminiResponse.json();
        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
          throw new Error('No response from Gemini API');
        }

        // Parse Gemini response
        let analysisResult;
        try {
          // Extract JSON from response
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysisResult = JSON.parse(jsonMatch[0]);
            console.log(`Parsed analysis result for email ${email.id}:`, analysisResult);
          } else {
            throw new Error('No JSON found in Gemini response');
          }
        } catch (parseError) {
          console.error(`Failed to parse Gemini response for email ${email.id}:`, responseText);
          throw new Error(`JSON parse error: ${parseError.message}`);
        }

        // Store analysis result
        const { error: insertError } = await supabase
          .from('subscription_analysis')
          .insert({
            email_data_id: email.id,
            user_id: userId,
            scan_id: scanId,
            subscription_name: analysisResult.subscription_name,
            price: analysisResult.price,
            currency: analysisResult.currency || 'USD',
            billing_cycle: analysisResult.billing_cycle,
            next_billing_date: analysisResult.next_billing_date,
            service_provider: analysisResult.service_provider,
            confidence_score: analysisResult.confidence_score || 0.5,
            analysis_status: 'completed',
            gemini_response: responseText,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (insertError) {
          console.error(`Error storing analysis for email ${email.id}:`, insertError);
          throw new Error(`Database error: ${insertError.message}`);
        }

        analyzedCount++;
        console.log(`Successfully analyzed email ${email.id} - Subscription: ${analysisResult.subscription_name}, Price: ${analysisResult.price}`);

      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Gemini API request timed out');
        }
        throw fetchError;
      }

    } catch (error) {
      console.error(`Error analyzing email ${email.id}:`, error);
      errorCount++;
      
      // Store error record
      try {
        await supabase
          .from('subscription_analysis')
          .insert({
            email_data_id: email.id,
            user_id: userId,
            scan_id: scanId,
            analysis_status: 'failed',
            error_message: error.message,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      } catch (insertError) {
        console.error(`Error storing error record for email ${email.id}:`, insertError);
      }
    }

    // Small delay between emails to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`Analysis completed. Analyzed: ${analyzedCount}, Errors: ${errorCount}`);

  // Convert successful analysis results to subscriptions
  if (analyzedCount > 0) {
    await convertAnalysisToSubscriptions(userId, scanId);
  }

  return {
    success: true,
    analyzed_count: analyzedCount,
    error_count: errorCount,
    total_emails: emailData.length
  };
} 