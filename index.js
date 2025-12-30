#!/usr/bin/env node
/* eslint-disable no-console */
const { Command } = require('commander');
const fs = require('fs');
const yaml = require('js-yaml');
const recorder = require('./recorder');
const replayAndDiff = require('./replayer');
const startServer = require('./server');
const generator = require('./traffic-generator');

const program = new Command();

program
  .name('traffic-mirror')
  .description('Record and Replay HTTP traffic to detect regressions')
  .version('1.0.0');

// Command: Record
program
  .command('record')
  .description('Start a proxy to record traffic to a JSONL file')
  .requiredOption('-t, --target <url>', 'The target URL to proxy to (e.g., http://localhost:8080)')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .option('-o, --out <file>', 'Output file for logs', 'traffic.jsonl')
  .action((options) => {
    recorder.start(options.target, options.port, options.out);
  });

// Command: Replay
program
  .command('replay')
  .description('Replay logs against two environments and diff the results')
  .requiredOption('-l, --log <file>', 'The log file to replay')
  .requiredOption('-a, --primary <url>', 'Primary environment URL (e.g., Stable)')
  .requiredOption('-b, --secondary <url>', 'Secondary environment URL (e.g., Staging)')
  .option('-r, --report <file>', 'Path to save HTML report', 'report.html')
  .option('-i, --ignore <items>', 'Comma separated list of JSON fields to ignore', (val) =>
    val.split(',')
  )
  .option('-x, --exclude-endpoints <items>', 'List of URL paths to skip', (val) => val.split(',')) // <--- NEW FLAG
  .option('-c, --concurrency <number>', 'Number of concurrent requests', (val) => parseInt(val, 10), 5) // Default 5
  .option('--auth <token>', 'Inject Authorization header (e.g. "Bearer eyJhb...")')
  .action((options) => {
    const injectedHeaders = options.auth ? { Authorization: options.auth } : {};
    // Pass injectedHeaders to the replayer
    replayAndDiff(
      options.log,
      options.primary,
      options.secondary,
      options.report,
      options.ignore || [],
      injectedHeaders,
      options.excludeEndpoints || [],
      () => { }, // Empty callback for CLI
      options.concurrency || 1
    );
  });

program
  .command('ui')
  .description('Start the Web Interface')
  .option('-p, --port <number>', 'Port for the UI', '4200')
  .action((options) => {
    startServer(options.port);
  });

program
  .command('generate')
  .description('Auto-generate traffic from Swagger file using a configuration file')
  .option('-c, --config <path>', 'Path to YAML configuration file', 'config.yaml')
  .action(async (options) => {
    try {
      console.log('🚀 Starting Traffic Generation...');

      let config = {};
      if (options.config && fs.existsSync(options.config)) {
        console.log(`Loading configuration from ${options.config}...`);
        const raw = fs.readFileSync(options.config, 'utf8');
        config = yaml.load(raw);
      } else {
        throw new Error(`Configuration file not found at ${options.config}`);
      }

      await generator.run(
        config,
        (log) => {
          console.log(log.message);
        }
      );

      console.log('✅ Done.');
    } catch (e) {
      console.error('❌ Error:', e.message);
    }
  });

program.parse();
