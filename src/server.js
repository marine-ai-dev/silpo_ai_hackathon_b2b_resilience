import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SilpoGateway } from './silpo/SilpoGateway.js';
import { buildApiRouter } from './routes/api.js';
import { buildSilpoAuthRouter } from './routes/silpoAuth.js';
import { seedIfEmpty } from '../scripts/seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

seedIfEmpty();

const silpoGateway = new SilpoGateway();

app.use('/api/silpo', buildSilpoAuthRouter());
app.use('/api', buildApiRouter(silpoGateway));
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Silpo office procurement MVP listening on http://localhost:${PORT}`);
  console.log(`SILPO_MODE=${process.env.SILPO_MODE || 'mock'}`);
});
