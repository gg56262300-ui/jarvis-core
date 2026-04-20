/**
 * Kopeeri ecosystem.config.cjs ja muuda cwd.
 * Node laeb .env enne käivitamist (--env-file), et PM2 ei jätaks võtit „vanasse“ olekusse.
 */
module.exports = {
  apps: [
    {
      name: 'jarvis',
      cwd: '/ABSOLUTE/PATH/TO/jarvis-core',
      interpreter: 'none',
      script: 'node',
      args: '--env-file=.env --import ./dist/instrument.js dist/index.js',
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      min_uptime: '5s',
    },
  ],
};
