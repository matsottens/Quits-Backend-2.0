import express from 'express';

const app = express();
const PORT = 4000;

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Minimal Express 4 app is running.' });
});

app.listen(PORT, () => {
  console.log(`Minimal Express 4 app running on port ${PORT}`);
}); 