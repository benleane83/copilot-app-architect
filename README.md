# 🏗️ Copilot App Architect

Visual System Intelligence - A Node.js/TypeScript application that visualizes service dependencies as an interactive graph and uses AI-powered analysis to answer questions like "What breaks if this is down?" and "Why are these coupled?"

## Features

- **📊 Dependency Graph Visualization** - Interactive graph visualization using Cytoscape.js
- **🔍 Blast Radius Analysis** - Determine what services are affected if a component fails
- **🔗 Coupling Analysis** - Understand why services are coupled together
- **🔄 Multi-Source Support** - Scan local directories or GitHub repositories
- **📁 Multiple Parser Support**:
  - Terraform (`.tf` files)
  - Docker Compose (`docker-compose.yml`)
  - Kubernetes manifests
  - CODEOWNERS
  - package.json
- **💾 Graph Caching** - SQLite-based persistence for quick access

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/benleane83/copilot-app-architect.git
cd copilot-app-architect

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
```

### Development

```bash
# Run in development mode with hot reload
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Usage

### Web Interface

1. Start the server: `npm start`
2. Open http://localhost:3000 in your browser
3. Click "Scan Repository" to analyze a project
4. Select a graph from the sidebar to visualize
5. Click on nodes and ask questions like:
   - "What breaks if this is down?"
   - "Why are these coupled?"
   - "Show overview"

### API Endpoints

#### Scan a Repository

```bash
# Scan a local directory
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"type": "local", "path": "/path/to/project"}'

# Scan a GitHub repository
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"type": "github", "path": "owner/repo", "branch": "main"}'
```

#### List Graphs

```bash
curl http://localhost:3000/api/graphs
```

#### Get Graph Details

```bash
curl http://localhost:3000/api/graphs/{graphId}
```

#### Ask Questions

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "graphId": "{graphId}",
    "question": "What breaks if the database is down?",
    "selectedNodes": ["db"]
  }'
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web UI (React)                           │
│   ┌─────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│   │  GraphCanvas    │  │  QueryPanel    │  │  ScanModal     │  │
│   │  (Cytoscape.js) │  │  (Questions)   │  │  (Repo Input)  │  │
│   └─────────────────┘  └────────────────┘  └────────────────┘  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│                      Express API Server                          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│   │  /scan   │  │ /graphs  │  │  /ask    │  │ /blast-radius│   │
│   └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
    ┌────────────────────────────┼────────────────────────────┐
    │                            │                            │
┌───▼───────────┐    ┌───────────▼───────────┐    ┌──────────▼──────────┐
│   Readers     │    │   Graph Builder       │    │   Agent Service     │
│ ┌───────────┐ │    │ ┌─────────────────┐  │    │ ┌─────────────────┐ │
│ │  Local    │ │    │ │ Parser Pipeline │  │    │ │ Blast Radius    │ │
│ │  GitHub   │ │    │ │ Node/Edge Types │  │    │ │ Coupling        │ │
│ └───────────┘ │    │ │ Graph Analyzer  │  │    │ │ Graph Data      │ │
└───────────────┘    │ └─────────────────┘  │    │ └─────────────────┘ │
                     └─────────┬────────────┘    └─────────────────────┘
                               │
                     ┌─────────▼────────────┐
                     │   SQLite Storage     │
                     │   (graphs.sqlite)    │
                     └──────────────────────┘
```

## Project Structure

```
src/
├── api/                 # Express routes and server
├── agent/               # AI-powered analysis
├── graph/               # Graph building and analysis
├── parsers/             # File parsers
├── readers/             # File readers
├── session/             # Session management
├── web/                 # React UI
├── types.ts             # TypeScript types
└── index.ts             # Entry point
```

## Supported File Types

| File Type | Extension | Dependencies Extracted |
|-----------|-----------|----------------------|
| Terraform | `.tf` | Resource references |
| Docker Compose | `docker-compose.yml` | depends_on, links, networks |
| Kubernetes | `.yaml` | Service→Deployment, ConfigMap, Secret refs |
| CODEOWNERS | `CODEOWNERS` | Path→Owner mappings |
| NPM | `package.json` | dependencies, devDependencies |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `GITHUB_TOKEN` | - | GitHub token for private repo access |

## License

MIT
