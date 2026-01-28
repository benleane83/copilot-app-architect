/**
 * Express server setup
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createRouter } from './routes.js';

const DEFAULT_PORT = 3000;

/**
 * Start the API server
 */
export function startServer(port: number = DEFAULT_PORT): express.Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Ensure data directory exists
  const dataDir = './data';
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // API routes
  app.use('/api', createRouter());

  // Serve static files from the React build
  const webDir = path.join(process.cwd(), 'dist', 'web');
  if (fs.existsSync(webDir)) {
    app.use(express.static(webDir));
    
    // SPA fallback - serve index.html for non-API routes
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(webDir, 'index.html'));
      }
    });
  }

  // Start server
  app.listen(port, () => {
    console.log(`🚀 Copilot App Architect server running at http://localhost:${port}`);
    console.log(`   API: http://localhost:${port}/api`);
    if (fs.existsSync(webDir)) {
      console.log(`   Web UI: http://localhost:${port}`);
    }
  });

  return app;
}
