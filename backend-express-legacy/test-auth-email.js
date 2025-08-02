/**
 * Quick integration test for new email/password auth endpoints.
 *
 * Usage:
 * 1. Ensure the API server is running locally on http://localhost:3000 (or set API_URL env).
 * 2. node backend/test-auth-email.js
 */

import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const API_URL = process.env.API_URL || 'http://localhost:3000/api/auth';

(async () => {
  try {
    const email = `test_${Date.now()}@example.com`;
    const password = 'Password123!';

    console.log('Testing signup…');
    let res = await fetch(`${API_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const signupJson = await res.json();
    console.log('Signup response', signupJson);
    if (!signupJson.token) throw new Error('Signup failed');

    console.log('Testing login…');
    res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const loginJson = await res.json();
    console.log('Login response', loginJson);
    if (!loginJson.token) throw new Error('Login failed');

    console.log('Testing forgot-password…');
    res = await fetch(`${API_URL}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const forgotJson = await res.json();
    console.log('Forgot-password response', forgotJson);
    if (!forgotJson.success) throw new Error('Forgot password failed');

    console.log('All tests passed');
  } catch (error) {
    console.error('Auth flow test failed', error);
    process.exit(1);
  }
})(); 