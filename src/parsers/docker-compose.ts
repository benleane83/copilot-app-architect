/**
 * Docker Compose parser - extracts service dependencies from docker-compose.yml
 */
import yaml from 'js-yaml';
import type { ParsedDependency } from '../types.js';

interface DockerComposeService {
  depends_on?: string[] | Record<string, { condition?: string }>;
  networks?: string[] | Record<string, unknown>;
  links?: string[];
  volumes_from?: string[];
  image?: string;
  build?: string | { context?: string };
}

interface DockerComposeFile {
  version?: string;
  services?: Record<string, DockerComposeService>;
  networks?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
}

/**
 * Parse docker-compose.yml content and extract dependencies
 */
export async function parseDockerCompose(fileContent: string): Promise<ParsedDependency[]> {
  const dependencies: ParsedDependency[] = [];

  let compose: DockerComposeFile;
  try {
    compose = yaml.load(fileContent) as DockerComposeFile;
  } catch {
    // Invalid YAML
    return dependencies;
  }

  if (!compose || !compose.services) {
    return dependencies;
  }

  const services = compose.services;

  for (const [serviceName, service] of Object.entries(services)) {
    if (!service) continue;

    // Handle depends_on
    if (service.depends_on) {
      const dependsOn = Array.isArray(service.depends_on)
        ? service.depends_on
        : Object.keys(service.depends_on);

      for (const dep of dependsOn) {
        dependencies.push({
          source: serviceName,
          target: dep,
          type: 'docker_depends_on',
          metadata: {
            condition: !Array.isArray(service.depends_on) 
              ? service.depends_on[dep]?.condition 
              : undefined,
          },
        });
      }
    }

    // Handle links (legacy but still used)
    if (service.links) {
      for (const link of service.links) {
        const target = link.split(':')[0]; // handle alias syntax
        dependencies.push({
          source: serviceName,
          target,
          type: 'docker_depends_on',
          metadata: { linkType: 'legacy_link' },
        });
      }
    }

    // Handle volumes_from
    if (service.volumes_from) {
      for (const vol of service.volumes_from) {
        const target = vol.split(':')[0];
        dependencies.push({
          source: serviceName,
          target,
          type: 'docker_depends_on',
          metadata: { linkType: 'volumes_from' },
        });
      }
    }

    // Handle shared networks (creates implicit dependencies)
    if (service.networks) {
      const networks = Array.isArray(service.networks)
        ? service.networks
        : Object.keys(service.networks);

      for (const network of networks) {
        // Find other services on the same network
        for (const [otherName, otherService] of Object.entries(services)) {
          if (otherName === serviceName || !otherService) continue;
          
          const otherNetworks = otherService.networks
            ? (Array.isArray(otherService.networks) 
                ? otherService.networks 
                : Object.keys(otherService.networks))
            : [];

          if (otherNetworks.includes(network)) {
            // Create network-based dependency (bidirectional, so only add one direction)
            if (serviceName < otherName) {
              dependencies.push({
                source: serviceName,
                target: otherName,
                type: 'docker_network',
                metadata: { network },
              });
            }
          }
        }
      }
    }
  }

  return dependencies;
}
