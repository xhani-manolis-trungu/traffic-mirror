const generator = require('../traffic-generator');
const fs = require('fs');

jest.mock('http');
jest.mock('https');
jest.mock('fs');

describe('TrafficGenerator', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock fs.existsSync and fs.readFileSync for swagger
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify({
            paths: {
                '/test': { get: {}, post: {} },
                '/users': { get: {} }
            }
        }));
    });

    test('should run with default configuration', async () => {
        // Spy on methods
        const checkConnectionSpy = jest.spyOn(generator, 'checkConnection').mockResolvedValue(true);
        const sendRequestSpy = jest.spyOn(generator, 'sendRequest').mockResolvedValue();

        const config = {
            target: 'http://localhost:3000',
            file: 'swagger.json',
            source: 'http://localhost:1337',
        };

        await generator.run(config);

        // Should call checkConnection for proxy and source
        expect(checkConnectionSpy).toHaveBeenCalledTimes(2);
        // Should default to method GET only, so 2 calls (/test, /users)
        expect(sendRequestSpy).toHaveBeenCalledTimes(2);
        expect(sendRequestSpy).toHaveBeenCalledWith('GET', expect.stringContaining('/test'), expect.any(Number), expect.any(Object));
    });

    test('should filter by methods', async () => {
        const checkConnectionSpy = jest.spyOn(generator, 'checkConnection').mockResolvedValue(true);
        const sendRequestSpy = jest.spyOn(generator, 'sendRequest').mockResolvedValue();

        const config = {
            target: 'http://localhost:3000',
            file: 'swagger.json',
            methods: ['POST']
        };

        await generator.run(config);

        // Should only hit the POST endpoint (/test)
        expect(sendRequestSpy).toHaveBeenCalledTimes(1);
        expect(sendRequestSpy).toHaveBeenCalledWith('POST', expect.stringContaining('/test'), expect.any(Number), expect.any(Object));
    });

    test('should handle health check failure', async () => {
        jest.spyOn(generator, 'checkConnection').mockResolvedValue(false);
        const config = { target: 'http://fail.com', file: 's.json' };

        await expect(generator.run(config)).rejects.toThrow('Proxy is unreachable');
    });
});
