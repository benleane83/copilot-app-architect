/**
 * Agent service - uses GitHub Copilot SDK for AI-powered analysis with tools
 */
import { CopilotClient, defineTool } from '@github/copilot-sdk';
import type { CopilotSession } from '@github/copilot-sdk';
import {
  analyzeBlastRadiusHandler,
  formatBlastRadiusResult,
  type AnalyzeBlastRadiusInput,
} from './tools/analyze-blast-radius.js';
import {
  explainCouplingHandler,
  formatCouplingResult,
  type ExplainCouplingInput,
} from './tools/explain-coupling.js';
import {
  getGraphDataHandler,
  formatGraphDataResult,
  type GetGraphDataInput,
} from './tools/get-graph-data.js';
import { systemMessage, getGraphContextMessage } from './prompts/system-message.js';
import type { DependencyGraph } from '../types.js';

export interface AgentResponse {
  answer: string;
  toolsUsed: string[];
  relatedNodes?: string[];
}

const DEFAULT_MODEL = process.env.COPILOT_MODEL || 'gpt-4.1';
const COPILOT_TOKEN_ENV = 'COPILOT_GITHUB_TOKEN';
const COPILOT_LOG_ENV = 'COPILOT_LOG_EVENTS';
const LOG_ATTACHED = Symbol('copilotLogAttached');

let copilotClient: CopilotClient | null = null;
let clientStartPromise: Promise<void> | null = null;

function getCopilotClient(): CopilotClient {
  if (!copilotClient) {
    copilotClient = new CopilotClient();
  }
  return copilotClient;
}

async function ensureCopilotStarted(): Promise<CopilotClient> {
  const client = getCopilotClient();
  if (!clientStartPromise) {
    clientStartPromise = client.start();
  }
  await clientStartPromise;
  return client;
}

function ensureAuthToken(): string | undefined {
  const token = process.env[COPILOT_TOKEN_ENV] || process.env.GITHUB_TOKEN;
  if (token && !process.env.GITHUB_TOKEN) {
    process.env.GITHUB_TOKEN = token;
  }
  return token;
}

export class AgentService {
  private graphGetter: (id: string) => Promise<DependencyGraph | null>;

  constructor(graphGetter: (id: string) => Promise<DependencyGraph | null>) {
    this.graphGetter = graphGetter;
  }

  /**
   * Process a user question about the graph
   */
  async processQuestion(
    question: string,
    graphId: string,
    selectedNodes?: string[],
    sessionId?: string
  ): Promise<AgentResponse> {
    const graph = await this.graphGetter(graphId);
    if (!graph) {
      return {
        answer: `Error: Graph not found with ID: ${graphId}`,
        toolsUsed: [],
      };
    }

    const authToken = ensureAuthToken();
    // if (!authToken) {
    //   return {
    //     answer: `Copilot authentication is not configured. Set ${COPILOT_TOKEN_ENV} with a GitHub OAuth token before asking questions.`,
    //     toolsUsed: [],
    //   };
    // }

    const toolsUsed: string[] = [];
    const relatedNodes: string[] = [];

    const client = await ensureCopilotStarted();
    const tools = this.createTools(graphId, toolsUsed, relatedNodes);
    const session = await this.getOrCreateSession(client, sessionId, tools);
    this.attachLogging(session, question);

    const prompt = this.buildPrompt(question, graph, selectedNodes, graphId);
    const response = await session.sendAndWait({ prompt });

    const answer = response?.data?.content?.trim() || 'No response from Copilot.';

    return {
      answer,
      toolsUsed,
      relatedNodes: relatedNodes.length > 0 ? relatedNodes : undefined,
    };
  }

  private async getOrCreateSession(
    client: CopilotClient,
    sessionId: string | undefined,
    tools: any[]
  ) {
    if (sessionId) {
      try {
        return await client.resumeSession(sessionId);
      } catch {
        return await client.createSession({
          sessionId,
          model: DEFAULT_MODEL,
          tools: tools as any,
          systemMessage,
        });
      }
    }

    return await client.createSession({
      model: DEFAULT_MODEL,
      tools: tools as any,
      systemMessage,
    });
  }

  private attachLogging(session: CopilotSession, question: string) {
    const logEnabled = process.env[COPILOT_LOG_ENV] === 'true';

    if (!logEnabled) {
      return;
    }

    const sessionWithFlag = session as CopilotSession & { [LOG_ATTACHED]?: boolean };
    if (sessionWithFlag[LOG_ATTACHED]) {
      console.info(`[copilot] question: ${question}`);
      return;
    }

    sessionWithFlag[LOG_ATTACHED] = true;
    console.info(`[copilot] session ${session.sessionId} started`);
    console.info(`[copilot] question: ${question}`);

    session.on((event: any) => {
      switch (event.type) {
        case 'assistant.message_delta':
          process.stdout.write(event.data.deltaContent);
          break;
        case 'assistant.message':
          console.info(`\n[copilot] assistant: ${event.data.content}`);
          break;
        case 'tool.execution_start':
          console.info(`[copilot] tool start: ${event.data.toolName || event.data.name}`);
          break;
        case 'tool.execution_result':
          console.info(`[copilot] tool end: ${event.data.toolName || event.data.name}`);
          break;
        case 'session.idle':
          console.info('[copilot] session idle');
          break;
        default:
          break;
      }
    });
  }

  private buildPrompt(
    question: string,
    graph: DependencyGraph,
    selectedNodes: string[] | undefined,
    graphId: string
  ): string {
    const selected = selectedNodes && selectedNodes.length > 0
      ? selectedNodes.join(', ')
      : 'none';

    return [
      getGraphContextMessage(graph.name, graph.nodes.length, graph.edges.length),
      `Graph ID: ${graphId}`,
      `Selected nodes: ${selected}`,
      '',
      `User question: ${question}`,
    ].join('\n');
  }

  private createTools(
    graphId: string,
    toolsUsed: string[],
    relatedNodes: string[]
  ) {
    const analyzeBlastRadius = defineTool('analyze_blast_radius', {
      description: 'Analyze the blast radius of a service failure in the dependency graph.',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The ID of the node to analyze' },
          graphId: { type: 'string', description: 'Graph ID to analyze' },
        },
        required: ['nodeId'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { nodeId, graphId: overrideGraphId } = args as {
          nodeId: string;
          graphId?: string;
        };
        const input: AnalyzeBlastRadiusInput = { nodeId, graphId: overrideGraphId || graphId };
        const result = await analyzeBlastRadiusHandler(input, this.graphGetter);
        toolsUsed.push('analyze_blast_radius');

        if ('error' in result) {
          return { error: result.error };
        }

        relatedNodes.push(...result.affectedNodes.map(node => node.id));
        return formatBlastRadiusResult(result);
      },
    });

    const explainCoupling = defineTool('explain_coupling', {
      description: 'Explain why a set of services are coupled in the dependency graph.',
      parameters: {
        type: 'object',
        properties: {
          nodeIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of the nodes to compare',
          },
          graphId: { type: 'string', description: 'Graph ID to analyze' },
        },
        required: ['nodeIds'],
      },
      handler: async (args: Record<string, unknown>) => {
        const { nodeIds, graphId: overrideGraphId } = args as {
          nodeIds: string[];
          graphId?: string;
        };
        const input: ExplainCouplingInput = { nodeIds, graphId: overrideGraphId || graphId };
        const result = await explainCouplingHandler(input, this.graphGetter);
        toolsUsed.push('explain_coupling');

        if ('error' in result) {
          return { error: result.error };
        }

        relatedNodes.push(...result.sharedDependencies.map(node => node.id));
        return formatCouplingResult(result);
      },
    });

    const getGraphData = defineTool('get_graph_data', {
      description: 'Retrieve summary information about the dependency graph and nodes.',
      parameters: {
        type: 'object',
        properties: {
          graphId: { type: 'string', description: 'Graph ID to fetch' },
          includeNodes: { type: 'boolean' },
          includeEdges: { type: 'boolean' },
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const {
          graphId: overrideGraphId,
          includeNodes = true,
          includeEdges = false,
        } = args as {
          graphId?: string;
          includeNodes?: boolean;
          includeEdges?: boolean;
        };
        const input: GetGraphDataInput = {
          graphId: overrideGraphId || graphId,
          includeNodes,
          includeEdges,
        };
        const result = await getGraphDataHandler(input, this.graphGetter);
        toolsUsed.push('get_graph_data');

        if ('error' in result) {
          return { error: result.error };
        }

        return formatGraphDataResult(result);
      },
    });

    return [analyzeBlastRadius, explainCoupling, getGraphData];
  }

  /**
   * Get system message for context
   */
  getSystemMessage() {
    return systemMessage;
  }
}
