/**
 * Parser unit tests
 */
import { describe, it, expect } from 'vitest';
import { parseTerraform } from '../src/parsers/terraform.js';
import { parseDockerCompose } from '../src/parsers/docker-compose.js';
import { parseKubernetes } from '../src/parsers/kubernetes.js';
import { parseCodeowners } from '../src/parsers/codeowners.js';
import { parsePackageJson } from '../src/parsers/package-json.js';

describe('Terraform Parser', () => {
  it('should parse resource dependencies', async () => {
    const content = `
resource "aws_instance" "web" {
  ami           = "ami-12345"
  instance_type = "t2.micro"
  subnet_id     = aws_subnet.main.id
}

resource "aws_subnet" "main" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}
`;
    const deps = await parseTerraform(content);
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'aws_instance.web',
      target: 'aws_subnet.main',
      type: 'terraform_resource',
    }));
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'aws_subnet.main',
      target: 'aws_vpc.main',
      type: 'terraform_resource',
    }));
  });

  it('should handle empty content', async () => {
    const deps = await parseTerraform('');
    expect(deps).toEqual([]);
  });
});

describe('Docker Compose Parser', () => {
  it('should parse depends_on relationships', async () => {
    const content = `
version: '3.8'
services:
  web:
    image: nginx
    depends_on:
      - api
      - redis
  api:
    image: node
    depends_on:
      - db
  db:
    image: postgres
  redis:
    image: redis
`;
    const deps = await parseDockerCompose(content);
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'web',
      target: 'api',
      type: 'docker_depends_on',
    }));
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'web',
      target: 'redis',
      type: 'docker_depends_on',
    }));
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'api',
      target: 'db',
      type: 'docker_depends_on',
    }));
  });

  it('should parse depends_on with conditions', async () => {
    const content = `
version: '3.8'
services:
  web:
    image: nginx
    depends_on:
      db:
        condition: service_healthy
`;
    const deps = await parseDockerCompose(content);
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'web',
      target: 'db',
      type: 'docker_depends_on',
    }));
  });

  it('should handle invalid YAML', async () => {
    const deps = await parseDockerCompose('invalid: yaml: content: [');
    expect(deps).toEqual([]);
  });
});

describe('Kubernetes Parser', () => {
  it('should parse Service to Deployment dependencies', async () => {
    const content = `
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: my-app
  ports:
    - port: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-deployment
spec:
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-container
          image: nginx
`;
    const deps = await parseKubernetes(content);
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'Service/my-service',
      target: 'Deployment/my-deployment',
      type: 'k8s_service',
    }));
  });

  it('should parse ConfigMap and Secret references', async () => {
    const content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      containers:
        - name: app
          envFrom:
            - configMapRef:
                name: app-config
            - secretRef:
                name: app-secrets
`;
    const deps = await parseKubernetes(content);
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'Deployment/my-app',
      target: 'ConfigMap/app-config',
      type: 'k8s_configmap',
    }));
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'Deployment/my-app',
      target: 'Secret/app-secrets',
      type: 'k8s_secret',
    }));
  });

  it('should handle empty content', async () => {
    const deps = await parseKubernetes('');
    expect(deps).toEqual([]);
  });
});

describe('CODEOWNERS Parser', () => {
  it('should parse owner assignments', async () => {
    const content = `
# Global owners
* @org/platform-team

# Frontend
/src/web/ @org/frontend-team @alice

# Backend
/src/api/ @org/backend-team
`;
    const deps = await parseCodeowners(content);
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: '*',
      target: '@org/platform-team',
      type: 'codeowner',
    }));
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: '/src/web/',
      target: '@org/frontend-team',
      type: 'codeowner',
    }));
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: '/src/api/',
      target: '@org/backend-team',
      type: 'codeowner',
    }));
  });

  it('should skip comments and empty lines', async () => {
    const content = `
# This is a comment
# Another comment

/src/ @team
`;
    const deps = await parseCodeowners(content);
    expect(deps).toHaveLength(1);
  });
});

describe('Package.json Parser', () => {
  it('should parse dependencies', async () => {
    const content = JSON.stringify({
      name: 'my-app',
      dependencies: {
        express: '^4.18.0',
        lodash: '^4.17.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
    });

    const deps = await parsePackageJson(content);
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'my-app',
      target: 'express',
      type: 'npm_dependency',
    }));
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'my-app',
      target: 'lodash',
      type: 'npm_dependency',
    }));
    
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'my-app',
      target: 'typescript',
      type: 'npm_devDependency',
    }));
  });

  it('should handle invalid JSON', async () => {
    const deps = await parsePackageJson('not valid json');
    expect(deps).toEqual([]);
  });

  it('should handle missing name', async () => {
    const content = JSON.stringify({
      dependencies: { express: '^4.18.0' },
    });

    const deps = await parsePackageJson(content);
    expect(deps).toContainEqual(expect.objectContaining({
      source: 'unknown-package',
      target: 'express',
    }));
  });
});
