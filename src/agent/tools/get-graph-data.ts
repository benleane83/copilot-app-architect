/**
 * Get graph data tool - retrieves cached graph information
 */
import { z } from 'zod';
import type { DependencyGraph } from '../../types.js';

export const getGraphDataSchema = z.object({
  graphId: z.string().describe('The ID of the graph to retrieve'),
  includeNodes: z.boolean().optional().describe('Include node list in response'),
  includeEdges: z.boolean().optional().describe('Include edge list in response'),
  nodeFilter: z.string().optional().describe('Filter nodes by name (partial match)'),
});

export type GetGraphDataInput = z.infer<typeof getGraphDataSchema>;

export interface GraphDataResult {
  id: string;
  name: string;
  nodeCount: number;
  edgeCount: number;
  sourceType: string;
  sourcePath: string;
  createdAt: string;
  nodes?: Array<{ id: string; name: string; type: string }>;
  edges?: Array<{ source: string; target: string; type: string }>;
}

export const getGraphDataTool = {
  name: 'get_graph_data',
  description: 'Retrieve information about a cached dependency graph, including statistics, nodes, and edges.',
  parameters: getGraphDataSchema,
};

/**
 * Handler for the get graph data tool
 */
export function getGraphDataHandler(
  input: GetGraphDataInput,
  getGraph: (id: string) => DependencyGraph | null
): GraphDataResult | { error: string } {
  const graph = getGraph(input.graphId);
  
  if (!graph) {
    return { error: `Graph not found: ${input.graphId}` };
  }

  const result: GraphDataResult = {
    id: graph.id,
    name: graph.name,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    sourceType: graph.metadata.sourceType,
    sourcePath: graph.metadata.sourcePath,
    createdAt: graph.metadata.createdAt,
  };

  if (input.includeNodes) {
    let nodes = graph.nodes;
    
    if (input.nodeFilter) {
      const filter = input.nodeFilter.toLowerCase();
      nodes = nodes.filter(n => 
        n.name.toLowerCase().includes(filter) ||
        n.id.toLowerCase().includes(filter)
      );
    }

    result.nodes = nodes.map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
    }));
  }

  if (input.includeEdges) {
    result.edges = graph.edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
    }));
  }

  return result;
}

/**
 * Format graph data result for display
 */
export function formatGraphDataResult(result: GraphDataResult): string {
  const lines: string[] = [
    `## Graph: ${result.name}`,
    '',
    `- **ID:** ${result.id}`,
    `- **Nodes:** ${result.nodeCount}`,
    `- **Edges:** ${result.edgeCount}`,
    `- **Source:** ${result.sourceType} (${result.sourcePath})`,
    `- **Created:** ${result.createdAt}`,
  ];

  if (result.nodes && result.nodes.length > 0) {
    lines.push('');
    lines.push('**Nodes:**');
    for (const node of result.nodes.slice(0, 20)) {
      lines.push(`- ${node.name} (${node.type})`);
    }
    if (result.nodes.length > 20) {
      lines.push(`... and ${result.nodes.length - 20} more`);
    }
  }

  return lines.join('\n');
}
