/**
 * Common types for the dependency graph system
 */

export interface ParsedDependency {
  source: string;
  target: string;
  type: DependencyType;
  metadata?: Record<string, unknown>;
}

export type DependencyType =
  | 'terraform_resource'
  | 'docker_depends_on'
  | 'docker_network'
  | 'k8s_service'
  | 'k8s_deployment'
  | 'k8s_configmap'
  | 'k8s_secret'
  | 'npm_dependency'
  | 'npm_devDependency'
  | 'codeowner'
  | 'unknown';

export interface GraphNode {
  id: string;
  name: string;
  type: NodeType;
  metadata: Record<string, unknown>;
}

export type NodeType =
  | 'service'
  | 'database'
  | 'queue'
  | 'api'
  | 'terraform_resource'
  | 'docker_service'
  | 'k8s_deployment'
  | 'k8s_service'
  | 'npm_package'
  | 'team'
  | 'unknown';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: DependencyType;
  metadata?: Record<string, unknown>;
}

export interface DependencyGraph {
  id: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    createdAt: string;
    sourceType: 'github' | 'local';
    sourcePath: string;
  };
}

export interface ScanRequest {
  type: 'github' | 'local';
  path: string; // repo url or local path
  branch?: string; // for github
}

export interface ScanResult {
  graphId: string;
  nodeCount: number;
  edgeCount: number;
}

export interface AskRequest {
  graphId: string;
  question: string;
  selectedNodes?: string[];
}

export interface AskResponse {
  answer: string;
  relatedNodes?: string[];
}

export interface BlastRadiusResult {
  targetNode: string;
  affectedNodes: GraphNode[];
  affectedEdges: GraphEdge[];
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface CouplingResult {
  nodes: string[];
  sharedDependencies: GraphNode[];
  couplingStrength: number;
  reasons: string[];
}

export interface CycleResult {
  cycles: GraphNode[][];
  severity: 'warning' | 'error';
}
