import fs from 'node:fs/promises';
import path from 'node:path';
import { undoLastCalendarAction } from '../calendar/calendarUndo.service.js';
import { randomUUID } from 'node:crypto';
import { Router, type Express } from 'express';

const router = Router();

async function writeTerminalState(cwd: string, state: unknown) {
  const logsDir = path.join(cwd, 'logs');
  const statePath = path.join(logsDir, 'terminal-state.json');
  const prevStatePath = path.join(logsDir, 'terminal-state-prev.json');
  await fs.mkdir(logsDir, { recursive: true });

  try {
    await fs.copyFile(statePath, prevStatePath);
  } catch {
    // ignore missing previous state
  }

  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}



async function restoreTerminalFiles(cwd: string) {
  const logsDir = path.join(cwd, 'logs');
  const statePath = path.join(logsDir, 'terminal-state.json');
  const prevStatePath = path.join(logsDir, 'terminal-state-prev.json');
  const lastJsonPath = path.join(logsDir, 'terminal-last.json');
  const prevJsonPath = path.join(logsDir, 'terminal-prev.json');
  const lastTxtPath = path.join(logsDir, 'terminal-last.txt');
  const prevTxtPath = path.join(logsDir, 'terminal-prev.txt');

  const exists = async (filePath: string) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  };

  const canRestore =
    (await exists(prevStatePath)) &&
    (await exists(prevJsonPath));

  if (!canRestore) {
    return {
      ok: false,
      error: 'ROLLBACK_PREV_MISSING',
    };
  }

  if (await exists(prevStatePath)) await fs.copyFile(prevStatePath, statePath);
  if (await exists(prevJsonPath)) await fs.copyFile(prevJsonPath, lastJsonPath);
  if (await exists(prevTxtPath)) await fs.copyFile(prevTxtPath, lastTxtPath);

  const restoredAt = new Date().toISOString();

  let state: unknown;
  let lastCapture: unknown;

  try {
    state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch {
    state = null;
  }

  try {
    lastCapture = JSON.parse(await fs.readFile(lastJsonPath, 'utf8'));
  } catch {
    lastCapture = null;
  }

  await fs.writeFile(
    statePath,
    JSON.stringify(
      {
        ok: true,
        stage: 'rollback_restore',
        status: 'completed',
        restoredAt,
        restoredFrom: 'prev',
        state,
        lastCapture,
      },
      null,
      2,
    ),
    'utf8',
  );

  return {
    ok: true,
    restored: true,
    restoredAt,
    restoredFrom: 'prev',
    state,
    lastCapture,
  };
}


async function writeExecutionState(cwd: string, payload: unknown) {
  const logsDir = path.join(cwd, 'logs');
  const statePath = path.join(logsDir, 'execution-state.json');
  const prevPath = path.join(logsDir, 'execution-state-prev.json');
  await fs.mkdir(logsDir, { recursive: true });

  try {
    await fs.copyFile(statePath, prevPath);
  } catch {
    // ignore missing previous execution state
  }

  await fs.writeFile(statePath, JSON.stringify(payload, null, 2), 'utf8');
}


async function readJsonFileSafe(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readLastLines(filePath: string, maxLines = 60) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    return lines.slice(-maxLines).join('\n');
  } catch {
    return '';
  }
}

router.get('/logs', async (_req, res) => {
  const cwd = process.cwd();

  const backendPath = path.join(cwd, 'logs', 'jarvis-backend.log');
  const watcherPath = path.join(cwd, 'logs', 'jarvis-watcher.log');

  const backend = await readLastLines(backendPath, 120);
  const watcher = await readLastLines(watcherPath, 200);

  res.json({
    ok: true,
    backendPath,
    watcherPath,
    backend,
    watcher,
  });
});

router.get('/logs/text', async (_req, res) => {
  const cwd = process.cwd();

  const backendPath = path.join(cwd, 'logs', 'jarvis-backend.log');
  const watcherPath = path.join(cwd, 'logs', 'jarvis-watcher.log');

  const backendRaw = await readLastLines(backendPath, 15);
  const watcherRaw = await readLastLines(watcherPath, 12);

  const ansiCsiPattern = new RegExp(String.raw`\\x1B\\[[0-?]*[ -/]*[@-~]`, 'g');

  const clean = (value: string) =>
    value
      .replaceAll('\u001bc', '')
      .replace(ansiCsiPattern, '')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .join('\n')
      .trim();

  const backend = clean(backendRaw);
  const watcher = clean(watcherRaw);

  res.type('text/plain; charset=utf-8').send(
`===== BACKEND LOGI =====
${backend || '(tühi)'}

===== WATCHER LOGI =====
${watcher || '(tühi)'}
`
  );
});

router.get('/terminal-last', async (_req, res) => {
  const cwd = process.cwd();
  const terminalPath = path.join(cwd, 'logs', 'terminal-last.txt');

  try {
    const content = await fs.readFile(terminalPath, 'utf8');
    res.type('text/plain; charset=utf-8').send(content || '(tühi)');
  } catch {
    res.type('text/plain; charset=utf-8').send('(terminal capture puudub)');
  }
});

router.get('/terminal-last/json', async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  const cwd = process.cwd();
  const terminalJsonPath = path.join(cwd, 'logs', 'terminal-last.json');

  try {
    const content = await fs.readFile(terminalJsonPath, 'utf8');
    res.type('application/json; charset=utf-8').send(content || '{}');
  } catch {
    res.json({
      ok: false,
      message: 'terminal capture puudub',
    });
  }
});

router.get('/calendar-last-action/exists', async (_req, res) => {
  const journalPath = path.resolve(process.cwd(), 'data/calendar-last-action.json');

  let exists = true;
  try {
    await fs.access(journalPath);
  } catch {
    exists = false;
  }

  res.json({
    ok: true,
    path: journalPath,
    exists,
  });
});

router.get('/bridge/latest', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  const cwd = process.cwd();
  const expectedToken = process.env.JARVIS_BRIDGE_TOKEN?.trim();
  const providedToken =
    String(req.headers['x-jarvis-bridge-token'] ?? '').trim() ||
    String(req.query.token ?? '').trim();

  if (!expectedToken) {
    res.status(503).json({
      ok: false,
      error: 'BRIDGE_TOKEN_NOT_CONFIGURED',
    });
    return;
  }

  if (!providedToken || providedToken !== expectedToken) {
    res.status(401).json({
      ok: false,
      error: 'BRIDGE_UNAUTHORIZED',
    });
    return;
  }

  const terminalJsonPath = path.join(cwd, 'logs', 'terminal-last.json');
  const pendingPath = path.join(cwd, 'logs', 'terminal-pending.json');

  let latest: unknown;
  let pending: Record<string, unknown> | null;

  try {
    latest = JSON.parse(await fs.readFile(terminalJsonPath, 'utf8'));
  } catch {
    latest = null;
  }

  try {
    pending = JSON.parse(await fs.readFile(pendingPath, 'utf8'));
  } catch {
    pending = null;
  }

  res.json({
    ok: true,
    bridge: 'jarvis-latest',
    latest,
    pending,
  });
});


router.post('/bridge/calendar-undo-last', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');

  const expectedToken = process.env.JARVIS_BRIDGE_TOKEN?.trim();
  const providedToken =
    String(req.headers['x-jarvis-bridge-token'] ?? '').trim() ||
    String(req.query.token ?? '').trim();

  if (!expectedToken) {
    res.status(503).json({
      ok: false,
      error: 'BRIDGE_TOKEN_NOT_CONFIGURED',
    });
    return;
  }

  if (!providedToken || providedToken !== expectedToken) {
    res.status(401).json({
      ok: false,
      error: 'BRIDGE_UNAUTHORIZED',
    });
    return;
  }

  const result = await undoLastCalendarAction();

  res.status(200).json({
    ok: result.status === 'undone',
    bridge: 'jarvis-calendar-undo-last',
    data: result,
  });
});


router.post('/bridge/calendar-write', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');

  const expectedToken = process.env.JARVIS_BRIDGE_TOKEN?.trim();
  const providedToken =
    String(req.headers['x-jarvis-bridge-token'] ?? '').trim() ||
    String(req.query.token ?? '').trim();

  if (!expectedToken) {
    res.status(503).json({
      ok: false,
      error: 'BRIDGE_TOKEN_NOT_CONFIGURED',
    });
    return;
  }

  if (!providedToken || providedToken !== expectedToken) {
    res.status(401).json({
      ok: false,
      error: 'BRIDGE_UNAUTHORIZED',
    });
    return;
  }

  const text = String(req.body?.text ?? '').trim();

  if (!text) {
    res.status(400).json({
      ok: false,
      error: 'BRIDGE_TEXT_REQUIRED',
    });
    return;
  }

  const upstream = await fetch('http://localhost:3000/api/voice/turns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      locale: 'et-EE',
      inputMode: 'text',
      outputMode: 'text',
    }),
  });

  const data = await upstream.json().catch(() => ({
    ok: false,
    error: 'BRIDGE_UPSTREAM_INVALID_JSON',
  }));

  res.status(upstream.status).json({
    ok: upstream.ok,
    bridge: 'jarvis-calendar-write',
    data,
  });
});

const allowedCommands = {
  pwd: {
    label: 'Näita aktiivne kaust',
    command: 'pwd',
    mode: 'read_only',
    risk: 'low',
    area: 'system',
    requiresConfirmation: false,
  },
  health: {
    label: 'Kontrolli health endpointi',
    command: 'curl -s http://localhost:3000/health',
    mode: 'read_only',
    risk: 'low',
    area: 'health',
    requiresConfirmation: false,
  },
  pm2_status_jarvis: {
    label: 'Näita PM2 Jarvise staatust',
    command: 'pm2 status jarvis',
    mode: 'read_only',
    risk: 'low',
    area: 'process',
    requiresConfirmation: false,
  },
  status_summary: {
    label: 'Küsi Jarvise staatuse kokkuvõtet',
    command: 'curl -s -X POST http://localhost:3000/api/voice/turns -H "Content-Type: application/json" -d \'{"text":"kontrolli jarvise seisu","locale":"et-EE","inputMode":"text","outputMode":"text"}\'',
    mode: 'read_only',
    risk: 'low',
    area: 'assistant',
    requiresConfirmation: false,
  },
  debug_logs_text: {
    label: 'Näita debug logisid tekstina',
    command: 'curl -s http://localhost:3000/api/debug/logs/text',
    mode: 'read_only',
    risk: 'low',
    area: 'debug',
    requiresConfirmation: false,
  },
  terminal_last_json: {
    label: 'Näita viimast terminali JSON capture’it',
    command: 'curl -s http://localhost:3000/api/debug/terminal-last/json',
    mode: 'read_only',
    risk: 'low',
    area: 'debug',
    requiresConfirmation: false,
  },
  jarvis_snapshot: {
    label: 'Näita Jarvise kiiret snapshot kokkuvõtet',
    command: 'printf "===== HEALTH =====\\n"; curl -s http://localhost:3000/health; printf "\\n\\n===== STATUS =====\\n"; curl -s -X POST http://localhost:3000/api/voice/turns -H "Content-Type: application/json" -d \'{"text":"kontrolli jarvise seisu","locale":"et-EE","inputMode":"text","outputMode":"text"}\'; printf "\\n\\n===== PM2 =====\\n"; pm2 status jarvis',
    mode: 'read_only',
    risk: 'low',
    area: 'ops',
    requiresConfirmation: false,
  },
  jarvis_logs_quick: {
    label: 'Näita Jarvise kiirlogid',
    command: 'printf "===== DEBUG LOGS TEXT =====\\n"; curl -s http://localhost:3000/api/debug/logs/text',
    mode: 'read_only',
    risk: 'low',
    area: 'debug',
    requiresConfirmation: false,
  },
  crm_leads_quick: {
    label: 'Näita CRM leadide kiiret seisu',
    command: 'printf "===== CRM LEADS =====\\n"; curl -s http://localhost:3000/api/crm/leads',
    mode: 'read_only',
    risk: 'low',
    area: 'crm',
    requiresConfirmation: false,
  },
  control_summary: {
    label: 'Näita Jarvise control summary',
    command: 'curl -s http://localhost:3000/api/debug/control-summary',
    mode: 'read_only',
    risk: 'low',
    area: 'ops',
    requiresConfirmation: false,
  },
  control_summary_compact: {
    label: 'Näita Jarvise compact control summary',
    command: 'curl -s http://localhost:3000/api/debug/control-summary-compact',
    mode: 'read_only',
    risk: 'low',
    area: 'ops',
    requiresConfirmation: false,
  },
  terminal_restore_check: {
    label: 'Näita rollback current vs prev seisu',
    command: 'curl -s http://localhost:3000/api/debug/terminal-restore-check',
    mode: 'read_only',
    risk: 'low',
    area: 'rollback',
    requiresConfirmation: false,
  },
  terminal_restore_check_compact: {
    label: 'Näita rollback compact current vs prev seisu',
    command: 'curl -s http://localhost:3000/api/debug/terminal-restore-check-compact',
    mode: 'read_only',
    risk: 'low',
    area: 'rollback',
    requiresConfirmation: false,
  },
  calendar_write_test: {
    label: 'Lisa test-sündmus kalendrisse läbi Jarvise local voice flow',
    command: 'curl -s -X POST http://localhost:3000/api/voice/turns -H "Content-Type: application/json" -d \'{"text":"lisa kalendrisse homme kell 16 kuni 17 BRIDGE CAL TEST","locale":"et-EE","inputMode":"text","outputMode":"text"}\'',
    mode: 'write',
    risk: 'medium',
    area: 'calendar',
    requiresConfirmation: true,
  },
  terminal_restore_prev_confirm: {
    label: 'Taasta terminali eelmine seis',
    command: 'curl -s -X POST http://localhost:3000/api/debug/terminal-restore-prev',
    mode: 'write',
    risk: 'medium',
    area: 'rollback',
    requiresConfirmation: true,
  },
  execution_state_compact: {
    label: 'Näita execution compact seisu',
    command: 'curl -s http://localhost:3000/api/debug/execution-state-compact',
    mode: 'read_only',
    risk: 'low',
    area: 'execution',
    requiresConfirmation: false,
  },
  pwd_confirm: {
    label: 'Näita aktiivne kaust kinnitusega',
    command: 'pwd',
    mode: 'read_only',
    risk: 'low',
    area: 'system',
    requiresConfirmation: true,
  },
} as const;

router.get('/terminal-allowed', (_req, res) => {
  res.json({
    ok: true,
    allowed: Object.entries(allowedCommands).map(([id, value]) => ({
      id,
      label: value.label,
      command: value.command,
      mode: value.mode,
      risk: value.risk,
      area: value.area,
      requiresConfirmation: value.requiresConfirmation,
    })),
  });
});

router.get('/terminal-preview/:id', (req, res) => {
  const id = String(req.params.id ?? '').trim() as keyof typeof allowedCommands;
  const item = allowedCommands[id];

  if (!item) {
    res.status(404).json({
      ok: false,
      error: 'TERMINAL_PREVIEW_NOT_ALLOWED',
      id,
    });
    return;
  }

  res.json({
    ok: true,
    id,
    label: item.label,
    command: item.command,
    mode: item.mode,
    risk: item.risk,
    area: item.area,
    requiresConfirmation: item.requiresConfirmation,
  });
});

router.post('/terminal-request/:id', async (req, res) => {
  const cwd = process.cwd();
  const id = String(req.params.id ?? '').trim() as keyof typeof allowedCommands;
  const item = allowedCommands[id];

  if (!item) {
    res.status(404).json({
      ok: false,
      error: 'TERMINAL_REQUEST_NOT_ALLOWED',
      id,
    });
    return;
  }

  const pendingPath = path.join(cwd, 'logs', 'terminal-pending.json');
  const pending = {
    ok: true,
    requestId: randomUUID(),
    id,
    label: item.label,
    command: item.command,
    mode: item.mode,
    risk: item.risk,
    area: item.area,
    requiresConfirmation: item.requiresConfirmation,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await fs.mkdir(path.join(cwd, 'logs'), { recursive: true });
  await fs.writeFile(pendingPath, JSON.stringify(pending, null, 2), 'utf8');
  await writeTerminalState(cwd, {
    ok: true,
    stage: 'requested',
    requestId: pending.requestId,
    id,
    label: item.label,
    mode: item.mode,
    risk: item.risk,
    area: item.area,
    requiresConfirmation: item.requiresConfirmation,
    status: 'pending',
    updatedAt: new Date().toISOString(),
  });

  res.json(pending);
});

router.get('/terminal-pending', async (_req, res) => {
  const cwd = process.cwd();
  const pendingPath = path.join(cwd, 'logs', 'terminal-pending.json');

  try {
    const content = await fs.readFile(pendingPath, 'utf8');
    res.type('application/json; charset=utf-8').send(content);
  } catch {
    res.json({
      ok: false,
      status: 'empty',
      message: 'pending command puudub',
    });
  }
});

router.post('/terminal-confirm/:requestId', async (req, res) => {
  const cwd = process.cwd();
  const pendingPath = path.join(cwd, 'logs', 'terminal-pending.json');
  const { execFile } = await import('node:child_process');

  let pendingRaw: string;
  try {
    pendingRaw = await fs.readFile(pendingPath, 'utf8');
  } catch {
    res.status(404).json({
      ok: false,
      error: 'TERMINAL_PENDING_NOT_FOUND',
    });
    return;
  }

  let pending: Record<string, unknown> | null;
  try {
    pending = JSON.parse(pendingRaw);
  } catch {
    res.status(400).json({
      ok: false,
      error: 'TERMINAL_PENDING_INVALID',
    });
    return;
  }

  const requestId = String(req.params.requestId ?? '').trim();
  if (!pending?.requestId || pending.requestId !== requestId) {
    res.status(400).json({
      ok: false,
      error: 'TERMINAL_CONFIRM_ID_MISMATCH',
      requestId,
    });
    return;
  }

  const id = String(pending.id ?? '').trim();

  await writeTerminalState(cwd, {
    ok: true,
    stage: 'confirmed',
    requestId,
    id,
    status: 'running',
    updatedAt: new Date().toISOString(),
  });

  execFile(
    path.join(cwd, 'scripts', 'terminal-safe-run.sh'),
    [id],
    { cwd, timeout: 20000 },
    async (error, stdout, stderr) => {
      const terminalJsonPath = path.join(cwd, 'logs', 'terminal-last.json');

      let lastCapture: unknown;
      try {
        const content = await fs.readFile(terminalJsonPath, 'utf8');
        lastCapture = JSON.parse(content);
      } catch {
        lastCapture = null;
      }

      await fs.rm(pendingPath, { force: true });

      if (error) {
        await writeTerminalState(cwd, {
          ok: false,
          stage: 'confirmed',
          requestId,
          id,
          status: 'failed',
          error: error.message,
          updatedAt: new Date().toISOString(),
          lastCapture,
        });

        res.status(400).json({
          ok: false,
          requestId,
          id,
          error: error.message,
          stdout,
          stderr,
          lastCapture,
        });
        return;
      }

      await writeTerminalState(cwd, {
        ok: true,
        stage: 'confirmed',
        requestId,
        id,
        status: 'completed',
        updatedAt: new Date().toISOString(),
        lastCapture,
      });

      res.json({
        ok: true,
        requestId,
        id,
        stdout,
        stderr,
        lastCapture,
      });
    },
  );
});

router.post('/terminal-run/:id', async (req, res) => {
  const cwd = process.cwd();
  const { execFile } = await import('node:child_process');

  const id = String(req.params.id ?? '').trim() as keyof typeof allowedCommands;
  const item = allowedCommands[id];

  if (!item) {
    res.status(404).json({
      ok: false,
      error: 'TERMINAL_RUN_NOT_ALLOWED',
      id,
    });
    return;
  }

  if (item.requiresConfirmation) {
    res.status(400).json({
      ok: false,
      error: 'TERMINAL_RUN_CONFIRMATION_REQUIRED',
      id,
      requiresConfirmation: true,
      policy: {
        mode: item.mode,
        risk: item.risk,
        area: item.area,
        requiresConfirmation: item.requiresConfirmation,
      },
    });
    return;
  }

  execFile(
    path.join(cwd, 'scripts', 'terminal-safe-run.sh'),
    [id],
    { cwd, timeout: 20000 },
    async (error, stdout, stderr) => {
      const terminalJsonPath = path.join(cwd, 'logs', 'terminal-last.json');

      let lastCapture: unknown;

      try {
        const content = await fs.readFile(terminalJsonPath, 'utf8');
        lastCapture = JSON.parse(content);
      } catch {
        lastCapture = null;
      }

      if (error) {
        await writeTerminalState(cwd, {
          ok: false,
          stage: 'direct_run',
          id,
          status: 'failed',
          error: error.message,
          updatedAt: new Date().toISOString(),
          lastCapture,
        });

        res.status(400).json({
          ok: false,
          id,
          error: error.message,
          stdout,
          stderr,
          lastCapture,
          policy: {
            mode: item.mode,
            risk: item.risk,
            area: item.area,
            requiresConfirmation: item.requiresConfirmation,
          },
        });
        return;
      }

      await writeTerminalState(cwd, {
        ok: true,
        stage: 'direct_run',
        id,
        status: 'completed',
        updatedAt: new Date().toISOString(),
        lastCapture,
      });

      res.json({
        ok: true,
        id,
        stdout,
        stderr,
        lastCapture,
        policy: {
          mode: item.mode,
          risk: item.risk,
          area: item.area,
          requiresConfirmation: item.requiresConfirmation,
        },
      });
    },
  );
});


router.post('/terminal-restore-prev', async (_req, res) => {
  const cwd = process.cwd();
  const result = await restoreTerminalFiles(cwd);

  if (!result.ok) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

router.get('/terminal-restore-check', async (_req, res) => {
  const cwd = process.cwd();
  const logsDir = path.join(cwd, 'logs');

  const readJson = async (name: string) => {
    try {
      return JSON.parse(await fs.readFile(path.join(logsDir, name), 'utf8'));
    } catch {
      return null;
    }
  };

  res.json({
    ok: true,
    currentState: await readJson('terminal-state.json'),
    prevState: await readJson('terminal-state-prev.json'),
    currentLast: await readJson('terminal-last.json'),
    prevLast: await readJson('terminal-prev.json'),
  });
});



router.get('/terminal-restore-check-compact', async (_req, res) => {
  const cwd = process.cwd();
  const logsDir = path.join(cwd, 'logs');

  const readJson = async (name: string) => {
    try {
      return JSON.parse(await fs.readFile(path.join(logsDir, name), 'utf8'));
    } catch {
      return null;
    }
  };

  const currentState = await readJson('terminal-state.json');
  const prevState = await readJson('terminal-state-prev.json');
  const currentLast = await readJson('terminal-last.json');
  const prevLast = await readJson('terminal-prev.json');

  res.json({
    ok: true,
    summary: {
      currentStage: currentState?.stage ?? null,
      currentStatus: currentState?.status ?? null,
      currentId: currentState?.id ?? null,
      currentCmd: currentLast?.cmd ?? currentState?.lastCapture?.cmd ?? null,
      currentExitCode: currentLast?.exit_code ?? currentState?.lastCapture?.exit_code ?? null,
      prevStage: prevState?.stage ?? null,
      prevStatus: prevState?.status ?? null,
      prevId: prevState?.id ?? null,
      prevCmd: prevLast?.cmd ?? prevState?.lastCapture?.cmd ?? null,
      prevExitCode: prevLast?.exit_code ?? prevState?.lastCapture?.exit_code ?? null,
    },
  });
});

router.post('/execution/start', async (req, res) => {
  const cwd = process.cwd();
  const executionId = randomUUID();
  const totalSteps = Number(req.body?.totalSteps ?? 0) || 0;
  const label = String(req.body?.label ?? 'manual-flow').trim() || 'manual-flow';

  const payload = {
    ok: true,
    executionId,
    label,
    status: 'running',
    stepIndex: 0,
    totalSteps,
    updatedAt: new Date().toISOString(),
  };

  await writeExecutionState(cwd, payload);
  res.json(payload);
});

router.post('/execution/step', async (req, res) => {
  const cwd = process.cwd();
  const logsDir = path.join(cwd, 'logs');
  const statePath = path.join(logsDir, 'execution-state.json');

  let current: Record<string, unknown> | null;
  try {
    current = JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch {
    res.status(404).json({ ok: false, error: 'EXECUTION_STATE_MISSING' });
    return;
  }

  const stepIndex = Number(req.body?.stepIndex ?? current?.stepIndex ?? 0);
  const stepLabel = String(req.body?.stepLabel ?? '').trim();
  const stepStatus = String(req.body?.stepStatus ?? 'completed').trim() || 'completed';

  const payload = {
    ...current,
    stepIndex,
    stepLabel,
    stepStatus,
    updatedAt: new Date().toISOString(),
  };

  await writeExecutionState(cwd, payload);
  res.json(payload);
});

router.post('/execution/complete', async (req, res) => {
  const cwd = process.cwd();
  const logsDir = path.join(cwd, 'logs');
  const statePath = path.join(logsDir, 'execution-state.json');

  let current: Record<string, unknown> | null;
  try {
    current = JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch {
    res.status(404).json({ ok: false, error: 'EXECUTION_STATE_MISSING' });
    return;
  }

  const totalSteps = Number(current?.totalSteps ?? 0) || 0;
  const finalStepIndex =
    totalSteps > 0 ? totalSteps : Number(current?.stepIndex ?? 0) || 0;

  const finalStepLabel =
    String(req.body?.stepLabel ?? '').trim() ||
    String(current?.stepLabel ?? '').trim() ||
    'flow complete';

  const payload = {
    ...current,
    status: 'completed',
    stepIndex: finalStepIndex,
    stepLabel: finalStepLabel,
    stepStatus: 'completed',
    updatedAt: new Date().toISOString(),
  };

  await writeExecutionState(cwd, payload);
  res.json(payload);
});


router.get('/execution-state-compact', async (_req, res) => {
  const cwd = process.cwd();
  const logsDir = path.join(cwd, 'logs');
  const statePath = path.join(logsDir, 'execution-state.json');
  const prevPath = path.join(logsDir, 'execution-state-prev.json');

  const readJson = async (filePath: string) => {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      return null;
    }
  };

  const current = await readJson(statePath);
  const prev = await readJson(prevPath);

  res.json({
    ok: true,
    summary: {
      currentExecutionId: current?.executionId ?? null,
      currentLabel: current?.label ?? null,
      currentStatus: current?.status ?? null,
      currentStepIndex: current?.stepIndex ?? null,
      currentTotalSteps: current?.totalSteps ?? null,
      currentStepLabel: current?.stepLabel ?? null,
      currentStepStatus: current?.stepStatus ?? null,
      prevExecutionId: prev?.executionId ?? null,
      prevLabel: prev?.label ?? null,
      prevStatus: prev?.status ?? null,
      prevStepIndex: prev?.stepIndex ?? null,
      prevTotalSteps: prev?.totalSteps ?? null,
      prevStepLabel: prev?.stepLabel ?? null,
      prevStepStatus: prev?.stepStatus ?? null,
    },
  });
});

router.get('/execution/state', async (_req, res) => {
  const cwd = process.cwd();
  const logsDir = path.join(cwd, 'logs');
  const statePath = path.join(logsDir, 'execution-state.json');
  const prevPath = path.join(logsDir, 'execution-state-prev.json');

  const readJson = async (filePath: string) => {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      return null;
    }
  };

  res.json({
    ok: true,
    current: await readJson(statePath),
    prev: await readJson(prevPath),
  });
});



router.get('/control-summary', async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');

  const cwd = process.cwd();
  const logsDir = path.join(cwd, 'logs');

  const terminalState = await readJsonFileSafe(path.join(logsDir, 'terminal-state.json'));
  const executionStatePath = path.join(logsDir, 'execution-state.json');
  const executionPrevPath = path.join(logsDir, 'execution-state-prev.json');
  const pending = await readJsonFileSafe(path.join(logsDir, 'terminal-pending.json'));
  const currentLast = await readJsonFileSafe(path.join(logsDir, 'terminal-last.json'));
  const prevLast = await readJsonFileSafe(path.join(logsDir, 'terminal-prev.json'));

  let executionCurrent: Record<string, unknown> | null;
  let executionPrev: unknown;

  try {
    executionCurrent = JSON.parse(await fs.readFile(executionStatePath, 'utf8'));
  } catch {
    executionCurrent = null;
  }

  try {
    executionPrev = JSON.parse(await fs.readFile(executionPrevPath, 'utf8'));
  } catch {
    executionPrev = null;
  }

  res.json({
    ok: true,
    summary: {
      cwd,
      terminalState,
      executionCurrent,
      executionPrev,
      pending,
      currentLast,
      prevLast,
    },
  });
});



router.get('/control-summary-compact', async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');

  const cwd = process.cwd();
  const logsDir = path.join(cwd, 'logs');

  const terminalState = await readJsonFileSafe(path.join(logsDir, 'terminal-state.json'));
  const pending = await readJsonFileSafe(path.join(logsDir, 'terminal-pending.json'));
  const currentLast = await readJsonFileSafe(path.join(logsDir, 'terminal-last.json'));

  let executionCurrent: Record<string, unknown> | null;
  try {
    executionCurrent = JSON.parse(await fs.readFile(path.join(logsDir, 'execution-state.json'), 'utf8'));
  } catch {
    executionCurrent = null;
  }

  const pendingCommand = pending?.command ?? null;
  const currentCommand = currentLast?.cmd ?? null;
  const pendingCreatedAt = pending?.createdAt ?? null;
  const currentTime = currentLast?.time ?? null;

  const normalizeTime = (value: string | null) => {
    if (!value) return null;
    const isoLike = value.includes('T') ? value : value.replace(' ', 'T');
    const ms = Date.parse(isoLike);
    return Number.isNaN(ms) ? null : ms;
  };

  const pendingCreatedAtMs = normalizeTime(pendingCreatedAt);
  const currentTimeMs = normalizeTime(currentTime);

  const captureMatchesPending = Boolean(
    currentCommand &&
    pendingCommand &&
    currentCommand === pendingCommand &&
    currentTimeMs !== null &&
    pendingCreatedAtMs !== null &&
    currentTimeMs >= pendingCreatedAtMs
  );

  const useFreshCapture = Boolean(currentCommand) && (!pending || captureMatchesPending);

  const derivedTerminalStage = useFreshCapture
    ? 'direct_run'
    : terminalState?.stage ?? null;
  const derivedTerminalStatus = useFreshCapture
    ? ((currentLast?.exit_code ?? 1) === 0 ? 'completed' : 'failed')
    : terminalState?.status ?? null;
  const derivedTerminalUpdatedAt = useFreshCapture
    ? currentLast?.time ?? terminalState?.updatedAt ?? null
    : terminalState?.updatedAt ?? null;
  const derivedTerminalCommand = useFreshCapture
    ? currentCommand ?? null
    : terminalState?.lastCapture?.cmd ?? currentLast?.cmd ?? null;

  res.json({
    ok: true,
    summary: {
      cwd,
      terminalStage: derivedTerminalStage,
      terminalStatus: derivedTerminalStatus,
      terminalUpdatedAt: derivedTerminalUpdatedAt,
      terminalCommand: derivedTerminalCommand,
      executionStatus: executionCurrent?.status ?? null,
      executionStep: executionCurrent?.stepIndex ?? null,
      executionTotalSteps: executionCurrent?.totalSteps ?? null,
      pendingId: pending?.id ?? null,
      pendingRequestId: pending?.requestId ?? null,
      pendingStatus: pending?.status ?? null,
      currentPwd: currentLast?.pwd ?? null,
      currentExitCode: currentLast?.exit_code ?? null,
    },
  });
});


export const registerDebugRoutes = (app: Express) => {
  app.get('/debug/sentry-test', (_request, _response) => {
    void _request;
    void _response;
    throw new Error('Sentry test error from Jarvis');
  });
  app.use('/api/debug', router);
};



router.get('/chatgpt-readonly-context', async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');

  const cwd = process.cwd();
  const logsDir = path.join(cwd, 'logs');

  const currentState = await readJsonFileSafe(path.join(logsDir, 'terminal-state.json'));
  const prevState = await readJsonFileSafe(path.join(logsDir, 'terminal-state-prev.json'));
  const currentLast = await readJsonFileSafe(path.join(logsDir, 'terminal-last.json'));
  const prevLast = await readJsonFileSafe(path.join(logsDir, 'terminal-prev.json'));
  const pending = await readJsonFileSafe(path.join(logsDir, 'terminal-pending.json'));

  const allowed = Object.entries(allowedCommands).map(([id, value]) => ({
    id,
    label: value.label,
    mode: value.mode,
    risk: value.risk,
    area: value.area,
    requiresConfirmation: value.requiresConfirmation,
  }));

  res.json({
    ok: true,
    context: 'chatgpt-readonly',
    cwd,
    currentState,
    prevState,
    currentLast,
    prevLast,
    pending,
    allowed,
  });
});

router.get('/terminal-state', async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  const cwd = process.cwd();
  const statePath = path.join(cwd, 'logs', 'terminal-state.json');

  try {
    const content = await fs.readFile(statePath, 'utf8');
    res.type('application/json; charset=utf-8').send(content);
  } catch {
    res.json({
      ok: false,
      status: 'empty',
      message: 'terminal state puudub',
    });
  }
});
