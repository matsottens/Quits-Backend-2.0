// Simple endpoint to keep the API warm through cron jobs
export default function handler(req, res) {
  console.log('Keepalive function triggered at:', new Date().toISOString());
  
  res.status(200).json({
    status: 'ok',
    message: 'API is alive',
    timestamp: new Date().toISOString()
  });
} 