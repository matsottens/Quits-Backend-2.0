#!/bin/bash
# Deploy script for consolidated API to Vercel Hobby tier

echo "Preparing to deploy consolidated API to Vercel..."

# Make sure vercel.json is properly set up
if [ ! -f "vercel.json" ]; then
    echo "Error: vercel.json not found!"
    exit 1
fi

# Check for required files
if [ ! -f "api.js" ] || [ ! -f "combined-handlers.js" ] || [ ! -f "cors-middleware.js" ]; then
    echo "Error: Required files missing. Make sure api.js, combined-handlers.js, and cors-middleware.js exist."
    exit 1
fi

# Create a .vercelignore file to exclude test files
cat > .vercelignore << EOF
# Test files
test-*.js
**/test-*.js
**/tests

# Documentation
README.md
CHANGELOG.md
LICENSE

# Local development files
.env.local
.env.development
EOF

echo "Created .vercelignore file"

# Deploy to Vercel using the CLI
echo "Deploying to Vercel..."
vercel --prod

# Check deployment status
if [ $? -eq 0 ]; then
    echo "Deployment triggered successfully! Your consolidated API should be live soon."
    echo "Remember to check Vercel logs for any errors."
    echo ""
    echo "Important notes:"
    echo "1. The API now has a single serverless function instead of many separate ones"
    echo "2. All API requests are handled through the main API gateway (api.js)"
    echo "3. Debug endpoints are available at /api/debug-* paths"
    echo ""
    echo "To revert to individual serverless functions, remove or rename the vercel.json file."
else
    echo "Deployment failed. Please check the output above for errors."
fi 