/**
 * API routes for the dependency graph service
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { LocalReader, GitHubReader } from '../readers/index.js';
import { buildGraph } from '../graph/builder.js';
import { GraphStorage } from '../graph/storage.js';
import { GraphAnalyzer } from '../graph/analyzer.js';
import { AgentService } from '../agent/server.js';
import { sessionManager } from '../session/manager.js';
import { 
  parseTerraform, 
  parseDockerCompose, 
  parseKubernetes, 
  parseCodeowners, 
  parsePackageJson 
} from '../parsers/index.js';
import type { ParsedDependency, DependencyGraph } from '../types.js';

// Request schemas
const scanRequestSchema = z.object({
  type: z.enum(['github', 'local']),
  path: z.string().min(1),
  branch: z.string().optional(),
  name: z.string().optional(),
});

const askRequestSchema = z.object({
  graphId: z.string(),
  question: z.string().min(1),
  selectedNodes: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
});

// Graph storage and agent service instances
let storage: GraphStorage | null = null;
let agentService: AgentService | null = null;

/**
 * Initialize storage (called after data directory is created)
 */
function getStorage(): GraphStorage {
  if (!storage) {
    storage = new GraphStorage('./data/graphs.sqlite');
  }
  return storage;
}

/**
 * Get graph by ID (for agent service)
 */
function getGraph(id: string): DependencyGraph | null {
  return getStorage().loadGraph(id);
}

/**
 * Get agent service
 */
function getAgentService(): AgentService {
  if (!agentService) {
    agentService = new AgentService(getGraph);
  }
  return agentService;
}

/**
 * Create API router
 */
export function createRouter(): Router {
  const router = Router();

  /**
   * POST /api/scan - Scan a repository or directory and build graph
   */
  router.post('/scan', async (req: Request, res: Response) => {
    try {
      const body = scanRequestSchema.parse(req.body);
      
      let files: { path: string; content: string }[];
      let graphName: string;
      let sourcePath: string;

      if (body.type === 'github') {
        const reader = new GitHubReader(body.path, body.branch);
        files = await reader.readFiles();
        const info = reader.getRepoInfo();
        graphName = body.name || `${info.owner}/${info.repo}`;
        sourcePath = body.path;
      } else {
        const reader = new LocalReader(body.path);
        files = await reader.readFiles();
        graphName = body.name || body.path.split('/').pop() || 'local';
        sourcePath = reader.getBasePath();
      }

      // Parse all files
      const allDependencies: ParsedDependency[] = [];

      for (const file of files) {
        const deps = await parseFile(file.path, file.content);
        allDependencies.push(...deps);
      }

      // Build and save graph
      const graph = buildGraph(allDependencies, {
        name: graphName,
        sourceType: body.type,
        sourcePath,
      });

      getStorage().saveGraph(graph);

      res.json({
        success: true,
        graphId: graph.id,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        filesProcessed: files.length,
      });
    } catch (error) {
      console.error('Scan error:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: error.errors });
      } else {
        res.status(500).json({ 
          error: 'Scan failed', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
  });

  /**
   * GET /api/graphs - List all cached graphs
   */
  router.get('/graphs', (_req: Request, res: Response) => {
    try {
      const graphs = getStorage().listGraphs();
      res.json({ graphs });
    } catch (error) {
      console.error('List graphs error:', error);
      res.status(500).json({ error: 'Failed to list graphs' });
    }
  });

  /**
   * GET /api/graphs/:id - Get a specific graph
   */
  router.get('/graphs/:id', (req: Request, res: Response) => {
    try {
      const graph = getStorage().loadGraph(req.params.id);
      
      if (!graph) {
        res.status(404).json({ error: 'Graph not found' });
        return;
      }

      res.json({ graph });
    } catch (error) {
      console.error('Get graph error:', error);
      res.status(500).json({ error: 'Failed to get graph' });
    }
  });

  /**
   * DELETE /api/graphs/:id - Delete a graph
   */
  router.delete('/graphs/:id', (req: Request, res: Response) => {
    try {
      const deleted = getStorage().deleteGraph(req.params.id);
      
      if (!deleted) {
        res.status(404).json({ error: 'Graph not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Delete graph error:', error);
      res.status(500).json({ error: 'Failed to delete graph' });
    }
  });

  /**
   * POST /api/ask - Ask a question about a graph
   */
  router.post('/ask', async (req: Request, res: Response) => {
    try {
      const body = askRequestSchema.parse(req.body);
      
      // Get or create session
      const userId = req.headers['x-user-id'] as string || uuidv4();
      let session;
      
      if (body.sessionId) {
        session = sessionManager.getSession(body.sessionId);
      }
      
      if (!session) {
        session = sessionManager.createSession(userId, body.graphId);
      }

      // Process the question
      const agent = getAgentService();
      const response = await agent.processQuestion(
        body.question,
        body.graphId,
        body.selectedNodes
      );

      // Save to session history
      sessionManager.addMessage(session.id, 'user', body.question);
      sessionManager.addMessage(session.id, 'assistant', response.answer);

      res.json({
        ...response,
        sessionId: session.id,
      });
    } catch (error) {
      console.error('Ask error:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: error.errors });
      } else {
        res.status(500).json({ 
          error: 'Failed to process question', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
  });

  /**
   * GET /api/graphs/:id/analyze - Get graph analysis/statistics
   */
  router.get('/graphs/:id/analyze', (req: Request, res: Response) => {
    try {
      const graph = getStorage().loadGraph(req.params.id);
      
      if (!graph) {
        res.status(404).json({ error: 'Graph not found' });
        return;
      }

      const analyzer = new GraphAnalyzer(graph);
      const stats = analyzer.getStatistics();
      const cycles = analyzer.detectCycles();

      res.json({ 
        statistics: stats,
        cycles: cycles.cycles.length > 0 ? cycles : null,
      });
    } catch (error) {
      console.error('Analyze graph error:', error);
      res.status(500).json({ error: 'Failed to analyze graph' });
    }
  });

  /**
   * POST /api/graphs/:id/blast-radius - Calculate blast radius for a node
   */
  router.post('/graphs/:id/blast-radius', (req: Request, res: Response) => {
    try {
      const { nodeId } = z.object({ nodeId: z.string() }).parse(req.body);
      const graph = getStorage().loadGraph(req.params.id);
      
      if (!graph) {
        res.status(404).json({ error: 'Graph not found' });
        return;
      }

      const analyzer = new GraphAnalyzer(graph);
      const result = analyzer.getBlastRadius(nodeId);

      res.json({ result });
    } catch (error) {
      console.error('Blast radius error:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to calculate blast radius' });
      }
    }
  });

  /**
   * Health check
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ 
      status: 'ok',
      activeSessions: sessionManager.getActiveSessionCount(),
    });
  });

  return router;
}

/**
 * Parse a file based on its type
 */
async function parseFile(filePath: string, content: string): Promise<ParsedDependency[]> {
  const filename = filePath.split('/').pop() || '';

  if (filename.endsWith('.tf')) {
    return parseTerraform(content);
  }

  if (/docker-compose\.ya?ml$/i.test(filename)) {
    return parseDockerCompose(content);
  }

  if (/\.ya?ml$/i.test(filename) && !filename.includes('docker-compose')) {
    // Assume it's a Kubernetes manifest
    return parseKubernetes(content);
  }

  if (filename === 'CODEOWNERS') {
    return parseCodeowners(content);
  }

  if (filename === 'package.json') {
    return parsePackageJson(content);
  }

  return [];
}
