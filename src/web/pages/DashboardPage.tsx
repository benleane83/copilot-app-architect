/**
 * Dashboard Page - main application layout
 */
import React, { useState, useEffect, useCallback } from 'react';
import { GraphCanvas } from '../components/GraphCanvas';
import { QueryPanel } from '../components/QueryPanel';
import { ScanModal } from '../components/ScanModal';

interface GraphSummary {
  id: string;
  name: string;
  sourceType: string;
  sourcePath: string;
  createdAt: string;
  nodeCount: number;
  edgeCount: number;
}

interface GraphData {
  id: string;
  name: string;
  nodes: Array<{ id: string; name: string; type: string }>;
  edges: Array<{ id: string; source: string; target: string; type: string }>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const API_BASE = '/api';

export function DashboardPage() {
  // State
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);
  const [response, setResponse] = useState<string | null>(null);
<<<<<<< HEAD
=======
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
>>>>>>> b07eb46654c1c3e18e200e524692af297f452941
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load graphs list
  const loadGraphs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/graphs`);
      if (!res.ok) throw new Error('Failed to load graphs');
      const data = await res.json();
      setGraphs(data.graphs);
    } catch (err) {
      console.error('Failed to load graphs:', err);
      setError('Failed to load graphs');
    }
  }, []);

  // Load specific graph
  const loadGraph = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/graphs/${id}`);
      if (!res.ok) throw new Error('Failed to load graph');
      const data = await res.json();
      setGraphData(data.graph);
      setSelectedNodes([]);
      setHighlightedNodes([]);
      setResponse(null);
<<<<<<< HEAD
=======
      setChatHistory([]); // Clear chat history when switching graphs
>>>>>>> b07eb46654c1c3e18e200e524692af297f452941
      setSessionId(null);
    } catch (err) {
      console.error('Failed to load graph:', err);
      setError('Failed to load graph');
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadGraphs();
  }, [loadGraphs]);

  // Load graph when selection changes
  useEffect(() => {
    if (selectedGraphId) {
      loadGraph(selectedGraphId);
    } else {
      setGraphData(null);
    }
  }, [selectedGraphId, loadGraph]);

  // Handle scan
  const handleScan = useCallback(async (
    type: 'github' | 'local',
    path: string,
    branch?: string,
    name?: string
  ) => {
    setIsScanning(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, path, branch, name }),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Scan failed');
      }
      
      const data = await res.json();
      await loadGraphs();
      setSelectedGraphId(data.graphId);
      setShowScanModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  }, [loadGraphs]);

  // Handle ask
  const handleAsk = useCallback(async (question: string) => {
    if (!selectedGraphId) return;
    
    setIsLoading(true);
    setError(null);
    
    // Add user message to chat history
    const userMessage: Message = { role: 'user', content: question };
    setChatHistory(prev => [...prev, userMessage]);
    
    try {
      const body = {
        graphId: selectedGraphId,
        question,
        selectedNodes,
        ...(sessionId && { sessionId }),
      };
      
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
<<<<<<< HEAD
        body: JSON.stringify({
          graphId: selectedGraphId,
          question,
          selectedNodes,
          sessionId: sessionId ?? undefined,
        }),
=======
        body: JSON.stringify(body),
>>>>>>> b07eb46654c1c3e18e200e524692af297f452941
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to get answer');
      }
      
      const data = await res.json();
      setResponse(data.answer);
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }
      
      // Add assistant message to chat history
      const assistantMessage: Message = { role: 'assistant', content: data.answer };
      setChatHistory(prev => [...prev, assistantMessage]);
      
      // Store session ID for follow-up questions
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }
      
      if (data.relatedNodes && data.relatedNodes.length > 0) {
        setHighlightedNodes(data.relatedNodes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get answer');
      // Remove the user message if the request failed
      setChatHistory(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [selectedGraphId, selectedNodes, sessionId]);

  // Handle delete graph
  const handleDeleteGraph = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this graph?')) return;
    
    try {
      const res = await fetch(`${API_BASE}/graphs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete graph');
      
      if (selectedGraphId === id) {
        setSelectedGraphId(null);
        setGraphData(null);
      }
      await loadGraphs();
    } catch (err) {
      setError('Failed to delete graph');
    }
  }, [selectedGraphId, loadGraphs]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1>
          <span>🏗️</span> Copilot App Architect
        </h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowScanModal(true)}>
            + Scan Repository
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div style={{ 
          padding: '12px 24px', 
          background: '#ffebee', 
          color: '#c62828',
          borderBottom: '1px solid #ef9a9a'
        }}>
          {error}
          <button 
            onClick={() => setError(null)} 
            style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="main-content">
        {/* Sidebar - Graph list */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>Graphs</h2>
          </div>
          <div className="graph-list">
            {graphs.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--text-secondary)', textAlign: 'center' }}>
                No graphs yet.<br />Scan a repository to get started.
              </div>
            ) : (
              graphs.map(graph => (
                <div
                  key={graph.id}
                  className={`graph-item ${selectedGraphId === graph.id ? 'selected' : ''}`}
                  onClick={() => setSelectedGraphId(graph.id)}
                >
                  <div className="graph-item-name">{graph.name}</div>
                  <div className="graph-item-meta">
                    {graph.nodeCount} nodes · {graph.edgeCount} edges
                  </div>
                  <div className="graph-item-meta">
                    {new Date(graph.createdAt).toLocaleDateString()}
                  </div>
                  {selectedGraphId === graph.id && (
                    <button
                      className="btn btn-secondary btn-small"
                      style={{ marginTop: 8 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGraph(graph.id);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Graph area */}
        <main className="graph-area">
          {/* Statistics bar */}
          {graphData && (
            <div className="stats-bar">
              <div className="stat-item">
                <span>Nodes:</span>
                <span className="stat-value">{graphData.nodes.length}</span>
              </div>
              <div className="stat-item">
                <span>Edges:</span>
                <span className="stat-value">{graphData.edges.length}</span>
              </div>
              {selectedNodes.length > 0 && (
                <div className="stat-item">
                  <span>Selected:</span>
                  <span className="stat-value">{selectedNodes.length}</span>
                </div>
              )}
            </div>
          )}

          {/* Graph canvas */}
          <GraphCanvas
            graph={graphData}
            selectedNodes={selectedNodes}
            highlightedNodes={highlightedNodes}
            onNodeSelect={setSelectedNodes}
          />

          {/* Query panel */}
          <QueryPanel
            selectedNodes={selectedNodes}
            onAsk={handleAsk}
            response={response}
            isLoading={isLoading}
            graphId={selectedGraphId}
            chatHistory={chatHistory}
          />
        </main>
      </div>

      {/* Scan modal */}
      <ScanModal
        isOpen={showScanModal}
        onClose={() => setShowScanModal(false)}
        onScan={handleScan}
        isScanning={isScanning}
      />
    </div>
  );
}
