// Test Gmail API functionality
import fetch from 'node-fetch';

const GMAIL_TOKEN = process.env.GMAIL_TOKEN || 'your_gmail_token_here';

async function testGmailAPI() {
  try {
    console.log('=== TESTING GMAIL API ===\n');
    
    if (!GMAIL_TOKEN || GMAIL_TOKEN === 'your_gmail_token_here') {
      console.log('Please set GMAIL_TOKEN environment variable');
      return;
    }
    
    console.log('1. Testing Gmail API connection...');
    
    // Test basic Gmail API call
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        'Authorization': `Bearer ${GMAIL_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Profile response status:', response.status);
    
    if (response.ok) {
      const profile = await response.json();
      console.log('Gmail profile:', profile);
    } else {
      const error = await response.text();
      console.error('Gmail API error:', error);
      return;
    }
    
    // Test message search
    console.log('\n2. Testing message search...');
    
    const searchResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=subject:subscription&maxResults=5',
      {
        headers: {
          'Authorization': `Bearer ${GMAIL_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Search response status:', searchResponse.status);
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      console.log('Search results:', {
        resultSizeEstimate: searchData.resultSizeEstimate,
        messages: searchData.messages?.length || 0
      });
      
      if (searchData.messages && searchData.messages.length > 0) {
        console.log('Sample message IDs:', searchData.messages.slice(0, 3).map(m => m.id));
      }
    } else {
      const error = await searchResponse.text();
      console.error('Search error:', error);
    }
    
    // Test broader search
    console.log('\n3. Testing broader search...');
    
    const broadResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5',
      {
        headers: {
          'Authorization': `Bearer ${GMAIL_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Broad search response status:', broadResponse.status);
    
    if (broadResponse.ok) {
      const broadData = await broadResponse.json();
      console.log('Broad search results:', {
        resultSizeEstimate: broadData.resultSizeEstimate,
        messages: broadData.messages?.length || 0
      });
    } else {
      const error = await broadResponse.text();
      console.error('Broad search error:', error);
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

testGmailAPI(); 