/**
 * Main entry point for the Copilot App Architect server
 */
import { startServer } from './api/server.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

startServer(port);
