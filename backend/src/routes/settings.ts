import express from 'express';
import { authenticateUser } from '../middleware/auth.js';

// Temporary in-memory store per user
const userSettings: Record<string, any> = {};

const router = express.Router();

// All settings routes require authentication
router.use(authenticateUser);

router.get('/', async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const settings = userSettings[userId] || {};
  return res.json(settings);
});

router.put('/', async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const patch = req.body || {};
  userSettings[userId] = {
    ...userSettings[userId],
    ...patch,
  };
  return res.json(userSettings[userId]);
});

export default router; 