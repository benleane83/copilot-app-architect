/**
 * Kubernetes manifest parser - extracts service dependencies
 */
import yaml from 'js-yaml';
import type { ParsedDependency } from '../types.js';

interface K8sMetadata {
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

interface K8sResource {
  apiVersion: string;
  kind: string;
  metadata: K8sMetadata;
  spec?: Record<string, unknown>;
}

interface K8sServiceSpec {
  selector?: Record<string, string>;
  ports?: Array<{ port: number; targetPort?: number | string }>;
}

interface K8sDeploymentSpec {
  selector?: { matchLabels?: Record<string, string> };
  template?: {
    metadata?: { labels?: Record<string, string> };
    spec?: {
      containers?: Array<{
        name: string;
        env?: Array<{ name: string; valueFrom?: { configMapKeyRef?: { name: string }; secretKeyRef?: { name: string } } }>;
        envFrom?: Array<{ configMapRef?: { name: string }; secretRef?: { name: string } }>;
        volumeMounts?: Array<{ name: string }>;
      }>;
      volumes?: Array<{
        name: string;
        configMap?: { name: string };
        secret?: { secretName: string };
        persistentVolumeClaim?: { claimName: string };
      }>;
      serviceAccountName?: string;
    };
  };
}

/**
 * Parse Kubernetes manifest content and extract dependencies
 */
export async function parseKubernetes(fileContent: string): Promise<ParsedDependency[]> {
  const dependencies: ParsedDependency[] = [];
  const resources: K8sResource[] = [];

  // Parse YAML (may contain multiple documents)
  try {
    yaml.loadAll(fileContent, (doc) => {
      if (doc && typeof doc === 'object' && 'kind' in doc) {
        resources.push(doc as K8sResource);
      }
    });
  } catch {
    return dependencies;
  }

  // Build a map of resources for reference
  const resourceMap = new Map<string, K8sResource>();
  for (const resource of resources) {
    const key = `${resource.kind}/${resource.metadata?.name}`;
    resourceMap.set(key, resource);
  }

  // Extract dependencies for each resource
  for (const resource of resources) {
    const sourceName = `${resource.kind}/${resource.metadata?.name}`;

    switch (resource.kind) {
      case 'Service':
        extractServiceDependencies(resource, resources, sourceName, dependencies);
        break;
      case 'Deployment':
      case 'StatefulSet':
      case 'DaemonSet':
      case 'Job':
      case 'CronJob':
        extractWorkloadDependencies(resource, sourceName, dependencies);
        break;
      case 'Ingress':
        extractIngressDependencies(resource, sourceName, dependencies);
        break;
    }
  }

  return dependencies;
}

/**
 * Extract Service -> Pod/Deployment dependencies via selector
 */
function extractServiceDependencies(
  service: K8sResource,
  resources: K8sResource[],
  sourceName: string,
  dependencies: ParsedDependency[]
): void {
  const spec = service.spec as K8sServiceSpec | undefined;
  if (!spec?.selector) return;

  const selector = spec.selector;

  // Find deployments/pods that match the selector
  for (const resource of resources) {
    if (!['Deployment', 'StatefulSet', 'DaemonSet', 'Pod'].includes(resource.kind)) {
      continue;
    }

    const deploySpec = resource.spec as K8sDeploymentSpec | undefined;
    const labels = resource.kind === 'Pod'
      ? resource.metadata?.labels
      : deploySpec?.template?.metadata?.labels;

    if (labels && matchesSelector(labels, selector)) {
      dependencies.push({
        source: sourceName,
        target: `${resource.kind}/${resource.metadata?.name}`,
        type: 'k8s_service',
        metadata: { selector },
      });
    }
  }
}

/**
 * Extract workload dependencies (ConfigMaps, Secrets, PVCs, ServiceAccounts)
 */
function extractWorkloadDependencies(
  workload: K8sResource,
  sourceName: string,
  dependencies: ParsedDependency[]
): void {
  const spec = workload.spec as K8sDeploymentSpec | undefined;
  const podSpec = spec?.template?.spec;

  if (!podSpec) return;

  // Check volumes
  if (podSpec.volumes) {
    for (const volume of podSpec.volumes) {
      if (volume.configMap) {
        dependencies.push({
          source: sourceName,
          target: `ConfigMap/${volume.configMap.name}`,
          type: 'k8s_configmap',
          metadata: { volumeName: volume.name },
        });
      }
      if (volume.secret) {
        dependencies.push({
          source: sourceName,
          target: `Secret/${volume.secret.secretName}`,
          type: 'k8s_secret',
          metadata: { volumeName: volume.name },
        });
      }
      if (volume.persistentVolumeClaim) {
        dependencies.push({
          source: sourceName,
          target: `PersistentVolumeClaim/${volume.persistentVolumeClaim.claimName}`,
          type: 'k8s_deployment',
          metadata: { volumeName: volume.name },
        });
      }
    }
  }

  // Check containers for env references
  if (podSpec.containers) {
    for (const container of podSpec.containers) {
      // Check envFrom
      if (container.envFrom) {
        for (const envFrom of container.envFrom) {
          if (envFrom.configMapRef) {
            dependencies.push({
              source: sourceName,
              target: `ConfigMap/${envFrom.configMapRef.name}`,
              type: 'k8s_configmap',
              metadata: { container: container.name },
            });
          }
          if (envFrom.secretRef) {
            dependencies.push({
              source: sourceName,
              target: `Secret/${envFrom.secretRef.name}`,
              type: 'k8s_secret',
              metadata: { container: container.name },
            });
          }
        }
      }

      // Check individual env vars
      if (container.env) {
        for (const env of container.env) {
          if (env.valueFrom?.configMapKeyRef) {
            dependencies.push({
              source: sourceName,
              target: `ConfigMap/${env.valueFrom.configMapKeyRef.name}`,
              type: 'k8s_configmap',
              metadata: { container: container.name, envVar: env.name },
            });
          }
          if (env.valueFrom?.secretKeyRef) {
            dependencies.push({
              source: sourceName,
              target: `Secret/${env.valueFrom.secretKeyRef.name}`,
              type: 'k8s_secret',
              metadata: { container: container.name, envVar: env.name },
            });
          }
        }
      }
    }
  }

  // Check ServiceAccount
  if (podSpec.serviceAccountName) {
    dependencies.push({
      source: sourceName,
      target: `ServiceAccount/${podSpec.serviceAccountName}`,
      type: 'k8s_deployment',
      metadata: {},
    });
  }
}

/**
 * Extract Ingress -> Service dependencies
 */
function extractIngressDependencies(
  ingress: K8sResource,
  sourceName: string,
  dependencies: ParsedDependency[]
): void {
  const spec = ingress.spec as { rules?: Array<{ http?: { paths?: Array<{ backend?: { service?: { name: string } } }> } }> } | undefined;
  
  if (!spec?.rules) return;

  for (const rule of spec.rules) {
    if (!rule.http?.paths) continue;
    
    for (const path of rule.http.paths) {
      if (path.backend?.service?.name) {
        dependencies.push({
          source: sourceName,
          target: `Service/${path.backend.service.name}`,
          type: 'k8s_service',
          metadata: {},
        });
      }
    }
  }
}

/**
 * Check if labels match a selector
 */
function matchesSelector(labels: Record<string, string>, selector: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(selector)) {
    if (labels[key] !== value) {
      return false;
    }
  }
  return true;
}
