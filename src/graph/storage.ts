/**
 * Graph storage - SQLite-based persistence for dependency graphs
 */
import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import type { DependencyGraph } from '../types.js';

export class GraphStorage {
  private db: Database | null = null;
  private dbPath: string;
  private initialized: Promise<void>;

  constructor(dbPath: string = './data/graphs.sqlite') {
    this.dbPath = dbPath;
    this.initialized = this.initialize();
  }

  /**
   * Initialize database schema
   */
  private async initialize(): Promise<void> {
    // Ensure the parent directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const SQL = await initSqlJs();
    
    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      try {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(buffer);
        console.log('Loaded existing database from', this.dbPath);
      } catch (error) {
        console.warn('Failed to load existing database, creating new one:', error);
        // Backup corrupted file and create new database
        fs.renameSync(this.dbPath, `${this.dbPath}.corrupted.${Date.now()}`);
        this.db = new SQL.Database();
      }
    } else {
      console.log('Creating new database at', this.dbPath);
      this.db = new SQL.Database();
    }

    // Create schema
    this.db.run(`
      CREATE TABLE IF NOT EXISTS graphs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        graph_json TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_graphs_name ON graphs(name);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_graphs_created_at ON graphs(created_at);`);
    
    // Save to disk
    this.saveToFile();
  }

  /**
   * Save database to file
   */
  private saveToFile(): void {
    if (!this.db) return;
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, data);
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInitialized(): Promise<void> {
    await this.initialized;
    if (!this.db) {
      throw new Error('Database not initialized');
    }
  }

  /**
   * Save a graph to the database
   */
  async saveGraph(graph: DependencyGraph): Promise<void> {
    await this.ensureInitialized();
    
    this.db!.run(
      `INSERT OR REPLACE INTO graphs (id, name, graph_json, source_type, source_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        graph.id,
        graph.name,
        JSON.stringify(graph),
        graph.metadata.sourceType,
        graph.metadata.sourcePath,
        graph.metadata.createdAt,
        new Date().toISOString()
      ]
    );
    
    this.saveToFile();
  }

  /**
   * Load a graph by ID
   */
  async loadGraph(id: string): Promise<DependencyGraph | null> {
    await this.ensureInitialized();
    
    const result = this.db!.exec('SELECT graph_json FROM graphs WHERE id = ?', [id]);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    return JSON.parse(result[0].values[0][0] as string) as DependencyGraph;
  }

  /**
   * List all graphs with metadata
   */
  async listGraphs(): Promise<Array<{
    id: string;
    name: string;
    sourceType: string;
    sourcePath: string;
    createdAt: string;
    nodeCount: number;
    edgeCount: number;
  }>> {
    await this.ensureInitialized();
    
    const result = this.db!.exec(`
      SELECT id, name, source_type, source_path, created_at, graph_json
      FROM graphs
      ORDER BY created_at DESC
    `);

    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    const values = result[0].values;

    return values.map(row => {
      const rowObj: any = {};
      columns.forEach((col, idx) => {
        rowObj[col] = row[idx];
      });

      const graph = JSON.parse(rowObj.graph_json as string) as DependencyGraph;
      return {
        id: rowObj.id as string,
        name: rowObj.name as string,
        sourceType: rowObj.source_type as string,
        sourcePath: rowObj.source_path as string,
        createdAt: rowObj.created_at as string,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      };
    });
  }

  /**
   * Delete a graph by ID
   */
  async deleteGraph(id: string): Promise<boolean> {
    await this.ensureInitialized();
    
    this.db!.run('DELETE FROM graphs WHERE id = ?', [id]);
    this.saveToFile();
    
    // Check if it was deleted by trying to load it
    const exists = await this.loadGraph(id);
    return exists === null;
  }

  /**
   * Search graphs by name
   */
  async searchGraphs(query: string): Promise<DependencyGraph[]> {
    await this.ensureInitialized();
    
    const result = this.db!.exec(
      `SELECT graph_json FROM graphs WHERE name LIKE ? ORDER BY created_at DESC`,
      [`%${query}%`]
    );

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map(row => JSON.parse(row[0] as string) as DependencyGraph);
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.saveToFile();
      this.db.close();
      this.db = null;
    }
  }
}
