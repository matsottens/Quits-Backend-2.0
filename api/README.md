# Quits API - Consolidated for Vercel Hobby Tier

This folder contains the API for the Quits subscription management app, optimized for deployment on Vercel's Hobby tier which has limitations on the number of serverless functions.

## Architecture Overview

To work within Vercel's Hobby tier limitations (max 12 serverless functions per project), we've consolidated our API using the following approach:

1. **Unified API Gateway**: All requests are routed through a single entry point (`api.js`)
2. **Combined Handlers**: Related API functionality is grouped in the `combined-handlers.js` file
3. **Rewrite Rules**: Vercel configuration uses rewrites to route all API requests to the unified handler

## Key Files

- `api.js` - Main entry point for all API requests
- `combined-handlers.js` - Routes requests to the appropriate handler functions
- `vercel.json` - Configuration for Vercel deployments with rewrite rules
- `test-combined-api.js` - Test script to verify the consolidated API approach locally

## Local Development

To test the API locally:

```bash
# Navigate to the API directory
cd api

# Install dependencies if needed
npm install

# Run the test server
node test-combined-api.js
```

The test server will start on port 3000 (or the port specified in your environment variables).

## Deployment Strategy

When deploying to Vercel, only the `api.js` file will be registered as a serverless function. All requests to any API path will be rewritten to this single endpoint, which will then route the request to the appropriate handler internally.

This approach allows us to stay within the Hobby tier limits while maintaining the full functionality of the API.

## Important Notes

1. **Memory Usage**: The combined handler is allocated 1024MB of memory to ensure it can handle all requests
2. **Execution Time**: The maximum duration is set to 60 seconds to accommodate longer operations like email scanning
3. **CORS Headers**: The Vercel configuration includes the necessary CORS headers for cross-domain requests
4. **Request Path**: The original request path is preserved and available to the handler functions

## Adding New Endpoints

To add a new API endpoint:

1. Create the handler function in a separate file as usual
2. Import and register the handler in `combined-handlers.js`
3. No changes to `vercel.json` are needed

## Debugging

For debugging deployment issues:

1. Check the Vercel deployment logs for errors
2. Use the `/api/debug-env` endpoint to verify environment variables
3. The `/api/health` endpoint provides basic status information

## Switching Back to Individual Functions

If you need to switch back to individual functions (e.g., if you upgrade to a higher Vercel tier), simply remove or rename the `vercel.json` file. 