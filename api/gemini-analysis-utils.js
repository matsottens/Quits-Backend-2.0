// Gemini analysis utility functions
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// Supabase config
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;

const supabase = createClient(supabaseUrl, supabaseKey);

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

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

  // Analyze each email with Gemini
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

      // Prepare email content for Gemini
      const emailContent = `
Subject: ${email.subject}
From: ${email.sender}
Date: ${email.date}
Content: ${email.content}
      `.trim();

      // Create Gemini prompt
      const geminiPrompt = `
You are an AI assistant that analyzes emails to identify subscription information. 

Please analyze the following email and extract subscription details if present. If this email is NOT related to a subscription, return null for all fields.

Email to analyze:
${emailContent}

Please respond with a JSON object containing the following fields (use null if not found):
{
  "is_subscription": boolean,
  "subscription_name": string or null,
  "price": number or null,
  "currency": string or null (e.g., "USD", "EUR"),
  "billing_cycle": string or null (e.g., "monthly", "yearly", "weekly"),
  "next_billing_date": string or null (YYYY-MM-DD format),
  "service_provider": string or null,
  "confidence_score": number (0.0 to 1.0)
}

Only return valid JSON. If the email is not subscription-related, set is_subscription to false and all other fields to null.
      `;

      // Call Gemini API
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
        })
      });

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
        // Extract JSON from response (in case Gemini adds extra text)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
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
        errorCount++;
        continue;
      }

      analyzedCount++;
      console.log(`Successfully analyzed email ${email.id}`);

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
  }

  console.log(`Analysis completed. Analyzed: ${analyzedCount}, Errors: ${errorCount}`);

  return {
    success: true,
    analyzed_count: analyzedCount,
    error_count: errorCount,
    total_emails: emailData.length
  };
} 