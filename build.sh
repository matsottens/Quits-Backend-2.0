#!/bin/bash
set -e  # Exit immediately if a command exits with a non-zero status

# Print message to indicate build start
echo "Starting build process..."

# Install root dependencies
npm install
echo "Root dependencies installed"

# Build backend
echo "Building backend..."
cd backend
npm install
npm run build
cd ..
echo "Backend build completed"

# Create and populate public directory in the project root
echo "Creating public directory..."
mkdir -p public

# Create static files
echo "Creating static files..."
echo '<!DOCTYPE html><html><head><title>Quits API</title></head><body><h1>Quits API</h1><p>Status: Online</p></body></html>' > public/index.html
echo '{"status":"online","message":"API is running"}' > public/status.json

# Make sure public directory exists and has content
echo "Checking public directory..."
find public -type f | sort
echo "Public directory contents verified"

# Print success message
echo "Build completed successfully!" 