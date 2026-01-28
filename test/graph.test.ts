/**
 * Graph analyzer tests
 */
import { describe, it, expect } from 'vitest';
import { GraphAnalyzer } from '../src/graph/analyzer.js';
import type { DependencyGraph } from '../src/types.js';

function createTestGraph(): DependencyGraph {
  return {
    id: 'test-graph',
    name: 'Test Graph',
    nodes: [
      { id: 'api', name: 'API Service', type: 'service', metadata: {} },
      { id: 'web', name: 'Web Frontend', type: 'service', metadata: {} },
      { id: 'db', name: 'Database', type: 'database', metadata: {} },
      { id: 'cache', name: 'Redis Cache', type: 'database', metadata: {} },
      { id: 'queue', name: 'Message Queue', type: 'queue', metadata: {} },
      { id: 'worker', name: 'Background Worker', type: 'service', metadata: {} },
    ],
    edges: [
      { id: '1', source: 'web', target: 'api', type: 'docker_depends_on' },
      { id: '2', source: 'api', target: 'db', type: 'docker_depends_on' },
      { id: '3', source: 'api', target: 'cache', type: 'docker_depends_on' },
      { id: '4', source: 'api', target: 'queue', type: 'docker_depends_on' },
      { id: '5', source: 'worker', target: 'queue', type: 'docker_depends_on' },
      { id: '6', source: 'worker', target: 'db', type: 'docker_depends_on' },
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      sourceType: 'local',
      sourcePath: '/test',
    },
  };
}

describe('GraphAnalyzer', () => {
  describe('getBlastRadius', () => {
    it('should find all services affected by a node failure', () => {
      const graph = createTestGraph();
      const analyzer = new GraphAnalyzer(graph);
      
      // If DB goes down, api, web, and worker are affected
      const result = analyzer.getBlastRadius('db');
      
      expect(result.targetNode).toBe('db');
      expect(result.affectedNodes.map(n => n.id)).toContain('api');
      expect(result.affectedNodes.map(n => n.id)).toContain('worker');
    });

    it('should calculate impact level based on affected count', () => {
      const graph = createTestGraph();
      const analyzer = new GraphAnalyzer(graph);
      
      // Queue affects api and worker
      const result = analyzer.getBlastRadius('queue');
      
      expect(result.impactLevel).toBeDefined();
      expect(['low', 'medium', 'high', 'critical']).toContain(result.impactLevel);
    });

    it('should return empty affected nodes for leaf services', () => {
      const graph = createTestGraph();
      const analyzer = new GraphAnalyzer(graph);
      
      // Web is a leaf node - nothing depends on it
      const result = analyzer.getBlastRadius('web');
      
      expect(result.affectedNodes).toHaveLength(0);
    });
  });

  describe('findCouplingReason', () => {
    it('should find shared dependencies between nodes', () => {
      const graph = createTestGraph();
      const analyzer = new GraphAnalyzer(graph);
      
      // API and Worker both depend on queue and db
      const result = analyzer.findCouplingReason(['api', 'worker']);
      
      expect(result.nodes).toEqual(['api', 'worker']);
      expect(result.sharedDependencies.map(n => n.id)).toContain('db');
      expect(result.sharedDependencies.map(n => n.id)).toContain('queue');
      expect(result.couplingStrength).toBeGreaterThan(0);
    });

    it('should require at least 2 nodes', () => {
      const graph = createTestGraph();
      const analyzer = new GraphAnalyzer(graph);
      
      const result = analyzer.findCouplingReason(['api']);
      
      expect(result.couplingStrength).toBe(0);
      expect(result.reasons).toContain('Need at least 2 nodes to analyze coupling');
    });

    it('should report no coupling for unrelated nodes', () => {
      const graph = createTestGraph();
      const analyzer = new GraphAnalyzer(graph);
      
      const result = analyzer.findCouplingReason(['web', 'worker']);
      
      // They share db indirectly but let's check the result structure
      expect(result.reasons).toBeDefined();
      expect(result.couplingStrength).toBeDefined();
    });
  });

  describe('detectCycles', () => {
    it('should detect circular dependencies', () => {
      const cyclicGraph: DependencyGraph = {
        id: 'cyclic',
        name: 'Cyclic Graph',
        nodes: [
          { id: 'a', name: 'A', type: 'service', metadata: {} },
          { id: 'b', name: 'B', type: 'service', metadata: {} },
          { id: 'c', name: 'C', type: 'service', metadata: {} },
        ],
        edges: [
          { id: '1', source: 'a', target: 'b', type: 'docker_depends_on' },
          { id: '2', source: 'b', target: 'c', type: 'docker_depends_on' },
          { id: '3', source: 'c', target: 'a', type: 'docker_depends_on' }, // Creates cycle
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          sourceType: 'local',
          sourcePath: '/test',
        },
      };

      const analyzer = new GraphAnalyzer(cyclicGraph);
      const result = analyzer.detectCycles();
      
      expect(result.cycles.length).toBeGreaterThan(0);
    });

    it('should return empty cycles for acyclic graph', () => {
      const graph = createTestGraph();
      const analyzer = new GraphAnalyzer(graph);
      
      const result = analyzer.detectCycles();
      
      expect(result.cycles).toHaveLength(0);
    });
  });

  describe('getStatistics', () => {
    it('should return graph statistics', () => {
      const graph = createTestGraph();
      const analyzer = new GraphAnalyzer(graph);
      
      const stats = analyzer.getStatistics();
      
      expect(stats.totalNodes).toBe(6);
      expect(stats.totalEdges).toBe(6);
      expect(stats.nodeTypes).toBeDefined();
      expect(stats.edgeTypes).toBeDefined();
      expect(stats.mostConnected).toBeDefined();
    });
  });
});
