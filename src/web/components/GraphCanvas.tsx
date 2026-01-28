/**
 * Graph Canvas component - Cytoscape.js visualization
 */
import React, { useRef, useEffect, useCallback } from 'react';
import cytoscape, { Core, NodeSingular } from 'cytoscape';

interface GraphNode {
  id: string;
  name: string;
  type: string;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphCanvasProps {
  graph: GraphData | null;
  selectedNodes: string[];
  highlightedNodes?: string[];
  onNodeSelect: (nodeIds: string[]) => void;
  onNodeClick?: (node: GraphNode) => void;
}

// Node colors by type
const nodeColors: Record<string, string> = {
  service: '#0366d6',
  database: '#28a745',
  queue: '#ffc107',
  api: '#6f42c1',
  terraform_resource: '#7950f2',
  docker_service: '#0db7ed',
  k8s_deployment: '#326ce5',
  k8s_service: '#4a9eff',
  npm_package: '#cb3837',
  team: '#e91e63',
  unknown: '#6c757d',
};

// Edge colors by type
const edgeColors: Record<string, string> = {
  terraform_resource: '#7950f2',
  docker_depends_on: '#0db7ed',
  docker_network: '#17a2b8',
  k8s_service: '#326ce5',
  k8s_deployment: '#4a9eff',
  k8s_configmap: '#ff9800',
  k8s_secret: '#f44336',
  npm_dependency: '#cb3837',
  npm_devDependency: '#999',
  codeowner: '#e91e63',
  unknown: '#999',
};

export function GraphCanvas({
  graph,
  selectedNodes,
  highlightedNodes = [],
  onNodeSelect,
  onNodeClick,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele: NodeSingular) => nodeColors[ele.data('type')] || nodeColors.unknown,
            label: 'data(name)',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'font-size': '11px',
            'text-margin-y': 8,
            color: '#333',
            'text-background-color': '#fff',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            width: 40,
            height: 40,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#ff6b6b',
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-width': 3,
            'border-color': '#ffc107',
            'border-style': 'dashed',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': (ele: NodeSingular) => edgeColors[ele.data('type')] || edgeColors.unknown,
            'target-arrow-color': (ele: NodeSingular) => edgeColors[ele.data('type')] || edgeColors.unknown,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            opacity: 0.7,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            width: 3,
            opacity: 1,
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        nodeDimensionsIncludeLabels: true,
        randomize: true,
        componentSpacing: 100,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 100,
      },
    });

    // Handle selection
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeId = node.id();
      
      if (evt.originalEvent.ctrlKey || evt.originalEvent.metaKey) {
        // Multi-select
        if (selectedNodes.includes(nodeId)) {
          onNodeSelect(selectedNodes.filter(id => id !== nodeId));
        } else {
          onNodeSelect([...selectedNodes, nodeId]);
        }
      } else {
        // Single select
        onNodeSelect([nodeId]);
        if (onNodeClick) {
          onNodeClick({
            id: node.data('id'),
            name: node.data('name'),
            type: node.data('type'),
          });
        }
      }
    });

    // Click on background to deselect
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        onNodeSelect([]);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [onNodeSelect, onNodeClick]);

  // Update graph data
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graph) return;

    cy.elements().remove();

    // Add nodes
    const nodeElements = graph.nodes.map(node => ({
      data: {
        id: node.id,
        name: node.name,
        type: node.type,
      },
    }));

    // Add edges
    const edgeElements = graph.edges.map(edge => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
      },
    }));

    cy.add([...nodeElements, ...edgeElements]);

    // Run layout
    cy.layout({
      name: 'cose',
      animate: false,
      nodeDimensionsIncludeLabels: true,
      randomize: true,
      componentSpacing: 100,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 100,
    }).run();

    cy.fit(undefined, 50);
  }, [graph]);

  // Update selection
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes().unselect();
    selectedNodes.forEach(id => {
      cy.$id(id).select();
    });
  }, [selectedNodes]);

  // Update highlighted nodes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes().removeClass('highlighted');
    cy.edges().removeClass('highlighted');

    highlightedNodes.forEach(id => {
      const node = cy.$id(id);
      node.addClass('highlighted');
      node.connectedEdges().addClass('highlighted');
    });
  }, [highlightedNodes]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (cy) {
      cy.zoom(cy.zoom() * 1.2);
      cy.center();
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (cy) {
      cy.zoom(cy.zoom() / 1.2);
      cy.center();
    }
  }, []);

  const handleFit = useCallback(() => {
    const cy = cyRef.current;
    if (cy) {
      cy.fit(undefined, 50);
    }
  }, []);

  if (!graph) {
    return (
      <div className="graph-empty">
        <h3>No Graph Selected</h3>
        <p>Select a graph from the sidebar or scan a new repository to get started.</p>
      </div>
    );
  }

  return (
    <div className="graph-canvas-container">
      <div ref={containerRef} className="graph-canvas" />
      
      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button className="btn btn-secondary btn-small" onClick={handleZoomIn}>+</button>
        <button className="btn btn-secondary btn-small" onClick={handleZoomOut}>−</button>
        <button className="btn btn-secondary btn-small" onClick={handleFit}>Fit</button>
      </div>

      {/* Legend */}
      <div className="graph-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ background: nodeColors.service }} />
          <span>Service</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: nodeColors.database }} />
          <span>Database</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: nodeColors.docker_service }} />
          <span>Docker</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: nodeColors.k8s_deployment }} />
          <span>Kubernetes</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: nodeColors.npm_package }} />
          <span>NPM Package</span>
        </div>
      </div>
    </div>
  );
}
