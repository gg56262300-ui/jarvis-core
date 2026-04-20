import { logger } from '../../shared/logger/logger.js';

import { appendFailedMakeRecord } from './make-webhook-failed.store.js';

export type MakeWebhookPayload = Record<string, unknown>;

const MAX_MAKE_WEBHOOK_ATTEMPTS = 3;

export type MakeFailureKind =
  | 'network_or_timeout'
  | 'queue_full'
  | 'rate_limited'
  | 'upstream_5xx'
  | 'not_found_or_gone'
  | 'bad_request'
  | 'unknown';

export function classifyMakeFailure(
  status: number,
  errorBody: string,
): { retryable: boolean; kind: MakeFailureKind; recommendation: string } {
  const lower = errorBody.toLowerCase();
  const queueFull =
    lower.includes('queue is full') || lower.includes('queue full') || lower.includes('webhook queue');

  if (status === 0 || status === 408) {
    return {
      retryable: true,
      kind: 'network_or_timeout',
      recommendation: 'Ajutine ühenduse või timeout probleem; proovi uuesti.',
    };
  }
  if (status === 429) {
    return {
      retryable: true,
      kind: 'rate_limited',
      recommendation: 'Make rate limit; vähenda sagedust või oota ja proovi uuesti.',
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      retryable: true,
      kind: 'upstream_5xx',
      recommendation: 'Make serveri ajutine viga; proovi uuesti.',
    };
  }
  if (status === 400 && queueFull) {
    return {
      retryable: true,
      kind: 'queue_full',
      recommendation: 'Make queue on täis; puhasta incomplete executions ja kontrolli limiite.',
    };
  }
  if (status === 404 || status === 410) {
    return {
      retryable: false,
      kind: 'not_found_or_gone',
      recommendation: 'Webhook URL puudub või on aegunud; kontrolli MAKE_WEBHOOK_URL.',
    };
  }
  if (status >= 400 && status <= 499) {
    return {
      retryable: false,
      kind: 'bad_request',
      recommendation: 'Kontrolli payloadi ja Make stsenaariumi filtri/routeri tingimusi.',
    };
  }
  return {
    retryable: false,
    kind: 'unknown',
    recommendation: 'Tundmatu vastus; kontrolli Make history logi.',
  };
}

/** Make võib anda 400 koos «Queue is full» — ajutine järjekord, mitte vale päring. */
function isRetryableMakeFailure(status: number, errorBody: string): boolean {
  return classifyMakeFailure(status, errorBody).retryable;
}

function backoffMsAfterAttempt(attemptIndex: number): number {
  return 400 * Math.pow(2, attemptIndex);
}

function computeRetryPolicy(status: number, errorBody: string): { maxAttempts: number; waitMs: number } {
  const classified = classifyMakeFailure(status, errorBody);
  if (classified.kind === 'queue_full') {
    // Queue-full puhul lisakatsed suurendavad survet; piirdume ühe lisakatsega.
    return { maxAttempts: 2, waitMs: 2_000 };
  }
  return { maxAttempts: MAX_MAKE_WEBHOOK_ATTEMPTS, waitMs: -1 };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * POST to Make with a stable envelope: `{ source: "jarvis", ...rest }`.
 * Retries transient failures (network, 5xx, 408, 429) with backoff; does not retry 404/410/4xx.
 */
export async function sendJarvisMakePayload(
  url: string,
  rest: Record<string, unknown>,
): Promise<
  | { ok: true; status: number }
  | { ok: false; status: number; error: string }
> {
  const body: MakeWebhookPayload = {
    source: 'jarvis',
    ...rest,
  };

  logger.info(
    { operation: 'make.webhook.jarvis', event: typeof rest.event === 'string' ? rest.event : undefined },
    'Jarvis → Make payload',
  );

  let result = await sendMakeWebhook(url, body);

  for (let attempt = 1; attempt < MAX_MAKE_WEBHOOK_ATTEMPTS; attempt++) {
    if (result.ok || !isRetryableMakeFailure(result.status, result.error)) break;
    const policy = computeRetryPolicy(result.status, result.error);
    if (attempt >= policy.maxAttempts) break;
    const waitMs = policy.waitMs >= 0 ? policy.waitMs : backoffMsAfterAttempt(attempt - 1);
    logger.info(
      {
        operation: 'make.webhook.retry',
        attempt,
        waitMs,
        lastStatus: result.status,
        failureKind: classifyMakeFailure(result.status, result.error).kind,
      },
      'Make webhook retry',
    );
    await sleep(waitMs);
    result = await sendMakeWebhook(url, body);
  }

  if (!result.ok) {
    const classified = classifyMakeFailure(result.status, result.error);
    appendFailedMakeRecord({
      at: new Date().toISOString(),
      payload: body,
      upstreamStatus: result.status,
      error: result.error,
      retryable: classified.retryable,
      failureKind: classified.kind,
      recommendation: classified.recommendation,
    });
  }

  return result;
}

const WEBHOOK_TIMEOUT_MS = 15_000;

export async function sendMakeWebhook(
  url: string,
  body: MakeWebhookPayload,
): Promise<
  | { ok: true; status: number }
  | { ok: false; status: number; error: string }
> {
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startedAt;

    logger.info(
      {
        operation: 'make.webhook',
        status: response.status,
        durationMs,
      },
      'Make webhook HTTP response',
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        status: response.status,
        error: text.slice(0, 500),
      };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);

    logger.warn(
      {
        err: error,
        operation: 'make.webhook',
        durationMs,
      },
      'Make webhook request failed',
    );

    return { ok: false, status: 0, error: message };
  }
}
