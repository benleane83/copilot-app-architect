/**
 * Graph builder - constructs dependency graphs from parsed dependencies
 */
import { v4 as uuidv4 } from 'uuid';
import type { 
  ParsedDependency, 
  DependencyGraph, 
  GraphNode, 
  GraphEdge,
  NodeType 
} from '../types.js';

interface BuildGraphOptions {
  name: string;
  sourceType: 'github' | 'local';
  sourcePath: string;
}

/**
 * Build a dependency graph from parsed dependencies
 */
export function buildGraph(
  dependencies: ParsedDependency[],
  options: BuildGraphOptions
): DependencyGraph {
  const nodesMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // First pass: collect all unique nodes
  for (const dep of dependencies) {
    if (!nodesMap.has(dep.source)) {
      nodesMap.set(dep.source, createNode(dep.source, dep.type));
    }
    if (!nodesMap.has(dep.target)) {
      nodesMap.set(dep.target, createNode(dep.target, dep.type));
    }
  }

  // Second pass: create edges
  const edgeSet = new Set<string>();
  for (const dep of dependencies) {
    const edgeKey = `${dep.source}|${dep.target}|${dep.type}`;
    
    // Skip duplicate edges
    if (edgeSet.has(edgeKey)) {
      continue;
    }
    edgeSet.add(edgeKey);

    edges.push({
      id: uuidv4(),
      source: dep.source,
      target: dep.target,
      type: dep.type,
      metadata: dep.metadata,
    });
  }

  return {
    id: uuidv4(),
    name: options.name,
    nodes: Array.from(nodesMap.values()),
    edges,
    metadata: {
      createdAt: new Date().toISOString(),
      sourceType: options.sourceType,
      sourcePath: options.sourcePath,
    },
  };
}

/**
 * Create a node from an ID and dependency type
 */
function createNode(id: string, depType: string): GraphNode {
  return {
    id,
    name: extractNodeName(id),
    type: inferNodeType(id, depType),
    metadata: {
      originalId: id,
    },
  };
}

/**
 * Extract a human-readable name from a node ID
 */
function extractNodeName(id: string): string {
  // Handle Kubernetes format: Kind/name
  if (id.includes('/')) {
    return id.split('/').pop() || id;
  }
  
  // Handle Terraform format: type.name
  if (id.includes('.')) {
    return id.split('.').pop() || id;
  }
  
  // Handle team/owner format: @org/team
  if (id.startsWith('@')) {
    return id;
  }
  
  return id;
}

/**
 * Infer node type from ID and dependency type
 */
function inferNodeType(id: string, depType: string): NodeType {
  // Kubernetes types
  if (id.startsWith('Deployment/') || id.startsWith('StatefulSet/') || id.startsWith('DaemonSet/')) {
    return 'k8s_deployment';
  }
  if (id.startsWith('Service/')) {
    return 'k8s_service';
  }
  if (id.startsWith('ConfigMap/') || id.startsWith('Secret/')) {
    return 'k8s_deployment';
  }

  // Terraform types
  if (depType === 'terraform_resource') {
    if (id.includes('db') || id.includes('rds') || id.includes('database')) {
      return 'database';
    }
    if (id.includes('queue') || id.includes('sqs') || id.includes('sns')) {
      return 'queue';
    }
    return 'terraform_resource';
  }

  // Docker types
  if (depType === 'docker_depends_on' || depType === 'docker_network') {
    return 'docker_service';
  }

  // NPM types
  if (depType === 'npm_dependency' || depType === 'npm_devDependency') {
    return 'npm_package';
  }

  // Codeowner types
  if (depType === 'codeowner') {
    if (id.startsWith('@')) {
      return 'team';
    }
    return 'service';
  }

  return 'unknown';
}

/**
 * Merge multiple graphs into one
 */
export function mergeGraphs(graphs: DependencyGraph[], name: string): DependencyGraph {
  const nodesMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const graph of graphs) {
    for (const node of graph.nodes) {
      if (!nodesMap.has(node.id)) {
        nodesMap.set(node.id, node);
      }
    }

    for (const edge of graph.edges) {
      const edgeKey = `${edge.source}|${edge.target}|${edge.type}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push(edge);
      }
    }
  }

  return {
    id: uuidv4(),
    name,
    nodes: Array.from(nodesMap.values()),
    edges,
    metadata: {
      createdAt: new Date().toISOString(),
      sourceType: 'local',
      sourcePath: 'merged',
    },
  };
}
