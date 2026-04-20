import { describe, expect, it } from 'vitest';

import { classifyMakeFailure } from '../src/integrations/make/make-webhook.client.js';
import { JARVIS_MAKE_EVENTS } from '../src/integrations/make/make-events.js';

describe('classifyMakeFailure', () => {
  it('treats 0 and 408 as retryable network/timeout', () => {
    expect(classifyMakeFailure(0, '')).toMatchObject({ retryable: true, kind: 'network_or_timeout' });
    expect(classifyMakeFailure(408, '')).toMatchObject({ retryable: true, kind: 'network_or_timeout' });
  });

  it('treats 429 as rate limited', () => {
    expect(classifyMakeFailure(429, '')).toMatchObject({ retryable: true, kind: 'rate_limited' });
  });

  it('treats 5xx as upstream retry', () => {
    expect(classifyMakeFailure(500, '')).toMatchObject({ retryable: true, kind: 'upstream_5xx' });
    expect(classifyMakeFailure(503, 'timeout')).toMatchObject({ retryable: true, kind: 'upstream_5xx' });
  });

  it('treats 400 + queue full as retryable queue_full', () => {
    expect(classifyMakeFailure(400, 'Queue is full')).toMatchObject({
      retryable: true,
      kind: 'queue_full',
    });
    expect(classifyMakeFailure(400, 'webhook queue full')).toMatchObject({
      retryable: true,
      kind: 'queue_full',
    });
  });

  it('treats 404/410 as not retryable', () => {
    expect(classifyMakeFailure(404, '')).toMatchObject({ retryable: false, kind: 'not_found_or_gone' });
    expect(classifyMakeFailure(410, '')).toMatchObject({ retryable: false, kind: 'not_found_or_gone' });
  });

  it('treats other 4xx as bad_request', () => {
    expect(classifyMakeFailure(400, 'invalid json')).toMatchObject({
      retryable: false,
      kind: 'bad_request',
    });
    expect(classifyMakeFailure(403, 'forbidden')).toMatchObject({
      retryable: false,
      kind: 'bad_request',
    });
  });

  it('falls back to unknown for unexpected 2xx-adjacent codes', () => {
    expect(classifyMakeFailure(600, '')).toMatchObject({ retryable: false, kind: 'unknown' });
  });
});

describe('JARVIS_MAKE_EVENTS', () => {
  it('matches MAKE_CONTRACT v1 event names', () => {
    expect(JARVIS_MAKE_EVENTS.REMINDER_SET).toBe('reminder.set');
    expect(JARVIS_MAKE_EVENTS.CALENDAR_CREATE).toBe('calendar.create');
    expect(JARVIS_MAKE_EVENTS.CALENDAR_QUERY).toBe('calendar.query');
  });
});
