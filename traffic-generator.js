/* eslint-disable no-console */
const fs = require('fs');
const http = require('http');
const https = require('https');

class TrafficGenerator {
  /**
   * Fixed signature to match index.js:
   * 1. proxyUrl (from options.target)
   * 2. swaggerPath (from options.file)
   * 3. exclude (from options.exclude)
   * 4. onProgress (the callback)
   * 5. sourceUrl (from options.source)
   */
  /**
   * Run traffic generation with the provided configuration.
   * @param {Object} config - Configuration object
   * @param {Function} onProgress - Callback for progress updates
   */
  async run(config, onProgress = () => { }) {
    const {
      target: proxyUrl,
      file: swaggerPath,
      source: sourceUrl,
      exclude = [],
      timeout = 5000,
      delay = 50,
      // retries = 3, // Not used yet in this simple loop
      headers = {},
      methods = ['GET'] // Default to GET only
    } = config;

    // Normalize methods to upper case
    const targetMethods = methods.map(m => m.toUpperCase());

    // --- STEP 1: Health Checks ---
    onProgress({ message: `🩺 Starting Pre-flight Health Checks...` });

    // Check Proxy Health
    onProgress({ message: `   - Checking Proxy: ${proxyUrl}` });
    const isProxyUp = await this.checkConnection(proxyUrl);

    // Check Source Health (if provided)
    let isSourceUp = true;
    if (sourceUrl) {
      onProgress({ message: `   - Checking Source: ${sourceUrl}` });
      isSourceUp = await this.checkConnection(sourceUrl);
    }

    if (!isProxyUp) {
      const msg = `🛑 ABORTING: Proxy is unreachable at ${proxyUrl}`;
      onProgress({ message: msg });
      throw new Error(msg);
    }

    if (sourceUrl && !isSourceUp) {
      const msg = `🛑 ABORTING: Source Server is unreachable at ${sourceUrl}`;
      onProgress({ message: msg });
      throw new Error(msg);
    }

    onProgress({ message: `✅ Systems Nominal. Proxy and Source are UP.` });
    // -----------------------------

    onProgress({ message: `📖 Reading Swagger file: ${swaggerPath}` });

    let doc;
    try {
      if (!fs.existsSync(swaggerPath)) {
        throw new Error(`Swagger file not found at ${swaggerPath}`);
      }
      const raw = fs.readFileSync(swaggerPath);
      doc = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Failed to load Swagger: ${e.message}`);
    }

    // Validate Swagger structure
    if (!doc.paths) {
      throw new Error("Invalid Swagger file: 'paths' property missing.");
    }

    const paths = Object.keys(doc.paths);
    
    // Find all valid (path, method) pairs
    const validOperations = []; // Array of { path, method }

    paths.forEach(p => {
      const pathItem = doc.paths[p];
      Object.keys(pathItem).forEach(method => {
        const upperMethod = method.toUpperCase();
        if (targetMethods.includes(upperMethod)) {
          validOperations.push({ path: p, method: upperMethod });
        }
      });
    });

    onProgress({
      message: `🔍 Found ${validOperations.length} operations matching [${targetMethods.join(', ')}]. Applying filters...`,
    });

    const rawExclude = Array.isArray(exclude) ? exclude : [exclude];
    const cleanExclude = rawExclude.map((e) => (e ? e.trim() : '')).filter((e) => e !== '');

    const filteredOperations = validOperations.filter((op) => {
      if (cleanExclude.includes(op.path)) return false;
      const isExcluded = cleanExclude.some((excludedItem) => {
        return excludedItem.endsWith(op.path) || op.path.endsWith(excludedItem);
      });
      if (isExcluded) return false;
      return true;
    });

    onProgress({
      message: `⚡ Generating traffic for ${filteredOperations.length
        } operations (Skipped ${validOperations.length - filteredOperations.length})`,
    });

    // Ensure we send traffic to the PROXY
    const cleanProxyUrl = proxyUrl.replace(/\/$/, '');
    let count = 0;

    for (const op of filteredOperations) {
      // Skip parameterized endpoints like /users/{id} for now as we can't guess IDs
      if (op.path.includes('{')) {
        onProgress({ message: `⚠️ Skipping parameterized path: ${op.method} ${op.path}` });
        continue;
      }

      const url = `${cleanProxyUrl}/api${op.path}`;
      console.log(`[Generator] Requesting: ${op.method} ${url}`);
      count++;

      try {
        await this.sendRequest(op.method, url, timeout, headers);
        onProgress({
          message: `[${count}/${filteredOperations.length}] 🚀 HIT: ${op.method} ${op.path}`,
        });
        // Small delay to prevent overwhelming the server
        await new Promise((r) => setTimeout(r, delay));
      } catch (err) {
        onProgress({ message: `❌ FAIL: ${op.method} ${op.path} - ${err.message}` });
      }
    }

    onProgress({ message: '✅ Traffic generation complete!' });
    return true;
  }

  checkConnection(url) {
    return new Promise((resolve) => {
      if (!url) resolve(true);

      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, (res) => {
        res.resume();
        resolve(true);
      });

      req.on('error', () => resolve(false));

      req.setTimeout(5000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  sendRequest(method, url, timeout = 5000, headers = {}) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const urlObj = new URL(url);

      const requestOptions = {
        method: method,
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent': 'Traffic-Mirror-Bot',
          ...headers
        },
        timeout: timeout
      };

      const req = client.request(requestOptions, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', (e) => reject(e));

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out after ${timeout}ms`));
      });

      // End the request (important for non-GET methods if we aren't writing body)
      req.end();
    });
  }
}

module.exports = new TrafficGenerator();
