#!/bin/bash

# Install dependencies
npm install

# Build backend
cd backend && npm install && npm run build

# Create necessary directories
mkdir -p public

# Copy necessary files to public
echo '{"message": "API is running"}' > public/index.json

# Print success message
echo "Build completed successfully!" 