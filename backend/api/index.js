// Vercel serverless entry point. The Express app is itself a (req, res)
// handler, so Vercel can invoke it directly. All /api/* requests are routed
// here by vercel.json; static assets are served by Vercel's CDN.
import app from '../src/app.js';

export default app;
