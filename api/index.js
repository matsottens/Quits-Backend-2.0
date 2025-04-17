// Import the Express app from the backend
import app from '../backend/dist/app.js';

// This file serves as the entry point for Vercel serverless functions
export default async function handler(req, res) {
  // Pass the request to the Express app
  await app(req, res);
} 