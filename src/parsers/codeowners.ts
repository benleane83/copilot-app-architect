/**
 * CODEOWNERS parser - extracts ownership metadata
 */
import type { ParsedDependency } from '../types.js';

interface CodeownerRule {
  pattern: string;
  owners: string[];
}

/**
 * Parse CODEOWNERS file content and extract ownership dependencies
 */
export async function parseCodeowners(fileContent: string): Promise<ParsedDependency[]> {
  const dependencies: ParsedDependency[] = [];
  const rules = parseCodeownerRules(fileContent);

  // Create dependencies from paths to owners
  for (const rule of rules) {
    for (const owner of rule.owners) {
      dependencies.push({
        source: rule.pattern,
        target: owner,
        type: 'codeowner',
        metadata: {
          pattern: rule.pattern,
          isTeam: owner.startsWith('@') && owner.includes('/'),
        },
      });
    }
  }

  return dependencies;
}

/**
 * Parse CODEOWNERS rules from file content
 */
function parseCodeownerRules(content: string): CodeownerRule[] {
  const rules: CodeownerRule[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse the rule: pattern followed by owners
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const pattern = parts[0];
      const owners = parts.slice(1).filter(o => o.startsWith('@'));
      
      if (owners.length > 0) {
        rules.push({ pattern, owners });
      }
    }
  }

  return rules;
}

/**
 * Match a file path against CODEOWNERS rules to find owners
 */
export function findOwnersForPath(path: string, rules: CodeownerRule[]): string[] {
  // Rules are processed in order, last match wins
  let matchedOwners: string[] = [];

  for (const rule of rules) {
    if (matchPattern(path, rule.pattern)) {
      matchedOwners = rule.owners;
    }
  }

  return matchedOwners;
}

/**
 * Match a path against a CODEOWNERS pattern
 */
function matchPattern(path: string, pattern: string): boolean {
  // Normalize paths
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedPattern = pattern.startsWith('/') ? pattern : `/${pattern}`;

  // Convert pattern to regex
  let regexStr = normalizedPattern
    // Escape special regex characters (except * and ?)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Convert ** to match any path
    .replace(/\*\*/g, '.*')
    // Convert * to match any non-slash characters
    .replace(/\*/g, '[^/]*')
    // Convert ? to match single character
    .replace(/\?/g, '.');

  // If pattern ends with /, match any file in that directory
  if (pattern.endsWith('/')) {
    regexStr = regexStr + '.*';
  }

  // Pattern should match from start
  if (!regexStr.startsWith('/')) {
    regexStr = '.*' + regexStr;
  }

  try {
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(normalizedPath);
  } catch {
    return false;
  }
}
