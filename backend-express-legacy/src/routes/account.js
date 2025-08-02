import express from 'express';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateUser);

router.delete('/', async (req, res) => {
  const userId = req.user?.id;
  // TODO: Delete user from DB, Supabase, etc.
  console.log(`[ACCOUNT] Deleting user ${userId}`);
  return res.status(200).json({ success: true });
});

export default router; 