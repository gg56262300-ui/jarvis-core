import { logger } from '../../shared/logger/logger.js';

import { appendFailedMakeRecord } from './make-webhook-failed.store.js';

export type MakeWebhookPayload = Record<string, unknown>;

const MAX_MAKE_WEBHOOK_ATTEMPTS = 3;

function isRetryableMakeFailure(status: number): boolean {
  if (status === 0) {
    return true;
  }
  if (status === 408 || status === 429) {
    return true;
  }
  return status >= 500 && status <= 599;
}

function backoffMsAfterAttempt(attemptIndex: number): number {
  return 400 * Math.pow(2, attemptIndex);
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

  for (let attempt = 1; attempt < MAX_MAKE_WEBHOOK_ATTEMPTS && !result.ok && isRetryableMakeFailure(result.status); attempt++) {
    const waitMs = backoffMsAfterAttempt(attempt - 1);
    logger.info(
      { operation: 'make.webhook.retry', attempt, waitMs, lastStatus: result.status },
      'Make webhook retry',
    );
    await sleep(waitMs);
    result = await sendMakeWebhook(url, body);
  }

  if (!result.ok) {
    appendFailedMakeRecord({
      at: new Date().toISOString(),
      payload: body,
      upstreamStatus: result.status,
      error: result.error,
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
