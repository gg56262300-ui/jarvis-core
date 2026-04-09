import { describe, expect, it } from 'vitest';
import { parseReminderCommand } from '../src/voice/reminder-command.parser.js';

describe('reminder command parser', () => {
  it('parses command starting with homme kell', () => {
    const result = parseReminderCommand('lisa meeldetuletus homme kell 18 test reminder');

    expect(result.title).toBe('test reminder');
    expect(result.dueAtParseFailed).toBe(false);
    expect(result.dueAt).toBeTruthy();
  });

  it('parses command ending with homme kell', () => {
    const result = parseReminderCommand('lisa meeldetuletus test reminder homme kell 18');

    expect(result.title).toBe('test reminder');
    expect(result.dueAtParseFailed).toBe(false);
    expect(result.dueAt).toBeTruthy();
  });

  it('handles hommikul correctly', () => {
    const result = parseReminderCommand('lisa meeldetuletus homme hommikul kell kuus test reminder');

    expect(result.title).toBe('test reminder');
    expect(result.dueAtParseFailed).toBe(false);
    expect(result.dueAt).toBeTruthy();
  });

  it('returns plain title when no due time exists', () => {
    const result = parseReminderCommand('lisa meeldetuletus test reminder');

    expect(result.title).toBe('test reminder');
    expect(result.dueAtParseFailed).toBe(false);
    expect(result.dueAt).toBeUndefined();
  });

  it('does not crash on incomplete command', () => {
    const result = parseReminderCommand('lisa meeldetuletus homme kell 18');

    expect(result.title).toBe('homme kell 18');
    expect(result.dueAtParseFailed).toBe(false);
  });
});
