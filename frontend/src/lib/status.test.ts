import { describe, it, expect } from 'vitest';
import { statusMeta, toneClasses } from './status';

describe('statusMeta', () => {
  it('maps success to a success tone + label', () => {
    const m = statusMeta('success');
    expect(m.label).toBe('Success');
    expect(m.tone).toBe('success');
    expect(m.pill).toContain('text-success');
    expect(m.dot).toContain('bg-success');
  });

  it('maps already_applied to the info tone', () => {
    const m = statusMeta('already_applied');
    expect(m.label).toBe('Already Applied');
    expect(m.tone).toBe('info');
  });

  it('maps failed to the danger tone', () => {
    const m = statusMeta('failed');
    expect(m.label).toBe('Failed');
    expect(m.tone).toBe('danger');
  });

  it('is case-insensitive and trims', () => {
    expect(statusMeta('  SUCCESS  ').tone).toBe('success');
  });

  it('humanizes unknown statuses with a neutral tone', () => {
    const m = statusMeta('partial_match');
    expect(m.label).toBe('Partial Match');
    expect(m.tone).toBe('neutral');
  });

  it('falls back to an em dash for null/empty', () => {
    expect(statusMeta(null).label).toBe('—');
    expect(statusMeta(undefined).tone).toBe('neutral');
  });
});

describe('toneClasses', () => {
  it('returns the pill + dot classes for a tone', () => {
    const c = toneClasses('warn');
    expect(c.pill).toContain('text-warn-fg');
    expect(c.dot).toContain('bg-warn');
  });
});
