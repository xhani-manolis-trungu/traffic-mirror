/* eslint-disable no-console */
const http = require('http');
const fs = require('fs');
const path = require('path');
const recorder = require('../recorder');

// Mock httpProxy
jest.mock('http-proxy', () => {
    return {
        createProxyServer: jest.fn().mockImplementation(() => ({
            on: jest.fn(),
            web: jest.fn((req, res) => {
                res.end('mocked response');
            }),
        })),
    };
});

describe('Recorder', () => {
    const TEST_PORT = 3999;
    const TEST_TARGET = 'http://localhost:8080';
    const TEST_FILE = path.join(__dirname, 'test_traffic.jsonl');

    afterEach(() => {
        recorder.stop();
        if (fs.existsSync(TEST_FILE)) {
            fs.unlinkSync(TEST_FILE);
        }
    });

    test('should start and stop server', (done) => {
        recorder.start(TEST_TARGET, TEST_PORT, TEST_FILE);

        // Check if server is listening
        const req = http.get(`http://localhost:${TEST_PORT}`, (res) => {
            // It might return 500 or proxy error because target is not real, but it should connect
            expect(res.statusCode).toBeDefined();
            recorder.stop();
            done();
        });

        req.on('error', (e) => {
            // If connection refused, it failed to start
            done(e);
        });
    });

    test('should throw if started twice', () => {
        recorder.start(TEST_TARGET, TEST_PORT, TEST_FILE);
        expect(() => {
            recorder.start(TEST_TARGET, TEST_PORT, TEST_FILE);
        }).toThrow('Recorder already running');
    });
});
