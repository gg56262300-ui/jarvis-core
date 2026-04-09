import { execSync } from 'node:child_process';

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function safeCurl(name, text) {
  const payload = JSON.stringify({
    text,
    locale: 'et-EE',
    source: 'text',
  }).replace(/"/g, '\\"');

  run(`echo "===== ${name} ====="`);
  run(`curl -s -X POST http://localhost:3000/api/voice/turns -H "Content-Type: application/json" -d "${payload}"`);
  run('echo');
}

run('echo "===== PM2 RESTART ====="');
run('pm2 restart jarvis');
run('sleep 2');

run('echo');
run('echo "===== SMOKE HEALTH ====="');
run('curl -s http://localhost:3000/health');
run('echo');
run('echo');

safeCurl('SMOKE CALENDAR NEXT', 'mis on minu järgmine kalendrisündmus');
safeCurl('SMOKE REMINDER SHOW', 'näita meeldetuletusi');
