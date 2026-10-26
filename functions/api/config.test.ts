import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from './config.ts';

const get = async (env: Record<string, string>) => (await onRequestGet({ env } as any).then(r => r.json())) as any;

test('config reveals the public site key only when BOTH Turnstile keys are set', async () => {
  assert.equal((await get({})).turnstileSiteKey, '');
  assert.equal((await get({ TURNSTILE_SITE_KEY: 'site' })).turnstileSiteKey, '');
  assert.equal((await get({ TURNSTILE_SECRET_KEY: 'secret' })).turnstileSiteKey, '');
  assert.equal((await get({ TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' })).turnstileSiteKey, 'site');
});

test('config never exposes the secret key', async () => {
  const body = JSON.stringify(await get({ TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'super-secret-value' }));
  assert.ok(!body.includes('super-secret-value'));
});
