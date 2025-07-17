import { Headers, Request, Response } from 'undici';
globalThis.Headers = Headers;
globalThis.Request = Request;
globalThis.Response = Response;

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/search.route.js';
import { basicAuth } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (login page)
app.use(express.static(path.join(__dirname, 'public')));

// Protect API routes with basic auth
app.use('/api', basicAuth, apiRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
