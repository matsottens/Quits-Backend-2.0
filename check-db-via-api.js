// Check database via API endpoints
import fetch from 'node-fetch';

const API_BASE = 'https://api.quits.cc';

async function checkDatabase() {
  try {
    console.log('Checking database via API...');
    
    // First, let's check if we can get a valid token
    console.log('Getting auth token...');
    const authResponse = await fetch(`${API_BASE}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Auth response status:', authResponse.status);
    if (authResponse.ok) {
      const authData = await authResponse.json();
      console.log('Auth data:', authData);
    } else {
      const errorText = await authResponse.text();
      console.error('Auth error:', errorText);
    }
    
    // Check scan status endpoint
    console.log('\nChecking scan status...');
    const scanResponse = await fetch(`${API_BASE}/api/scan-status/scan_58blj1c899n`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Scan status response status:', scanResponse.status);
    if (scanResponse.ok) {
      const scanData = await scanResponse.json();
      console.log('Scan status data:', scanData);
    } else {
      const errorText = await scanResponse.text();
      console.error('Scan status error:', errorText);
    }
    
    // Check subscriptions endpoint
    console.log('\nChecking subscriptions...');
    const subResponse = await fetch(`${API_BASE}/api/subscription`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Subscriptions response status:', subResponse.status);
    if (subResponse.ok) {
      const subData = await subResponse.json();
      console.log('Subscriptions data:', subData);
    } else {
      const errorText = await subResponse.text();
      console.error('Subscriptions error:', errorText);
    }
    
  } catch (error) {
    console.error('Error checking database:', error);
  }
}

checkDatabase(); 