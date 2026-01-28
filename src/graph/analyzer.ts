/**
 * Graph analyzer - provides analysis functions for dependency graphs
 */
import type { 
  DependencyGraph, 
  GraphNode, 
  GraphEdge,
  BlastRadiusResult,
  CouplingResult,
  CycleResult 
} from '../types.js';

export class GraphAnalyzer {
  private graph: DependencyGraph;
  private adjacencyList: Map<string, string[]>;
  private reverseAdjacencyList: Map<string, string[]>;

  constructor(graph: DependencyGraph) {
    this.graph = graph;
    this.adjacencyList = this.buildAdjacencyList();
    this.reverseAdjacencyList = this.buildReverseAdjacencyList();
  }

  /**
   * Build adjacency list from edges (source -> targets)
   */
  private buildAdjacencyList(): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    
    for (const node of this.graph.nodes) {
      adj.set(node.id, []);
    }
    
    for (const edge of this.graph.edges) {
      const targets = adj.get(edge.source) || [];
      targets.push(edge.target);
      adj.set(edge.source, targets);
    }
    
    return adj;
  }

  /**
   * Build reverse adjacency list (target -> sources that depend on it)
   */
  private buildReverseAdjacencyList(): Map<string, string[]> {
    const adj = new Map<string, string[]>();
    
    for (const node of this.graph.nodes) {
      adj.set(node.id, []);
    }
    
    for (const edge of this.graph.edges) {
      const sources = adj.get(edge.target) || [];
      sources.push(edge.source);
      adj.set(edge.target, sources);
    }
    
    return adj;
  }

  /**
   * Get blast radius - what breaks if a node goes down
   * Uses BFS to find all downstream dependencies
   */
  getBlastRadius(nodeId: string): BlastRadiusResult {
    const affected = new Set<string>();
    const queue: string[] = [nodeId];
    
    // BFS to find all nodes that depend on this node (upstream)
    while (queue.length > 0) {
      const current = queue.shift()!;
      const dependents = this.reverseAdjacencyList.get(current) || [];
      
      for (const dep of dependents) {
        if (!affected.has(dep) && dep !== nodeId) {
          affected.add(dep);
          queue.push(dep);
        }
      }
    }

    const affectedNodes = this.graph.nodes.filter(n => affected.has(n.id));
    const affectedEdges = this.graph.edges.filter(
      e => affected.has(e.source) || affected.has(e.target) || e.target === nodeId
    );

    // Calculate impact level based on number of affected nodes
    const totalNodes = this.graph.nodes.length;
    const ratio = affectedNodes.length / totalNodes;
    let impactLevel: BlastRadiusResult['impactLevel'];
    
    if (ratio > 0.5) {
      impactLevel = 'critical';
    } else if (ratio > 0.25) {
      impactLevel = 'high';
    } else if (ratio > 0.1) {
      impactLevel = 'medium';
    } else {
      impactLevel = 'low';
    }

    return {
      targetNode: nodeId,
      affectedNodes,
      affectedEdges,
      impactLevel,
    };
  }

  /**
   * Find coupling reasons between multiple nodes
   */
  findCouplingReason(nodeIds: string[]): CouplingResult {
    if (nodeIds.length < 2) {
      return {
        nodes: nodeIds,
        sharedDependencies: [],
        couplingStrength: 0,
        reasons: ['Need at least 2 nodes to analyze coupling'],
      };
    }

    // Find shared dependencies (nodes that all selected nodes depend on)
    const dependencySets = nodeIds.map(id => {
      const deps = new Set<string>();
      this.collectAllDependencies(id, deps);
      return deps;
    });

    const sharedDeps = this.intersectSets(dependencySets);
    const sharedDependencies = this.graph.nodes.filter(n => sharedDeps.has(n.id));

    // Find shared dependents (nodes that depend on all selected nodes)
    const dependentSets = nodeIds.map(id => {
      const deps = new Set<string>();
      this.collectAllDependents(id, deps);
      return deps;
    });

    const sharedDependents = this.intersectSets(dependentSets);

    // Calculate coupling strength
    const totalConnections = sharedDependencies.length + sharedDependents.size;
    const maxPossible = this.graph.nodes.length;
    const couplingStrength = maxPossible > 0 ? totalConnections / maxPossible : 0;

    // Generate reasons
    const reasons: string[] = [];
    
    if (sharedDependencies.length > 0) {
      reasons.push(
        `Shared dependencies: ${sharedDependencies.map(n => n.name).join(', ')}`
      );
    }
    
    if (sharedDependents.size > 0) {
      const depNames = Array.from(sharedDependents)
        .map(id => this.graph.nodes.find(n => n.id === id)?.name || id)
        .join(', ');
      reasons.push(`Common dependents: ${depNames}`);
    }

    // Check for direct edges between nodes
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const edge = this.graph.edges.find(
          e => (e.source === nodeIds[i] && e.target === nodeIds[j]) ||
               (e.source === nodeIds[j] && e.target === nodeIds[i])
        );
        if (edge) {
          reasons.push(`Direct dependency between ${nodeIds[i]} and ${nodeIds[j]}`);
        }
      }
    }

    if (reasons.length === 0) {
      reasons.push('No direct coupling found between the selected nodes');
    }

    return {
      nodes: nodeIds,
      sharedDependencies,
      couplingStrength,
      reasons,
    };
  }

  /**
   * Detect cycles in the graph
   */
  detectCycles(): CycleResult {
    const cycles: GraphNode[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): void => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      const neighbors = this.adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cycleIds = path.slice(cycleStart);
          const cycleNodes = cycleIds
            .map(id => this.graph.nodes.find(n => n.id === id))
            .filter((n): n is GraphNode => n !== undefined);
          
          if (cycleNodes.length > 0) {
            cycles.push(cycleNodes);
          }
        }
      }

      path.pop();
      recStack.delete(nodeId);
    };

    for (const node of this.graph.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    }

    return {
      cycles,
      severity: cycles.length > 0 ? 'error' : 'warning',
    };
  }

  /**
   * Get all dependencies of a node (recursive)
   */
  private collectAllDependencies(nodeId: string, result: Set<string>): void {
    const deps = this.adjacencyList.get(nodeId) || [];
    for (const dep of deps) {
      if (!result.has(dep)) {
        result.add(dep);
        this.collectAllDependencies(dep, result);
      }
    }
  }

  /**
   * Get all dependents of a node (recursive)
   */
  private collectAllDependents(nodeId: string, result: Set<string>): void {
    const deps = this.reverseAdjacencyList.get(nodeId) || [];
    for (const dep of deps) {
      if (!result.has(dep)) {
        result.add(dep);
        this.collectAllDependents(dep, result);
      }
    }
  }

  /**
   * Intersect multiple sets
   */
  private intersectSets(sets: Set<string>[]): Set<string> {
    if (sets.length === 0) return new Set();
    
    let result = new Set(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      result = new Set([...result].filter(x => sets[i].has(x)));
    }
    
    return result;
  }

  /**
   * Get statistics about the graph
   */
  getStatistics() {
    const nodeTypes = new Map<string, number>();
    for (const node of this.graph.nodes) {
      const count = nodeTypes.get(node.type) || 0;
      nodeTypes.set(node.type, count + 1);
    }

    const edgeTypes = new Map<string, number>();
    for (const edge of this.graph.edges) {
      const count = edgeTypes.get(edge.type) || 0;
      edgeTypes.set(edge.type, count + 1);
    }

    // Find nodes with most connections
    const nodeConnections = this.graph.nodes.map(node => ({
      node,
      inbound: (this.reverseAdjacencyList.get(node.id) || []).length,
      outbound: (this.adjacencyList.get(node.id) || []).length,
    }));

    const mostConnected = nodeConnections
      .sort((a, b) => (b.inbound + b.outbound) - (a.inbound + a.outbound))
      .slice(0, 5);

    return {
      totalNodes: this.graph.nodes.length,
      totalEdges: this.graph.edges.length,
      nodeTypes: Object.fromEntries(nodeTypes),
      edgeTypes: Object.fromEntries(edgeTypes),
      mostConnected,
    };
  }

  /**
   * Get the original graph
   */
  getGraph(): DependencyGraph {
    return this.graph;
  }
}
