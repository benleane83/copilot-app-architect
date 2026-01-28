/**
 * Terraform parser - extracts resource dependencies from .tf files
 */
import type { ParsedDependency } from '../types.js';

interface TerraformResource {
  type: string;
  name: string;
  references: string[];
}

/**
 * Parse Terraform file content and extract dependencies
 */
export async function parseTerraform(fileContent: string): Promise<ParsedDependency[]> {
  const dependencies: ParsedDependency[] = [];
  const resources: TerraformResource[] = [];

  // Match resource blocks: resource "type" "name" { ... }
  const resourceRegex = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
  let match;

  while ((match = resourceRegex.exec(fileContent)) !== null) {
    const [, type, name, body] = match;
    const references = extractReferences(body);
    resources.push({ type, name, references });
  }

  // Match data sources: data "type" "name" { ... }
  const dataRegex = /data\s+"([^"]+)"\s+"([^"]+)"\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
  while ((match = dataRegex.exec(fileContent)) !== null) {
    const [, type, name, body] = match;
    const references = extractReferences(body);
    resources.push({ type: `data.${type}`, name, references });
  }

  // Build dependencies from references
  for (const resource of resources) {
    const sourceId = `${resource.type}.${resource.name}`;
    
    for (const ref of resource.references) {
      // Parse reference like aws_instance.example or data.aws_ami.ubuntu
      const parts = ref.split('.');
      if (parts.length >= 2) {
        const targetId = parts.slice(0, 2).join('.');
        
        // Skip self-references
        if (targetId !== sourceId) {
          dependencies.push({
            source: sourceId,
            target: targetId,
            type: 'terraform_resource',
            metadata: {
              referenceType: parts.length > 2 ? parts.slice(2).join('.') : 'direct',
            },
          });
        }
      }
    }
  }

  return dependencies;
}

/**
 * Extract resource references from a Terraform block body
 */
function extractReferences(body: string): string[] {
  const references: string[] = [];
  
  // Match references like ${aws_instance.example.id} or aws_instance.example.id
  const interpolationRegex = /\$\{([^}]+)\}/g;
  let match;
  
  while ((match = interpolationRegex.exec(body)) !== null) {
    const ref = match[1].trim();
    const extracted = extractResourceRef(ref);
    if (extracted) {
      references.push(extracted);
    }
  }

  // Match direct references (HCL2 style): aws_instance.example.id
  const directRefRegex = /(?:^|[^a-zA-Z0-9_])([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)/g;
  while ((match = directRefRegex.exec(body)) !== null) {
    const ref = match[1];
    // Filter out common non-resource patterns
    if (!isCommonKeyword(ref)) {
      references.push(ref);
    }
  }

  // Deduplicate
  return [...new Set(references)];
}

/**
 * Extract resource reference from an expression
 */
function extractResourceRef(expression: string): string | null {
  // Handle simple references
  const simpleMatch = expression.match(/^([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)/);
  if (simpleMatch) {
    return simpleMatch[1];
  }
  
  // Handle data source references
  const dataMatch = expression.match(/^(data\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)/);
  if (dataMatch) {
    return dataMatch[1];
  }

  return null;
}

/**
 * Check if a reference is a common Terraform keyword (not a resource)
 */
function isCommonKeyword(ref: string): boolean {
  const keywords = [
    'var.', 'local.', 'module.', 'count.', 'each.', 'self.',
    'path.', 'terraform.', 'true.', 'false.', 'null.'
  ];
  return keywords.some(k => ref.startsWith(k));
}
