// Test script for combined API approach
import http from 'http';
import apiHandler from './api.js';

const PORT = process.env.PORT || 3000;

// Create a simple HTTP server to handle requests
const server = http.createServer(async (req, res) => {
  // Log the request
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  
  try {
    // Pass the request to our combined API handler
    await apiHandler(req, res);
  } catch (error) {
    console.error('Error handling request:', error);
    
    // Send an error response if not already sent
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      }));
    }
  }
});

// Start the server
server.listen(PORT, () => {
  console.log(`Combined API test server running on http://localhost:${PORT}`);
  console.log('Try the following endpoints:');
  console.log(`- http://localhost:${PORT}/api/health`);
  console.log(`- http://localhost:${PORT}/api/debug-env`);
  console.log(`- http://localhost:${PORT}/api`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
}); 