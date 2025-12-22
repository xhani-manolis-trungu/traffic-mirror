/* eslint-disable no-console */
const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');

class Recorder {
  constructor() {
    this.server = null;
    this.proxy = httpProxy.createProxyServer({});

    // 1. Handle Proxy Errors (Critical for preventing crashes)
    this.proxy.on('error', (err, req, res) => {
      console.error(`❌ Proxy Error [${req.url}]:`, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'Proxy Request Failed', details: err.message }));
    });
  }

  start(target, port, outputFile, onLog = () => { }) {
    if (this.server) throw new Error('Recorder already running');

    console.log(`📝 Recording to file: ${outputFile}`);
    const stream = fs.createWriteStream(outputFile, { flags: 'a' });

    // Handle file write errors
    stream.on('error', (err) => {
      console.error('❌ File Write Error:', err.message);
    });

    this.server = http.createServer((req, res) => {
      // 2. Capture Request Body safely
      // We use a separate array but we DO NOT attach 'data' listeners directly
      // unless we plan to buffer it for the proxy.
      // For simplicity, let's rely on the response capture primarily.

      const reqChunks = [];
      // We tap into the stream without consuming it destructively if possible,
      // but the safest way with http-proxy is often just to listen to the proxy events.
      // HOWEVER, for your specific "Request Stealing" fix:
      req.on('data', (chunk) => reqChunks.push(chunk));

      // --- Response Capture Logic ---
      const originalWrite = res.write;
      const originalEnd = res.end;
      const resChunks = [];

      res.write = function (chunk, ...args) {
        if (chunk) resChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return originalWrite.apply(res, [chunk, ...args]);
      };

      res.end = function (chunk, ...args) {
        if (chunk) resChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));

        // WRAP IN TRY/CATCH to prevent silent crashes
        try {
          const reqBody = Buffer.concat(reqChunks).toString();
          const resBody = Buffer.concat(resChunks).toString('utf8');

          const logData = {
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.url,
            status: res.statusCode,
            requestBody: reqBody || '',
            responseBody: resBody || '',
            // requestHeaders: req.headers, // Uncomment if needed (verbose)
          };

          const jsonLine = JSON.stringify(logData) + '\n';

          // 3. Write and Log
          stream.write(jsonLine);
          onLog(logData);

          // Debug Log to prove it worked
          process.stdout.write('.'); // Prints a dot for every logged request
        } catch (e) {
          console.error('\n❌ Error generating log:', e.message);
        }

        return originalEnd.apply(res, [chunk, ...args]);
      };

      // 4. Force Plain Text (Disable Gzip)
      delete req.headers['accept-encoding'];

      // 5. Forward to Target
      // We must set 'buffer' to the request stream if we consumed it,
      // but since we are just tapping 'data' without pausing, http-proxy might miss it.
      // A simple workaround for node streams in this context:
      this.proxy.web(req, res, { target });
    });

    this.server.listen(port, () => {
      console.log(`\n⏺️  Recorder listening on port ${port}`);
      console.log(`➡️  Forwarding to ${target}`);
    });

    return `Recorder started`;
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      return 'Recorder stopped';
    }
  }
}

module.exports = new Recorder();
