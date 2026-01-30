module.exports = {
  apps: [
    {
      name: 'app-backend',
      script: './app-backend/src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      error_file: './logs/app-backend-error.log',
      out_file: './logs/app-backend-out.log',
      log_file: './logs/app-backend-combined.log',
      time: true
    },
    {
      name: 'zoho-backend',
      script: './zoho-lead-backend/src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/zoho-backend-error.log',
      out_file: './logs/zoho-backend-out.log',
      log_file: './logs/zoho-backend-combined.log',
      time: true
    }
  ]
};
