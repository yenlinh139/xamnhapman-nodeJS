module.exports = {
  apps: [
    {
      name: 'fastify-api',
      script: './src/server.js',
      instances: 1, // For Raspberry Pi, start with 1 instance
      exec_mode: 'fork', // Use fork mode for better stability on Raspberry Pi
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Auto restart configuration
      max_memory_restart: '1G', // Restart if memory usage exceeds 1GB
      watch: false, // Disable watch in production
      ignore_watch: ['node_modules', 'logs'],
      
      // Raspberry Pi optimizations
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Environment file
      env_file: '.env',
      
      // Restart strategy
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
