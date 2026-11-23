// ecosystem.config.cjs
// PM2 Process Manager Configuration for Missive SEO Intelligence Platform.
// Splits Web API cluster from standalone BullMQ background workers.

module.exports = {
  apps: [
    {
      name: 'missive-api',
      script: './src/server.js',
      cwd: './backend',
      instances: 'max', // Scales across all available CPU cores
      exec_mode: 'cluster',
      env_file: '/etc/missive/seo-intelligence.env',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      max_memory_restart: '1G',
      kill_timeout: 5000,
      listen_timeout: 8000,
      error_file: '/var/log/missive-seo/api-error.log',
      out_file: '/var/log/missive-seo/api-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'missive-workers',
      script: './src/workers/index.js',
      cwd: './backend',
      instances: 1, // Workers run in fork mode to prevent race conditions on queue jobs
      exec_mode: 'fork',
      env_file: '/etc/missive/seo-intelligence.env',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '2G',
      kill_timeout: 30000, // 30s grace period for in-progress report rendering and sync jobs
      error_file: '/var/log/missive-seo/workers-error.log',
      out_file: '/var/log/missive-seo/workers-out.log',
      time: true,
    },
  ],
};
