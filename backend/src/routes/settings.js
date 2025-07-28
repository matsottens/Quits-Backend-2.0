import express from 'express';
import { authenticateUser } from '../middleware/auth.js';

// Temporary in-memory store per user
const userSettings = {};

const router = express.Router();

// All settings routes require authentication
router.use(authenticateUser);

router.get('/', async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const settings = userSettings[userId] || {};
  return res.json(settings);
});

router.put('/', async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const patch = req.body || {};
  userSettings[userId] = {
    ...userSettings[userId],
    ...patch,
  };
  return res.json(userSettings[userId]);
});

router.get('/export', async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const settings = userSettings[userId] || {};
  const json = JSON.stringify(settings, null, 2);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="quits-settings.json"');
  return res.send(json);
});

export default router; 