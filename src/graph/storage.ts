/**
 * Graph storage - SQLite-based persistence for dependency graphs
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { DependencyGraph } from '../types.js';

export class GraphStorage {
  private db: Database.Database;

  constructor(dbPath: string = './data/graphs.sqlite') {
    // Ensure the parent directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    this.initialize();
  }

  /**
   * Initialize database schema
   */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graphs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        graph_json TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_graphs_name ON graphs(name);
      CREATE INDEX IF NOT EXISTS idx_graphs_created_at ON graphs(created_at);
    `);
  }

  /**
   * Save a graph to the database
   */
  saveGraph(graph: DependencyGraph): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO graphs (id, name, graph_json, source_type, source_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      graph.id,
      graph.name,
      JSON.stringify(graph),
      graph.metadata.sourceType,
      graph.metadata.sourcePath,
      graph.metadata.createdAt,
      new Date().toISOString()
    );
  }

  /**
   * Load a graph by ID
   */
  loadGraph(id: string): DependencyGraph | null {
    const stmt = this.db.prepare('SELECT graph_json FROM graphs WHERE id = ?');
    const row = stmt.get(id) as { graph_json: string } | undefined;
    
    if (!row) {
      return null;
    }

    return JSON.parse(row.graph_json) as DependencyGraph;
  }

  /**
   * List all graphs with metadata
   */
  listGraphs(): Array<{
    id: string;
    name: string;
    sourceType: string;
    sourcePath: string;
    createdAt: string;
    nodeCount: number;
    edgeCount: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT id, name, source_type, source_path, created_at, graph_json
      FROM graphs
      ORDER BY created_at DESC
    `);

    const rows = stmt.all() as Array<{
      id: string;
      name: string;
      source_type: string;
      source_path: string;
      created_at: string;
      graph_json: string;
    }>;

    return rows.map(row => {
      const graph = JSON.parse(row.graph_json) as DependencyGraph;
      return {
        id: row.id,
        name: row.name,
        sourceType: row.source_type,
        sourcePath: row.source_path,
        createdAt: row.created_at,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      };
    });
  }

  /**
   * Delete a graph by ID
   */
  deleteGraph(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM graphs WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Search graphs by name
   */
  searchGraphs(query: string): DependencyGraph[] {
    const stmt = this.db.prepare(`
      SELECT graph_json FROM graphs
      WHERE name LIKE ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(`%${query}%`) as Array<{ graph_json: string }>;
    return rows.map(row => JSON.parse(row.graph_json) as DependencyGraph);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
