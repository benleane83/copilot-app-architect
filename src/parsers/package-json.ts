/**
 * package.json parser - extracts npm dependencies
 */
import type { ParsedDependency } from '../types.js';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/**
 * Parse package.json content and extract dependencies
 */
export async function parsePackageJson(fileContent: string): Promise<ParsedDependency[]> {
  const dependencies: ParsedDependency[] = [];

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(fileContent);
  } catch {
    return dependencies;
  }

  const sourceName = pkg.name || 'unknown-package';

  // Regular dependencies
  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      dependencies.push({
        source: sourceName,
        target: name,
        type: 'npm_dependency',
        metadata: { version, dependencyType: 'production' },
      });
    }
  }

  // Dev dependencies
  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      dependencies.push({
        source: sourceName,
        target: name,
        type: 'npm_devDependency',
        metadata: { version, dependencyType: 'development' },
      });
    }
  }

  // Peer dependencies
  if (pkg.peerDependencies) {
    for (const [name, version] of Object.entries(pkg.peerDependencies)) {
      dependencies.push({
        source: sourceName,
        target: name,
        type: 'npm_dependency',
        metadata: { version, dependencyType: 'peer' },
      });
    }
  }

  // Optional dependencies
  if (pkg.optionalDependencies) {
    for (const [name, version] of Object.entries(pkg.optionalDependencies)) {
      dependencies.push({
        source: sourceName,
        target: name,
        type: 'npm_dependency',
        metadata: { version, dependencyType: 'optional' },
      });
    }
  }

  return dependencies;
}
