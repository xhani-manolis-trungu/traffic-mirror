/* eslint-disable no-console */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { diffJson } = require('diff');
require('colors');
const readline = require('readline');

async function replayAndDiff(logFile, primaryUrl, secondaryUrl, reportFile, ignoreFields = [], injectedHeaders = {}, excludeEndpoints = [], onEvent = () => { }, concurrency = 1) {
  console.log(`\n🔄 Replaying logs from: ${logFile}`);
  console.log(`🅰️  Primary:   ${primaryUrl}`);
  console.log(`🅱️  Secondary: ${secondaryUrl}`);
  console.log(`🚀 Concurrency: ${concurrency}`);

  const logs = [];
  const results = [];
  let passed = 0;
  let failed = 0;

  // 1. Read the JSONL file safely
  try {
    const fileStream = fs.createReadStream(logFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entry = JSON.parse(line);
          if (entry.status >= 200 && entry.status < 300) {
            logs.push(entry);
          }
        } catch (e) {
          console.warn("⚠️ Skipping malformed log line".yellow);
        }
      }
    }
  } catch (e) {
    console.error(`❌ Failed to read log file: ${e.message}`.red);
    onEvent({ type: 'error', message: `Failed to read log file: ${e.message}` });
    return;
  }

  console.log(`📊 Loaded ${logs.length} valid requests to replay.`.cyan);
  onEvent({ type: 'start', total: logs.length });

  // 2. Iterate and Replay with Concurrency
  const processLog = async (entry, index) => {
    const endpoint = entry.url;

    // SKIP LOGIC
    if (excludeEndpoints.includes(endpoint)) {
      console.log(`⏩ Skipping excluded endpoint: ${endpoint}`.gray);
      return null;
    }

    console.log(`\n[${index + 1}/${logs.length}] ${entry.method} ${endpoint}`.bold);

    const headers = {
      ...injectedHeaders,
      'Content-Type': 'application/json',
      'User-Agent': 'Traffic-Replayer/1.0'
    };

    const config = {
      method: entry.method,
      headers: headers,
      data: entry.requestBody ? JSON.parse(entry.requestBody) : undefined,
      validateStatus: () => true
    };

    try {
      const start1 = Date.now();
      const res1 = await axios({ ...config, url: `${primaryUrl}${endpoint}` });
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      const res2 = await axios({ ...config, url: `${secondaryUrl}${endpoint}` });
      const time2 = Date.now() - start2;

      const cleanBody1 = clean(res1.data, ignoreFields);
      const cleanBody2 = clean(res2.data, ignoreFields);

      const differences = diffJson(cleanBody1, cleanBody2);
      const hasDiff = differences.length > 1;

      const isSuccess = !hasDiff && res1.status === res2.status;

      if (isSuccess) {
        console.log(`✅ MATCH (${res1.status})`.green);
        passed++;
      } else {
        console.log(`❌ MISMATCH`.red);
        failed++;
      }

      const resultEntry = {
        id: index + 1,
        method: entry.method,
        url: endpoint,
        status1: res1.status,
        status2: res2.status,
        time1,
        time2,
        diff: hasDiff ? differences : null,
        match: isSuccess
      };

      results.push(resultEntry);
      onEvent({ type: 'progress', current: index + 1, total: logs.length, result: resultEntry });
      return resultEntry;

    } catch (err) {
      console.error(`💥 Error replaying ${endpoint}: ${err.message}`.red);
      onEvent({ type: 'error', message: `Error on ${endpoint}: ${err.message}` });
      return null;
    }
  };

  // Queue mechanism: Process logic in chunks based on concurrency
  for (let i = 0; i < logs.length; i += concurrency) {
    const batch = logs.slice(i, i + concurrency);
    // Map batch to promises
    await Promise.all(batch.map((log, idx) => processLog(log, i + idx)));
  }

  generateReport(results, reportFile, primaryUrl, secondaryUrl);

  console.log(`\n🏁 Replay Complete. passed: ${passed}, failed: ${failed}`.bold);

  onEvent({ type: 'complete', passed, failed, report: reportFile, results: results });
}

function clean(obj, ignoreList) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = JSON.parse(JSON.stringify(obj));
  const sanitize = (o) => {
    for (const key in o) {
      if (ignoreList.includes(key)) {
        delete o[key];
      } else if (typeof o[key] === 'object' && o[key] !== null) {
        sanitize(o[key]);
      }
    }
  };
  sanitize(copy);
  return copy;
}

function generateReport(results, filePath, url1, url2) {
  const fs = require('fs');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Traffic Replay Report</title>
        <style>
            body { font-family: sans-serif; padding: 20px; background: #f4f4f9; }
            h1 { text-align: center; }
            .summary { display: flex; justify-content: center; gap: 20px; margin-bottom: 20px; }
            .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .success { border-left: 5px solid #2ecc71; color: #2ecc71; }
            .failure { border-left: 5px solid #e74c3c; color: #e74c3c; }
            table { width: 100%; border-collapse: collapse; background: white; }
            th, td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
            th { background: #eee; }
            .diff-pre { background: #2d2d2d; color: #ccc; padding: 10px; border-radius: 4px; overflow-x: auto; }
            .diff-added { color: #2ecc71; }
            .diff-removed { color: #e74c3c; }
            tr.fail-row { background-color: #ffe6e6; }
        </style>
    </head>
    <body>
        <h1>🚦 Traffic Replay Report</h1>
        <div class="summary">
            <div class="card success">
                <h2>Passed</h2>
                <p>${results.filter(r => r.match).length}</p>
            </div>
            <div class="card failure">
                <h2>Failed</h2>
                <p>${results.filter(r => !r.match).length}</p>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Method</th>
                    <th>URL</th>
                    <th>Env 1 Status</th>
                    <th>Env 2 Status</th>
                    <th>Time (ms)</th>
                    <th>Result</th>
                </tr>
            </thead>
            <tbody>
                ${results.map(r => `
                    <tr class="${!r.match ? 'fail-row' : ''}">
                        <td>${r.method}</td>
                        <td>${r.url}</td>
                        <td>${r.status1}</td>
                        <td>${r.status2}</td>
                        <td>${r.time1} / ${r.time2}</td>
                        <td>${r.match ? '✅ Match' : '❌ Mismatch'}</td>
                    </tr>
                    ${!r.match && r.diff ? `
                    <tr>
                        <td colspan="6">
                            <pre class="diff-pre">${r.diff.map(d =>
    d.added ? `<span class="diff-added">+ ${d.value}</span>` :
      d.removed ? `<span class="diff-removed">- ${d.value}</span>` :
        `<span>  ${d.value}</span>`
  ).join('')}</pre>
                        </td>
                    </tr>
                    ` : ''}
                `).join('')}
            </tbody>
        </table>
    </body>
    </html>
    `;

  fs.writeFileSync(filePath, html);
  console.log(`📄 Report saved to ${filePath}`.green);
}

module.exports = replayAndDiff;
