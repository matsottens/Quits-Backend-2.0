# Google OAuth Setup Guide for Quits 2.0

This guide will walk you through setting up Google OAuth for your Quits 2.0 application.

## 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Go to "APIs & Services" > "Credentials"

## 2. Configure OAuth Consent Screen

1. Click "Configure Consent Screen"
2. Select "External" if you're not using Google Workspace
3. Fill out the required information:
   - App name: "Quits"
   - User support email: Your email
   - Developer contact information: Your email
4. Add the following scopes:
   - `./auth/userinfo.email`
   - `./auth/userinfo.profile`
   - `openid`
5. Add your domains to the authorized domains section, e.g., `quits.cc` and `api.quits.cc`

## 3. Create OAuth Client ID

1. Go back to "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Web application"
4. Name: "Quits Web Client"
5. Add the following authorized JavaScript origins:
   - `https://www.quits.cc`
   - `https://quits.cc`
   - `https://api.quits.cc`
   - `http://localhost:3000` (for local development)
6. Add the following authorized redirect URIs:
   - `https://quits.cc/auth/callback`
   - `https://www.quits.cc/auth/callback`
   - `https://api.quits.cc/api/auth/google/callback`
   - `https://api.quits.cc/auth/google/callback`
   - `http://localhost:3000/auth/callback` (for local development)
7. Click "Create"
8. Note your Client ID and Client Secret

## 4. Add Credentials to Environment Variables

Add the following to your environment variables:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URI=https://quits.cc/auth/callback
JWT_SECRET=your-jwt-secret
```

- For Vercel deployment, add these environment variables in the Vercel dashboard
- For local development, add them to your `.env` file

## 5. Verify Redirect URIs

Make sure the redirect URI used in your application matches EXACTLY what's configured in the Google Cloud Console. The OAuth authentication will fail if there is even a slight mismatch.

The most important is to use `https://quits.cc/auth/callback` in your code and Google Console, which is already set up in the application.

## Troubleshooting

If you encounter issues with the Google OAuth flow:

1. **CORS errors**: Ensure your CORS configuration allows both `www.quits.cc` and `quits.cc` origins
2. **404 Not Found on callbacks**: Check your Vercel `vercel.json` routes to ensure they properly route to the correct handlers
3. **Redirect URI mismatch**: Make sure the redirect URI in your code exactly matches what's in the Google Console
4. **Console logs**: Check the logs in both the frontend and API to see where the process is failing
5. **Local development**: Use the included mock authentication when testing locally without setting up Google OAuth 