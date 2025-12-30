# 🚦 Traffic Mirror (http-log-replay)

> **Regressions No More.** Record production traffic and replay it against your changes to verify correctness with zero effort.

[![npm version](https://img.shields.io/npm/v/http-log-replay.svg)](https://www.npmjs.com/package/http-log-replay)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)

**Traffic Mirror** is a powerful regression testing tool designed for modern engineering teams. It allows you to **record** HTTP traffic from a live environment (like Production) and **replay** it against two different target environments (e.g., Stable vs. Canary) to instantly detect regressions, bugs, or side-effects.

---

## 📋 Table of Contents

- [🌟 Features](#-features)
- [🚀 Quick Start (Zero Setup)](#-quick-start-zero-setup)
- [💻 Usage Guide: Web UI](#-usage-guide-web-ui)
- [🖥️ Usage Guide: CLI](#️-usage-guide-cli)
- [🐳 Usage Guide: Docker](#-usage-guide-docker)
- [🛠️ Development & Contribution](#️-development--contribution)
- [📦 Maintenance](#-maintenance)

---

## 🌟 Features

- **🛡️ Zero-Config Recording**: Acts as a transparent HTTP proxy to capture real requests.
- **⚡ High-Performance Replay**: Replay thousands of requests in parallel with customizable concurrency.
- **🔍 Intelligent Diffing**: compares JSON responses and ignores dynamic fields (like timestamps, UUIDs) that cause false positives.
- **📊 Rich Reporting**: Generates detailed HTML reports showing exactly what broke.
- **🔌 Swagger Integration**: Auto-generate test traffic from your OpenAPI definitions if you don't have live traffic.
- **🏗️ Two Modes**: Full interactive **Web UI** for debugging and a lightweight **CLI** for CI/CD pipelines.

---

## 🚀 Quick Start (Zero Setup)

You don't need to install anything if you have Node.js (v18+) installed. Just run:

```bash
npx http-log-replay ui --port 4200
```

This will launch the **Traffic Mirror Dashboard** at [http://localhost:4200](http://localhost:4200).

---

## 💻 Usage Guide: Web UI

The Web UI is the best way to get started. It guides you through the entire workflow in three simple tabs.

### 1. 🔴 Record / Generate

- **Manual Mode**: Start the proxy, point your application/client to it, and select desired HTTP methods (e.g., GET, POST).
- **Auto-Generate**: Upload an OpenAPI/Swagger JSON file to automatically generate realistic traffic patterns.
- **YAML Config Mode**: Load a `config.yaml` file to pre-configure Traffic Generation (target, source, exclusions, timeouts, methods).

### 2. ▶️ Replay

- Configure your **Primary** (Stable) and **Secondary** (Test) environments.
- Set **Concurrency** to speed up large suites.
- Add **Ignore Fields** (e.g., `createdAt`, `traceId`) to filter out noise in the comparison.
- Click **Replay & Compare**.

### 3. 📄 Report

- Instantly view the results.
- **Green**: Exact match.
- **Red**: Mismatch (click to expand the JSON diff).

---

## 🖥️ Usage Guide: CLI

Perfect for **CI/CD pipelines** or headless environments.

### 1. Record Traffic

Start a recording proxy on port `3000` forwarding to your real API at `localhost:8080`.

```bash
# Run from source
node index.js record --target http://localhost:8080 --port 3000 --out traffic.jsonl
```

### 2. Auto-Generate from Swagger

Generate traffic without manual clicking. You can use command line flags or a YAML configuration file.

**Using Configuration File (Recommended):**

```bash
node index.js generate --config config.example.yaml
```

**Using Flags:**

```bash
node index.js generate --file ./openapi.json --target http://localhost:3000
```

### 3. Replay & Verify

Replay recorded traffic against two environments and generate an HTML report.

```bash
node index.js replay \
  --log traffic.jsonl \
  --primary http://prod-api.com \
  --secondary http://staging-api.com \
  --report report.html \
  --ignore "timestamp,id"
```

---

## 🐳 Usage Guide: Docker

We provide optimized Docker images for both the UI and CLI.

### Prerequisites

- Docker & Docker Compose installed.

### Option A: Complete Environment (Recommended)

Use the included `docker-compose.yml` to run everything.

**Start the GUI:**

```bash
docker-compose up gui
```

> Access at [http://localhost:4200](http://localhost:4200). Data is persisted to your host folder.

**Run CLI Commands:**

```bash
docker-compose run cli record --target http://host.docker.internal:8080 ...
```

### Option B: Manual Docker Run

**UI Image:**

```bash
docker run -p 4200:4200 -v $(pwd):/app traffic-mirror-gui
```

**CLI Image:**

```bash
docker run -v $(pwd):/app traffic-mirror-cli --help
```

---

## 🛠️ Development & Contribution

We welcome contributions! Here is how to run the project locally for development.

### 1. Setup

```bash
git clone https://github.com/your-username/http-log-replay.git
cd http-log-replay
npm install
```

### 2. Build the UI

The UI is built with Angular. You must build it before running the app.

```bash
cd ui
npm install
npm run build
cd ..
```

### 3. Run Locally (Dev Mode)

```bash
# Start the full app (Frontend + Backend)
node index.js ui --port 4200
```

### 4. Testing & Code Quality

We use **Jest** for testing and **ESLint** for code quality.

```bash
# Run Unit Tests
npm test

# Lint Code
npm run lint

# Format Code
npm run format

# Production Start (PM2)
npm run start:pm2
```

---

## 📦 Maintenance

### Publishing to NPM

1.  **Bump Version**: Update `version` in `package.json`.
2.  **Build UI**: The `prepublishOnly` script will automatically build the Angular UI.
3.  **Publish**:
    ```bash
    npm publish
    ```

### File Structure

- `index.js`: CLI entry point.
- `recorder.js`: Proxy logic.
- `replayer.js`: Replay & Diff logic.
- `server.js`: Express server for the UI.
- `ui/`: Angular frontend source code.
- `tests/`: Jest unit tests.

---

_Built with ❤️ by the Traffic Mirror Team._
