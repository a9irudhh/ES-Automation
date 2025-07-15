import { Headers, Request, Response } from 'undici';
globalThis.Headers = Headers;
globalThis.Request = Request;
globalThis.Response = Response;

import express from 'express';
import cors from 'cors';
import apiRouter from './routes/search.route.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
