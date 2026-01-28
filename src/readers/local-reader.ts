/**
 * Local filesystem reader - reads files from local directories
 */
import fs from 'fs/promises';
import path from 'path';

interface FileInfo {
  path: string;
  content: string;
}

const SUPPORTED_PATTERNS = [
  /\.tf$/,                    // Terraform
  /docker-compose\.ya?ml$/,   // Docker Compose
  /\.ya?ml$/,                 // Kubernetes manifests (filtered later)
  /CODEOWNERS$/,              // GitHub CODEOWNERS
  /package\.json$/,           // NPM package
];

const IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
  'coverage',
  '__pycache__',
  '.terraform',
  'vendor',
];

export class LocalReader {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = path.resolve(basePath);
  }

  /**
   * Read all supported files from the directory
   */
  async readFiles(): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    await this.readDirectory(this.basePath, files);
    return files;
  }

  /**
   * Recursively read directory
   */
  private async readDirectory(dirPath: string, files: FileInfo[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      // Skip directories we can't read
      return;
    }

    const readPromises: Promise<void>[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(this.basePath, fullPath);

      if (entry.isDirectory()) {
        // Skip ignored directories
        if (IGNORE_DIRS.includes(entry.name)) {
          continue;
        }
        readPromises.push(this.readDirectory(fullPath, files));
      } else if (entry.isFile()) {
        // Check if file matches any supported pattern
        if (this.isSupported(entry.name)) {
          readPromises.push(this.readFile(fullPath, relativePath, files));
        }
      }
    }

    await Promise.all(readPromises);
  }

  /**
   * Read a single file
   */
  private async readFile(
    fullPath: string,
    relativePath: string,
    files: FileInfo[]
  ): Promise<void> {
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      files.push({ path: relativePath, content });
    } catch {
      // Skip files we can't read
    }
  }

  /**
   * Check if a filename matches supported patterns
   */
  private isSupported(filename: string): boolean {
    return SUPPORTED_PATTERNS.some(pattern => pattern.test(filename));
  }

  /**
   * Get base path
   */
  getBasePath(): string {
    return this.basePath;
  }
}
