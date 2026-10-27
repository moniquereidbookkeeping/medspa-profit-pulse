import test from 'node:test';
import assert from 'node:assert/strict';
import { emailProblem, suggestEmail, isThrowawayEmail } from './emailCheck.ts';

test('plain-language problems for common mistakes', () => {
  assert.match(emailProblem('')!, /enter your email/);
  assert.match(emailProblem('jane.gmail.com')!, /@ sign/);
  assert.match(emailProblem('jane@')!, /after the @/);
  assert.match(emailProblem('@gmail.com')!, /before the @/);
  assert.match(emailProblem('jane@gmail')!, /\.com/);
  assert.match(emailProblem('jane @gmail.com')!, /spaces/);
  assert.match(emailProblem('jane@@gmail.com')!, /one @/);
  assert.match(emailProblem('jane@gmail..com')!, /dot/);
  assert.equal(emailProblem('jane@glowspa.com'), null);
  assert.equal(emailProblem('  jane+x@glow-spa.co.uk '), null);
});

test('suggests a fix for common domain and ending typos, and stays quiet otherwise', () => {
  assert.equal(suggestEmail('jane@gmial.com'), 'jane@gmail.com');
  assert.equal(suggestEmail('jane@gmail.con'), 'jane@gmail.com');
  assert.equal(suggestEmail('Jane@Hotmial.com'), 'Jane@hotmail.com');
  assert.equal(suggestEmail('jane@glowspa.con'), 'jane@glowspa.com');
  assert.equal(suggestEmail('jane@glowspa.com'), null);
  assert.equal(suggestEmail('jane@gmail.com'), null);
  assert.equal(suggestEmail('not an email'), null);
});

test('flags throw-away and placeholder addresses but not real business or personal ones', () => {
  for (const bad of ['x@mailinator.com', 'jane@YOPMAIL.com', 'test@test.com', 'asdf@asdf.com', 'me@example.com', 'none@none.com']) assert.equal(isThrowawayEmail(bad), true, bad);
  for (const ok of ['jane@glowspa.com', 'paul@gmail.com', 'testing.lab@bigclinic.com', 'dr.test@hotmail.com', 'info@medspa-test-kitchen.com']) assert.equal(isThrowawayEmail(ok), false, ok);
});
