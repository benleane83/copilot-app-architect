/**
 * Agent service - handles AI-powered analysis using GitHub Copilot SDK
 */
import { CopilotClient, CopilotSession, defineTool } from '@github/copilot-sdk';
import { z } from 'zod';
import { 
  analyzeBlastRadiusHandler, 
  formatBlastRadiusResult,
  type AnalyzeBlastRadiusInput 
} from './tools/analyze-blast-radius.js';
import { 
  explainCouplingHandler, 
  formatCouplingResult,
  type ExplainCouplingInput 
} from './tools/explain-coupling.js';
import { 
  getGraphDataHandler, 
  formatGraphDataResult,
  type GetGraphDataInput 
} from './tools/get-graph-data.js';
import { systemMessage, getGraphContextMessage } from './prompts/system-message.js';
import type { DependencyGraph, BlastRadiusResult, CouplingResult } from '../types.js';

export interface AgentResponse {
  answer: string;
  toolsUsed: string[];
  relatedNodes?: string[];
  sessionId?: string;
}

export class AgentService {
  private graphGetter: (id: string) => Promise<DependencyGraph | null>;
  private copilotClient: CopilotClient | null = null;
  private sessions: Map<string, CopilotSession> = new Map();

  constructor(graphGetter: (id: string) => Promise<DependencyGraph | null>) {
    this.graphGetter = graphGetter;
  }

  /**
   * Initialize the Copilot SDK client
   */
  async initialize(): Promise<void> {
    if (!this.copilotClient) {
      this.copilotClient = new CopilotClient({ logLevel: 'error' });
      await this.copilotClient.start();
    }
  }

  /**
   * Shutdown the agent service
   */
  async shutdown(): Promise<void> {
    // Cleanup all sessions
    for (const [sessionId, session] of this.sessions) {
      try {
        await session.destroy();
      } catch (err) {
        console.error(`Failed to destroy session ${sessionId}:`, err);
      }
    }
    this.sessions.clear();

    // Stop SDK client
    if (this.copilotClient) {
      await this.copilotClient.stop();
      this.copilotClient = null;
    }
  }

  /**
   * Create tools that the Copilot agent can use
   */
  private createTools(graphId: string, graph: DependencyGraph, selectedNodes?: string[]) {
    // Tool: Analyze blast radius
    const analyzeBlastRadius = defineTool('analyze_blast_radius', {
      description: 'Analyze the impact/blast radius if a service fails. Shows what services would be affected.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The ID of the service/node to analyze' },
        },
        required: ['nodeId'],
      },
      handler: async (args: { nodeId: string }) => {
        const { nodeId } = args;
        const input: AnalyzeBlastRadiusInput = { nodeId, graphId };
        const result = await analyzeBlastRadiusHandler(input, this.graphGetter);
        if ('error' in result) {
          return { error: result.error };
        }
        return {
          targetNode: result.targetNode,
          affectedNodes: result.affectedNodes,
          impactLevel: result.impactLevel,
          formatted: formatBlastRadiusResult(result),
        };
      },
    });

    // Tool: Explain coupling
    const explainCoupling = defineTool('explain_coupling', {
      description: 'Explain why multiple services are coupled together. Shows shared dependencies and relationships.',
      parameters: {
        type: 'object',
        properties: {
          nodeIds: { 
            type: 'array',
            items: { type: 'string' },
            description: 'Array of node IDs to analyze coupling between',
          },
        },
        required: ['nodeIds'],
      },
      handler: async (args: { nodeIds: string[] }) => {
        const { nodeIds } = args;
        const input: ExplainCouplingInput = { nodeIds, graphId };
        const result = await explainCouplingHandler(input, this.graphGetter);
        if ('error' in result) {
          return { error: result.error };
        }
        return {
          nodes: result.nodes,
          sharedDependencies: result.sharedDependencies,
          formatted: formatCouplingResult(result),
        };
      },
    });

    // Tool: Get graph data
    const getGraphData = defineTool('get_graph_data', {
      description: 'Get information about the dependency graph, including nodes, edges, and statistics.',
      parameters: {
        type: 'object',
        properties: {
          includeNodes: { type: 'boolean', description: 'Include node details' },
          includeEdges: { type: 'boolean', description: 'Include edge details' },
        },
      },
      handler: async (args: { includeNodes?: boolean; includeEdges?: boolean }) => {
        const { includeNodes = true, includeEdges = false } = args;
        const input: GetGraphDataInput = { graphId, includeNodes, includeEdges };
        const result = await getGraphDataHandler(input, this.graphGetter);
        if ('error' in result) {
          return { error: result.error };
        }
        return {
          id: result.id,
          name: result.name,
          nodeCount: result.nodeCount,
          edgeCount: result.edgeCount,
          nodes: result.nodes,
          edges: result.edges,
          formatted: formatGraphDataResult(result),
        };
      },
    });

    return [analyzeBlastRadius, explainCoupling, getGraphData];
  }

  /**
   * Process a user question using Copilot SDK
   */
  async processQuestion(
    question: string,
    graphId: string,
    selectedNodes?: string[],
    sessionId?: string
  ): Promise<AgentResponse> {
    await this.initialize();

    const graph = await this.graphGetter(graphId);
    if (!graph) {
      return {
        answer: `Error: Graph not found with ID: ${graphId}`,
        toolsUsed: [],
      };
    }

    if (!this.copilotClient) {
      return {
        answer: 'Error: Copilot client not initialized',
        toolsUsed: [],
      };
    }

    // Get or create session
    let session: CopilotSession;
    if (sessionId && this.sessions.has(sessionId)) {
      session = this.sessions.get(sessionId)!;
    } else {
      // Create tools
      const tools = this.createTools(graphId, graph, selectedNodes);

      // Build context for system message
      const selectedNodesContext = selectedNodes && selectedNodes.length > 0
        ? `\n\nCurrently selected nodes: ${selectedNodes.join(', ')}`
        : '';

      const graphContext = `
You are analyzing the "${graph.name}" dependency graph which contains:
- ${graph.nodes.length} services/nodes
- ${graph.edges.length} dependencies/edges

Available nodes: ${graph.nodes.map(n => `${n.name} (${n.type})`).join(', ')}${selectedNodesContext}
`;

      // Create new session
      session = await this.copilotClient.createSession({
        sessionId: sessionId || `graph-${graphId}-${Date.now()}`,
        model: 'gpt-4.1',
        tools,
        systemMessage: {
          content: systemMessage.content + '\n\n' + graphContext,
        },
      });

      this.sessions.set(session.sessionId, session);
    }

    // Track tools used and related nodes
    const toolsUsed: Set<string> = new Set();
    const relatedNodes: Set<string> = new Set();

    // Listen for tool executions
    session.on((event) => {
      if (event.type === 'tool.execution_start') {
        toolsUsed.add(event.data.toolName);
      }
    });

    // Send question and wait for response
    const response = await session.sendAndWait({ prompt: question });

    if (!response) {
      return {
        answer: 'No response received from Copilot',
        toolsUsed: Array.from(toolsUsed),
        sessionId: session.sessionId,
      };
    }

    // Extract related nodes from tool results if available
    // This is a simplified approach - you might want to parse the response content
    // or track tool results more explicitly

    return {
      answer: response.data.content,
      toolsUsed: Array.from(toolsUsed),
      relatedNodes: Array.from(relatedNodes),
      sessionId: session.sessionId,
    };
  }

  /**
   * Clean up a specific session
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.destroy();
      this.sessions.delete(sessionId);
    }
  }

}
