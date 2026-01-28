/**
 * Explain coupling tool - finds shared dependencies between services
 */
import { z } from 'zod';
import { GraphAnalyzer } from '../../graph/analyzer.js';
import type { DependencyGraph, CouplingResult } from '../../types.js';

export const explainCouplingSchema = z.object({
  nodeIds: z.array(z.string()).min(2).describe('Array of node IDs to analyze coupling between'),
  graphId: z.string().describe('The ID of the graph to analyze'),
});

export type ExplainCouplingInput = z.infer<typeof explainCouplingSchema>;

export const explainCouplingTool = {
  name: 'explain_coupling',
  description: 'Explain why services are coupled. Analyzes shared dependencies, common dependents, and direct connections between the specified services.',
  parameters: explainCouplingSchema,
};

/**
 * Handler for the explain coupling tool
 */
export async function explainCouplingHandler(
  input: ExplainCouplingInput,
  getGraph: (id: string) => Promise<DependencyGraph | null>
): Promise<CouplingResult | { error: string }> {
  const graph = await getGraph(input.graphId);
  
  if (!graph) {
    return { error: `Graph not found: ${input.graphId}` };
  }

  // Check if all nodes exist
  const missingNodes = input.nodeIds.filter(
    id => !graph.nodes.some(n => n.id === id)
  );
  
  if (missingNodes.length > 0) {
    return { error: `Nodes not found in graph: ${missingNodes.join(', ')}` };
  }

  const analyzer = new GraphAnalyzer(graph);
  return analyzer.findCouplingReason(input.nodeIds);
}

/**
 * Format coupling result for display
 */
export function formatCouplingResult(result: CouplingResult): string {
  const lines: string[] = [
    `## Coupling Analysis`,
    '',
    `**Analyzed Services:** ${result.nodes.join(', ')}`,
    '',
    `**Coupling Strength:** ${(result.couplingStrength * 100).toFixed(1)}%`,
    '',
  ];

  if (result.sharedDependencies.length > 0) {
    lines.push('**Shared Dependencies:**');
    for (const dep of result.sharedDependencies) {
      lines.push(`- ${dep.name} (${dep.type})`);
    }
    lines.push('');
  }

  lines.push('**Coupling Reasons:**');
  for (const reason of result.reasons) {
    lines.push(`- ${reason}`);
  }

  return lines.join('\n');
}
