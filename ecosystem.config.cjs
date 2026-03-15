module.exports = {
  apps: [{
    name: 'aiox-monitor',
    script: 'npm',
    args: 'run start',
    env: {
      NODE_ENV: 'production',
      PORT: 8888,
    },
    max_restarts: 50,
    min_uptime: 5000,
    restart_delay: 3000,
    exp_backoff_restart_delay: 1000,
    out_file: './logs/aiox-monitor-out.log',
    error_file: './logs/aiox-monitor-err.log',
    merge_logs: true,
    time: true,
  }],
};
