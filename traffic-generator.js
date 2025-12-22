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
  async run(proxyUrl, swaggerPath, exclude = [], onProgress = () => { }, sourceUrl) {
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
    const getEndpoints = paths.filter((p) => doc.paths[p].get);

    onProgress({
      message: `🔍 Found ${getEndpoints.length} GET endpoints. Applying filters...`,
    });

    const rawExclude = Array.isArray(exclude) ? exclude : [exclude];
    const cleanExclude = rawExclude.map((e) => (e ? e.trim() : '')).filter((e) => e !== '');

    const validEndpoints = getEndpoints.filter((endpoint) => {
      if (cleanExclude.includes(endpoint)) return false;
      const isExcluded = cleanExclude.some((excludedItem) => {
        return excludedItem.endsWith(endpoint) || endpoint.endsWith(excludedItem);
      });
      if (isExcluded) return false;
      return true;
    });

    onProgress({
      message: `⚡ Generating traffic for ${validEndpoints.length
        } endpoints (Skipped ${getEndpoints.length - validEndpoints.length})`,
    });

    // Ensure we send traffic to the PROXY
    const cleanProxyUrl = proxyUrl.replace(/\/$/, '');
    let count = 0;

    for (const endpoint of validEndpoints) {
      // Skip parameterized endpoints like /users/{id} for now as we can't guess IDs
      if (endpoint.includes('{')) {
        onProgress({ message: `⚠️ Skipping parameterized path: ${endpoint}` });
        continue;
      }

      const url = `${cleanProxyUrl}/api${endpoint}`;
      console.log(`[Generator] Requesting: ${url}`);
      count++;

      try {
        await this.sendRequest(url);
        onProgress({
          message: `[${count}/${validEndpoints.length}] 🚀 HIT: ${endpoint}`,
        });
        // Small delay to prevent overwhelming the server
        await new Promise((r) => setTimeout(r, 50));
      } catch (err) {
        onProgress({ message: `❌ FAIL: ${endpoint} - ${err.message}` });
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

  sendRequest(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { headers: { 'User-Agent': 'Traffic-Mirror-Bot' } }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', (e) => reject(e));
    });
  }
}

module.exports = new TrafficGenerator();
