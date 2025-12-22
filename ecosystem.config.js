module.exports = {
    apps: [
        {
            name: 'traffic-mirror-ui',
            script: './index.js',
            args: 'ui --port 4200',
            instances: 4, // Keep 1 instance to avoid port conflicts with the recorder
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'development',
            },
            env_production: {
                NODE_ENV: 'production',
            },
        },
    ],
};
