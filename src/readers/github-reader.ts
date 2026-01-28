/**
 * GitHub repository reader - reads files from GitHub repositories
 */
import { Octokit } from '@octokit/rest';

interface FileInfo {
  path: string;
  content: string;
}

interface GitHubTree {
  sha: string;
  url: string;
  tree: Array<{
    path?: string;
    mode?: string;
    type?: string;
    sha?: string;
    size?: number;
    url?: string;
  }>;
  truncated: boolean;
}

const SUPPORTED_PATTERNS = [
  /\.tf$/,                    // Terraform
  /docker-compose\.ya?ml$/,   // Docker Compose
  /\.ya?ml$/,                 // Kubernetes manifests
  /CODEOWNERS$/,              // GitHub CODEOWNERS
  /package\.json$/,           // NPM package
];

const IGNORE_PATHS = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  'vendor/',
  '__pycache__/',
  '.terraform/',
];

export class GitHubReader {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;

  constructor(repoUrl: string, branch: string = 'main', token?: string) {
    this.octokit = new Octokit({
      auth: token || process.env.GITHUB_TOKEN,
    });

    const { owner, repo } = this.parseRepoUrl(repoUrl);
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  /**
   * Parse GitHub repository URL
   */
  private parseRepoUrl(url: string): { owner: string; repo: string } {
    // Handle various URL formats:
    // - https://github.com/owner/repo
    // - https://github.com/owner/repo.git
    // - git@github.com:owner/repo.git
    // - owner/repo
    
    let match = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }

    match = url.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }

    throw new Error(`Invalid GitHub repository URL: ${url}`);
  }

  /**
   * Read all supported files from the repository
   */
  async readFiles(): Promise<FileInfo[]> {
    // Get the tree for the branch
    const { data: ref } = await this.octokit.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.branch}`,
    });

    const { data: tree } = await this.octokit.git.getTree({
      owner: this.owner,
      repo: this.repo,
      tree_sha: ref.object.sha,
      recursive: 'true',
    }) as { data: GitHubTree };

    // Filter to supported files
    const supportedFiles = tree.tree.filter(item => {
      if (item.type !== 'blob' || !item.path) return false;
      if (this.isIgnored(item.path)) return false;
      return this.isSupported(item.path);
    });

    // Read file contents in parallel (with concurrency limit)
    const files: FileInfo[] = [];
    const batchSize = 10;

    for (let i = 0; i < supportedFiles.length; i += batchSize) {
      const batch = supportedFiles.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(item => this.readFile(item.path!))
      );
      
      for (const result of batchResults) {
        if (result) {
          files.push(result);
        }
      }
    }

    return files;
  }

  /**
   * Read a single file from GitHub
   */
  private async readFile(filePath: string): Promise<FileInfo | null> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        ref: this.branch,
      });

      if ('content' in data && data.encoding === 'base64') {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return { path: filePath, content };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a file path should be ignored
   */
  private isIgnored(filePath: string): boolean {
    return IGNORE_PATHS.some(pattern => filePath.includes(pattern));
  }

  /**
   * Check if a filename matches supported patterns
   */
  private isSupported(filePath: string): boolean {
    const filename = filePath.split('/').pop() || '';
    return SUPPORTED_PATTERNS.some(pattern => pattern.test(filename));
  }

  /**
   * Get repository info
   */
  getRepoInfo(): { owner: string; repo: string; branch: string } {
    return {
      owner: this.owner,
      repo: this.repo,
      branch: this.branch,
    };
  }
}
