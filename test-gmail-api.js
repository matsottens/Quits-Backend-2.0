// Test script to check Gmail API functionality
import fetch from 'node-fetch';

const GMAIL_TOKEN = process.env.GMAIL_TOKEN; // You'll need to set this manually for testing

async function testGmailAPI() {
  try {
    console.log('=== GMAIL API TEST ===\n');
    
    if (!GMAIL_TOKEN) {
      console.log('❌ No Gmail token provided. Set GMAIL_TOKEN environment variable to test.');
      console.log('You can get a token from the browser console or from a valid JWT token.');
      return;
    }
    
    console.log('1. Testing Gmail API profile endpoint...');
    const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        Authorization: `Bearer ${GMAIL_TOKEN}`,
        'Content-Type': 'application/json',
      }
    });
    
    console.log(`Profile response status: ${profileResponse.status}`);
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      console.log('✅ Gmail API profile access successful');
      console.log(`Email: ${profile.emailAddress}`);
      console.log(`Messages total: ${profile.messagesTotal}`);
      console.log(`Threads total: ${profile.threadsTotal}`);
    } else {
      const errorText = await profileResponse.text();
      console.error('❌ Gmail API profile access failed:', errorText);
      return;
    }
    
    console.log('\n2. Testing Gmail API messages endpoint...');
    const messagesResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5', {
      headers: {
        Authorization: `Bearer ${GMAIL_TOKEN}`,
        'Content-Type': 'application/json',
      }
    });
    
    console.log(`Messages response status: ${messagesResponse.status}`);
    if (messagesResponse.ok) {
      const messages = await messagesResponse.json();
      console.log('✅ Gmail API messages access successful');
      console.log(`Found ${messages.messages?.length || 0} messages`);
      if (messages.messages && messages.messages.length > 0) {
        console.log('Sample message IDs:', messages.messages.slice(0, 3).map(m => m.id));
      }
    } else {
      const errorText = await messagesResponse.text();
      console.error('❌ Gmail API messages access failed:', errorText);
      return;
    }
    
    console.log('\n3. Testing subscription-related search...');
    const searchQuery = 'subject:(subscription OR receipt OR invoice OR payment)';
    const searchResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=10`, {
      headers: {
        Authorization: `Bearer ${GMAIL_TOKEN}`,
        'Content-Type': 'application/json',
      }
    });
    
    console.log(`Search response status: ${searchResponse.status}`);
    if (searchResponse.ok) {
      const searchResults = await searchResponse.json();
      console.log('✅ Gmail API search successful');
      console.log(`Found ${searchResults.messages?.length || 0} subscription-related messages`);
      if (searchResults.messages && searchResults.messages.length > 0) {
        console.log('Sample message IDs:', searchResults.messages.slice(0, 3).map(m => m.id));
      }
    } else {
      const errorText = await searchResponse.text();
      console.error('❌ Gmail API search failed:', errorText);
    }
    
    console.log('\n=== TEST COMPLETE ===');
    console.log('If all tests passed, the Gmail API is working correctly.');
    console.log('If any failed, check the token permissions and validity.');
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testGmailAPI(); 