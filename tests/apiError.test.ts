import { describe, expect, it } from 'vitest';
import { apiErrorFor } from '@/lib/apiError';
import { BadUrlError } from '@/lib/url';
import { BlockedUrlError } from '@/lib/ssrf';
import { FetchPageError } from '@/lib/fetchPage';
import { CappedError, ThinPageError } from '@/lib/pipeline';

describe('apiErrorFor', () => {
  it('maps a bad URL to 400 bad_url and keeps its message', () => {
    expect(apiErrorFor(new BadUrlError('Enter a URL.'))).toEqual({
      code: 'bad_url',
      error: 'Enter a URL.',
      status: 400,
    });
  });

  it('maps a blocked host to 400 blocked', () => {
    expect(apiErrorFor(new BlockedUrlError('nope'))).toMatchObject({ code: 'blocked', status: 400 });
  });

  it('maps a fetch failure to 502 fetch', () => {
    expect(apiErrorFor(new FetchPageError('x'))).toMatchObject({ code: 'fetch', status: 502 });
  });

  it('maps a thin page to 422 thin', () => {
    expect(apiErrorFor(new ThinPageError())).toMatchObject({ code: 'thin', status: 422 });
  });

  it('maps the spend cap to 503 capped', () => {
    expect(apiErrorFor(new CappedError())).toMatchObject({ code: 'capped', status: 503 });
  });

  it('maps anything unknown to 502 llm and NEVER a 500', () => {
    for (const e of [new Error('boom'), 'a string', null, undefined, { weird: true }]) {
      const m = apiErrorFor(e);
      expect(m.code).toBe('llm');
      expect(m.status).toBe(502);
      expect(m.status).not.toBe(500);
      expect(typeof m.error).toBe('string');
    }
  });
});
