/**
 * Main entry point for the Copilot App Architect server
 */
import { startServer } from './api/server.js';
import { shutdown } from './api/routes.js';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

startServer(port);

// Graceful shutdown handlers
const shutdownHandler = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  try {
    await shutdown();
    console.log('✅ Cleanup complete');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
