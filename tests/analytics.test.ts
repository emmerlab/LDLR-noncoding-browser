/**
 * tests/analytics.test.ts: GoatCounter hit paths and count URLs
 */
import { describe, expect, it } from 'vitest';
import { countUrl, hitPath, type Hit } from '../src/analytics';

describe('hit path', () => {
  it('prefixes the page with host and path', () => {
    expect(hitPath('viewer', { protocol: 'https:', host: 'emmerlab.org', pathname: '/ldlr-noncoding' }))
      .toBe('emmerlab.org/ldlr-noncoding#/viewer');
    expect(hitPath('help', { protocol: 'https:', host: 'emmerlab.github.io', pathname: '/LDLR-noncoding-browser/' }))
      .toBe('emmerlab.github.io/LDLR-noncoding-browser/#/help');
  });
  it('keeps the port for local servers', () => {
    expect(hitPath('viewer', { protocol: 'http:', host: 'localhost:4173', pathname: '/' }))
      .toBe('localhost:4173/#/viewer');
  });
  it('never reports a local file path', () => {
    expect(hitPath('viewer', { protocol: 'file:', host: '', pathname: '/C:/Users/someone/dist/index.html' }))
      .toBe('file#/viewer');
  });
});

describe('count url', () => {
  const hit: Hit = {
    path: 'emmerlab.org/ldlr-noncoding#/viewer',
    title: 'LDLR Locus Browser',
    referrer: 'https://www.biorxiv.org/',
    screen: '1920,1080,2',
    bot: false,
  };
  const endpoint = 'https://example.goatcounter.com/count';

  it('encodes every field as a GoatCounter parameter', () => {
    const url = new URL(countUrl(endpoint, hit, 'abc'));
    expect(url.origin + url.pathname).toBe(endpoint);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      p: hit.path, t: hit.title, r: hit.referrer, s: hit.screen, rnd: 'abc',
    });
  });
  it('flags automated browsers as bots', () => {
    const url = new URL(countUrl(endpoint, { ...hit, bot: true }, 'abc'));
    expect(url.searchParams.get('b')).toBe('153');
  });
});
