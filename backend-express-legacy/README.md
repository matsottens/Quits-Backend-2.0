# Quits 2.0 Backend

Backend server for the Quits 2.0 subscription management application.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and update the values:
   ```
   cp .env.example .env
   ```

3. Compile TypeScript:
   ```
   npm run build
   ```

4. Start the development server:
   ```
   npm run dev
   ```

## Testing Email Scanning with Real Gmail Data

To test the email scanning functionality with real Gmail data:

1. First, ensure your TypeScript code is compiled:
   ```
   npm run build
   ```

2. Set the `TEST_GMAIL_ACCESS_TOKEN` in your `.env` file:
   - Obtain a Gmail OAuth token with `https://www.googleapis.com/auth/gmail.readonly` scope
   - You can get this by authenticating a user in the app and then extracting the access token from your database, or by using the Google OAuth Playground

3. Run the email scan test:
   ```
   node test-email-scan.js
   ```

This test will:
- Connect to Gmail API with your access token
- Search for potential subscription emails
- Extract and analyze content with Gemini AI
- Display detailed results for each email

## Production Deployment

For production deployment, set the environment variables:

```
NODE_ENV=production
```

And start the server:

```
npm start
``` 