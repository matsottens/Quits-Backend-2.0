import express, { Request, Response } from 'express';
const router = express.Router();

router.post('/scan', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Scan endpoint hit!' });
});

router.post('/email-scan', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Email scan endpoint hit!' });
});

export default router; 