/* eslint-disable no-console */
const replayer = require('../replayer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

jest.mock('axios');
jest.mock('fs');
jest.mock('readline', () => {
    return {
        createInterface: jest.fn().mockReturnValue({
            [Symbol.asyncIterator]: async function* () {
                yield JSON.stringify({ method: 'GET', url: '/api/test', status: 200 });
                yield JSON.stringify({ method: 'GET', url: '/api/test', status: 200 });
                yield JSON.stringify({ method: 'POST', url: '/api/users', status: 201, requestBody: '{}' });
                yield JSON.stringify({ method: 'POST', url: '/api/text', status: 200, requestBody: 'Plain text data' });
            }
        }),
    };
});

describe('Replayer', () => {
    const TEST_LOG = 'test.jsonl';
    const PRIMARY = 'http://localhost:8080';
    const SECONDARY = 'http://localhost:8081';
    const REPORT = 'report.html';

    beforeEach(() => {
        jest.clearAllMocks();
        fs.createReadStream.mockReturnValue({});
        fs.writeFileSync.mockImplementation(() => { });
    });

    test('should replay requests and detect match', async () => {
        axios.mockResolvedValue({ status: 200, data: { id: 1 } });

        const onEvent = jest.fn();
        await replayer(TEST_LOG, PRIMARY, SECONDARY, REPORT, [], {}, [], onEvent);

        expect(axios).toHaveBeenCalledTimes(8); // 4 requests * 2 environments
        expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'complete', passed: 4, failed: 0 }));
    });

    test('should detect mismatch', async () => {
        // Mock diff logic indirectly by checking results
        // First call (Primary) -> { id: 1 }
        // Second call (Secondary) -> { id: 2 }
        axios
            .mockResolvedValueOnce({ status: 200, data: { id: 1 } }) // Req 1 Primary
            .mockResolvedValueOnce({ status: 200, data: { id: 2 } }) // Req 1 Secondary
            .mockResolvedValue({ status: 200, data: {} }); // Rest

        const onEvent = jest.fn();
        await replayer(TEST_LOG, PRIMARY, SECONDARY, REPORT, [], {}, [], onEvent);

        expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'complete', passed: 3, failed: 1 }));
    });
});
