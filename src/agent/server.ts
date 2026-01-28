/**
 * Agent service - handles AI-powered analysis using custom tools
 * Note: This is a simplified implementation that processes tools locally
 * In production, you would integrate with @github/copilot-sdk or similar
 */
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
    selectedNodes?: string[]
  ): Promise<AgentResponse> {
    const graph = await this.graphGetter(graphId);
    if (!graph) {
      return {
        answer: `Error: Graph not found with ID: ${graphId}`,
        toolsUsed: [],
      };
    }

    const toolsUsed: string[] = [];
    let answer = '';
    const relatedNodes: string[] = [];

    // Analyze the question to determine which tool to use
    const questionLower = question.toLowerCase();

    if (this.isBlastRadiusQuestion(questionLower)) {
      // Use analyze_blast_radius tool
      const nodeId = selectedNodes?.[0] || this.extractNodeFromQuestion(question, graph);
      
      if (nodeId) {
        const input: AnalyzeBlastRadiusInput = { nodeId, graphId };
        const result = await analyzeBlastRadiusHandler(input, this.graphGetter);
        toolsUsed.push('analyze_blast_radius');

        if ('error' in result) {
          answer = `Error: ${result.error}`;
        } else {
          answer = formatBlastRadiusResult(result);
          relatedNodes.push(...result.affectedNodes.map(n => n.id));
          answer += this.addRecommendations(result);
        }
      } else {
        answer = 'Please select a service or specify which service you want to analyze.';
      }
    } else if (this.isCouplingQuestion(questionLower)) {
      // Use explain_coupling tool
      const nodeIds = selectedNodes && selectedNodes.length >= 2 
        ? selectedNodes 
        : this.extractNodesFromQuestion(question, graph);

      if (nodeIds.length >= 2) {
        const input: ExplainCouplingInput = { nodeIds, graphId };
        const result = await explainCouplingHandler(input, this.graphGetter);
        toolsUsed.push('explain_coupling');

        if ('error' in result) {
          answer = `Error: ${result.error}`;
        } else {
          answer = formatCouplingResult(result);
          relatedNodes.push(...result.sharedDependencies.map(n => n.id));
        }
      } else {
        answer = 'Please select at least two services to analyze their coupling.';
      }
    } else if (this.isGraphInfoQuestion(questionLower)) {
      // Use get_graph_data tool
      const input: GetGraphDataInput = { 
        graphId, 
        includeNodes: true,
        includeEdges: false 
      };
      const result = await getGraphDataHandler(input, this.graphGetter);
      toolsUsed.push('get_graph_data');

      if ('error' in result) {
        answer = `Error: ${result.error}`;
      } else {
        answer = formatGraphDataResult(result);
      }
    } else {
      // General question - provide overview
      answer = getGraphContextMessage(graph.name, graph.nodes.length, graph.edges.length);
      answer += '\n\n' + this.getAvailableActions();
    }

    return { answer, toolsUsed, relatedNodes };
  }

  /**
   * Check if the question is about blast radius / failure impact
   */
  private isBlastRadiusQuestion(question: string): boolean {
    const patterns = [
      'what breaks',
      'what fails',
      'what happens if',
      'blast radius',
      'impact',
      'affected',
      'down',
      'failure',
      'depends on',
      'downstream',
    ];
    return patterns.some(p => question.includes(p));
  }

  /**
   * Check if the question is about coupling
   */
  private isCouplingQuestion(question: string): boolean {
    const patterns = [
      'coupled',
      'coupling',
      'why are',
      'connected',
      'related',
      'shared',
      'common',
      'between',
    ];
    return patterns.some(p => question.includes(p));
  }

  /**
   * Check if the question is about graph info
   */
  private isGraphInfoQuestion(question: string): boolean {
    const patterns = [
      'overview',
      'summary',
      'statistics',
      'how many',
      'list',
      'show all',
      'what services',
    ];
    return patterns.some(p => question.includes(p));
  }

  /**
   * Extract a node ID from the question text
   */
  private extractNodeFromQuestion(question: string, graph: DependencyGraph): string | null {
    // Look for node names in the question
    for (const node of graph.nodes) {
      if (question.toLowerCase().includes(node.name.toLowerCase()) ||
          question.toLowerCase().includes(node.id.toLowerCase())) {
        return node.id;
      }
    }
    return null;
  }

  /**
   * Extract multiple node IDs from the question text
   */
  private extractNodesFromQuestion(question: string, graph: DependencyGraph): string[] {
    const found: string[] = [];
    for (const node of graph.nodes) {
      if (question.toLowerCase().includes(node.name.toLowerCase()) ||
          question.toLowerCase().includes(node.id.toLowerCase())) {
        found.push(node.id);
      }
    }
    return found;
  }

  /**
   * Add recommendations based on blast radius result
   */
  private addRecommendations(result: BlastRadiusResult): string {
    const lines: string[] = ['', '### Recommendations'];

    if (result.impactLevel === 'critical' || result.impactLevel === 'high') {
      lines.push('- ⚠️ This is a critical dependency - consider adding redundancy');
      lines.push('- Consider implementing circuit breakers for dependent services');
      lines.push('- Ensure monitoring and alerting are in place');
    }

    if (result.affectedNodes.length > 5) {
      lines.push('- Consider breaking down this service to reduce blast radius');
    }

    return lines.join('\n');
  }

  /**
   * Get available actions text
   */
  private getAvailableActions(): string {
    return `**Available Actions:**
- Ask "What breaks if [service] is down?" to analyze failure impact
- Select multiple services and ask "Why are these coupled?" to understand dependencies
- Ask "Show overview" to see graph statistics`;
  }

  /**
   * Get system message for context
   */
  getSystemMessage() {
    return systemMessage;
  }
}
