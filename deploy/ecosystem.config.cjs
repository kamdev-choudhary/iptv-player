// Loaded by ubuntu's pm2 — see deploy/README.md.
//
//   pm2 start  /srv/tuner/deploy/ecosystem.config.cjs
//   pm2 reload tuner-api --update-env
module.exports = {
  apps: [
    {
      name: 'tuner-api',
      cwd: '/srv/tuner',
      script: 'apps/api/dist/index.js',
      interpreter: '/usr/bin/node',
      // The production bundle has no dotenv in it — in development `tsx` reads
      // the file. Node's own loader does the same job here, so the secrets stay
      // in one place and the application needs no loader of its own.
      node_args: '--env-file-if-exists=/srv/tuner/.env',
      exec_mode: 'fork',
      instances: 1,
      // These override anything of the same name in .env, which is what makes
      // them the deployment's decision rather than the file's.
      env: {
        NODE_ENV: 'production',
        // Five digits, one per service on this box: vayu 12992, pixo 12993.
        PORT: 12994,
        HOST: '127.0.0.1',
        // nginx serves apps/web/dist directly; node has no business doing it.
        SERVE_WEB: 'false',
        // Same origin behind nginx, so there is no cross-origin request to allow.
        CORS_ORIGIN: 'https://tv.quartix.in',
        // The nightly sync and the probe sweep run inside this process.
        RUN_JOBS: 'true',
        MIGRATE_ON_BOOT: 'true',
        LOG_LEVEL: 'info',
        // Video arrives faster than it can be forgotten, and this box runs
        // four other services. Cap what one busy evening can take.
        PROXY_MAX_CONCURRENT: 60,
      },
      autorestart: true,
      restart_delay: 3000,
      // A viewer mid-segment is a real person. index.ts drains for up to 9s;
      // pm2's default SIGKILLs at 1.6s, which would cut them off.
      kill_timeout: 15000,
      max_memory_restart: '600M',
      // The proxy holds long-lived responses, so a slow boot is not a hang.
      listen_timeout: 20000,
    },
  ],
}
