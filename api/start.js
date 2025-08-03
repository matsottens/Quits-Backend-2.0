import dotenv from 'dotenv';
// Prefer .env.local in project root, then .env
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

dotenv.config({ path: join(rootDir, '.env.local') });
dotenv.config({ path: join(rootDir, '.env') });

// A simple server for local development
import { app } from './index.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 API server is running at http://localhost:${PORT}`);
  console.log('This is for local development only.');
  console.log('Use `vercel deploy` for production.');
}); 