/* eslint-disable no-console */
// ... existing imports
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const recorder = require('./recorder');
const replayer = require('./replayer');
const generator = require('./traffic-generator');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

function startServer(port = 4200) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  app.use(cors());
  app.use(express.json());

  // --- Recorder API ---
  app.post('/api/record/start', (req, res) => {
    const { target, port, file } = req.body;
    try {
      const msg = recorder.start(target, port, file, (log) => {
        io.emit('record-log', log);
      });
      res.json({ status: 'ok', message: msg });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/record/stop', (req, res) => {
    recorder.stop();
    res.json({ status: 'ok', message: 'Stopped' });
  });

  // --- Replayer API (FIXED) ---
  app.post('/api/replay', (req, res) => {
    // Added 'exclude' to destructuring
    const { file, env1, env2, ignore, auth, exclude } = req.body;

    const injectedHeaders = {};
    if (auth && auth.trim() !== '') {
      injectedHeaders['Authorization'] = auth;
    }

    // Fixed Argument Order:
    // 1. file, 2. env1, 3. env2, 4. reportPath, 5. ignore, 6. headers, 7. EXCLUDE, 8. callback
    replayer(
      file,
      env1,
      env2,
      'last-report.html',
      ignore || [],
      injectedHeaders,
      exclude || [], // <--- Pass exclude array here
      (event) => {
        io.emit('replay-event', event);
      }
    );

    res.json({ status: 'ok', message: 'Replay started' });
  });

  // --- Generator API ---
  app.post('/api/generate', async (req, res) => {
    // 1. Get arguments (Added 'target' and 'port' so we can start the recorder)
    const { proxyUrl, swaggerFile, exclude, target, port } = req.body;

    const targetProxy = proxyUrl || 'http://localhost:3000';
    const targetFile = swaggerFile || './full_documentation.json';
    const targetExclude = Array.isArray(exclude) ? exclude : [];
    const recTarget = target || 'http://localhost:8080';
    const recPort = port || 3000;

    console.log('🚀 Starting Traffic Generation Workflow...');

    // --- STEP A: Start the Recorder (The Proxy) ---
    try {
      // We force start the recorder so there is something listening on port 3000
      recorder.start(recTarget, recPort, 'ui-traffic.jsonl', (log) => {
        io.emit('record-log', log);
      });
      console.log(`🎙️  Auto-started Recorder on port ${recPort} -> ${recTarget}`);
    } catch (e) {
      console.log('⚠️  Recorder might already be running, proceeding...');
    }

    res.json({ status: 'started', message: 'Traffic generation started' });

    try {
      // --- STEP B: Run the Generator ---
      // Wait a moment for the server to bind the port
      await new Promise((r) => setTimeout(r, 500));

      let generatorConfig;

      // New: Check for configPath
      if (req.body.configPath && fs.existsSync(req.body.configPath)) {
        console.log(`Loading configuration from ${req.body.configPath}...`);
        const raw = fs.readFileSync(req.body.configPath, 'utf8');
        generatorConfig = yaml.load(raw);
        
        // Override target/source if needed to ensure we point to the recorder?
        // Actually, the user's config might point safely to the real target.
        // But if we want to record, we might need to intercept.
        // For now, let's assume the user config is "correct" for what they want to do.
        // However, if we WANT to record, we should probably ensure the generator targets the recorder.
        
        // If we are recording, we might want to override the 'target' in the config to be the Recorder URL
        // But the recorder is running on 'recTarget:recPort'.
        // The generator needs to send requests to 'http://localhost:recPort'.
        
        // Let's force the generator target to hit our local Recorder if we started it.
        // But if the user provided a config, they might expect it to follow that. 
        // Given this is a specific UI flow "Generate & Record", we should override the target to be the proxy.
        // generatorConfig.target = `http://localhost:${recPort}`;
        // But wait, the proxy forwards to the REAL target.
        
      } else {
        // Legacy / Manual Mode construction
        generatorConfig = {
          target: targetProxy,
          source: recTarget,
          file: targetFile,
          exclude: targetExclude,
          delay: 50,
          timeout: 5000
        };
      }

      await generator.run(generatorConfig, (log) => {
        // If the log is an object, emit it; if string, just log console
        if (typeof log === 'object' && log.message) {
           io.emit('record-log', log); // Emit to UI
        }
      });

      console.log('🛑 Generation finished. Stopping Recorder...');

      // --- STEP C: Stop the Recorder ---
      recorder.stop();
      io.emit('record-stopped');
    } catch (e) {
      console.error('Generator Error:', e);
      recorder.stop(); // Ensure we stop even if generator crashes
      io.emit('record-stopped');
    }
  });

  // ... Serve Angular logic (keep existing) ...
  const frontendPath = path.join(__dirname, 'ui/dist/ui/browser');
  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
  }

  server.listen(port, () => {
    console.log(`\n🌐 TrafficMirror running at http://localhost:${port}`);
  });
}

module.exports = startServer;
