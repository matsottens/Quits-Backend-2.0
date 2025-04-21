// Forward to email-scan.js for backward compatibility
import emailScanHandler from './email-scan.js';

export default function handler(req, res) {
  console.log('Forwarding from scan-subscriptions to email-scan');
  return emailScanHandler(req, res);
} 