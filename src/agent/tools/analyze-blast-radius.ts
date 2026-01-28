/**
 * Analyze blast radius tool - determines failure impact
 */
import { z } from 'zod';
import { GraphAnalyzer } from '../../graph/analyzer.js';
import type { DependencyGraph, BlastRadiusResult } from '../../types.js';

export const analyzeBlastRadiusSchema = z.object({
  nodeId: z.string().describe('The ID of the node to analyze'),
  graphId: z.string().describe('The ID of the graph to analyze'),
});

export type AnalyzeBlastRadiusInput = z.infer<typeof analyzeBlastRadiusSchema>;

export const analyzeBlastRadiusTool = {
  name: 'analyze_blast_radius',
  description: 'Analyze the blast radius of a service failure. Determines what other services would be affected if the specified service goes down.',
  parameters: analyzeBlastRadiusSchema,
};

/**
 * Handler for the analyze blast radius tool
 */
export async function analyzeBlastRadiusHandler(
  input: AnalyzeBlastRadiusInput,
  getGraph: (id: string) => Promise<DependencyGraph | null>
): Promise<BlastRadiusResult | { error: string }> {
  const graph = await getGraph(input.graphId);
  
  if (!graph) {
    return { error: `Graph not found: ${input.graphId}` };
  }

  // Check if node exists
  const nodeExists = graph.nodes.some(n => n.id === input.nodeId);
  if (!nodeExists) {
    return { error: `Node not found in graph: ${input.nodeId}` };
  }

  const analyzer = new GraphAnalyzer(graph);
  return analyzer.getBlastRadius(input.nodeId);
}

/**
 * Format blast radius result for display
 */
export function formatBlastRadiusResult(result: BlastRadiusResult): string {
  const lines: string[] = [
    `## Blast Radius Analysis for: ${result.targetNode}`,
    '',
    `**Impact Level:** ${result.impactLevel.toUpperCase()}`,
    '',
  ];

  if (result.affectedNodes.length === 0) {
    lines.push('No other services would be directly affected.');
  } else {
    lines.push(`**Affected Services (${result.affectedNodes.length}):**`);
    for (const node of result.affectedNodes) {
      lines.push(`- ${node.name} (${node.type})`);
    }
  }

  lines.push('');
  lines.push(`**Affected Connections:** ${result.affectedEdges.length}`);

  return lines.join('\n');
}
