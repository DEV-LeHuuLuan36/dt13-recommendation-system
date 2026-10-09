import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, isValidPassword } from '../src/password.js';

test('hashPassword returns scrypt$N$r$p$... format', async () => {
  const hash = await hashPassword('mat-khau-123');
  assert.equal(hash.split('$')[0], 'scrypt');
  assert.equal(hash.split('$').length, 6);
});

test('hashPassword uses a fresh salt each call (same input -> different hashes)', async () => {
  const a = await hashPassword('mat-khau-123');
  const b = await hashPassword('mat-khau-123');
  assert.notEqual(a, b);
  // Both hashes must still verify.
  assert.equal(await verifyPassword('mat-khau-123', a), true);
  assert.equal(await verifyPassword('mat-khau-123', b), true);
});

test('verifyPassword returns false for a wrong password', async () => {
  const hash = await hashPassword('dung-roi');
  assert.equal(await verifyPassword('sai-roi', hash), false);
});

test('verifyPassword returns false for malformed hashes', async () => {
  assert.equal(await verifyPassword('abc', 'not-a-hash'), false);
  assert.equal(await verifyPassword('abc', ''), false);
  assert.equal(await verifyPassword('abc', 'scrypt$abc$def$ghi$xx$yy'), false);
  assert.equal(await verifyPassword('abc', 'scrypt$abc$def$0$xx$yy'), false);
  assert.equal(await verifyPassword('abc', 'plain$1$2$3$BBBBBB$cccc'), false);
});

test('verifyPassword returns false for empty / non-string passwords', async () => {
  const hash = await hashPassword('dung-roi');
  assert.equal(await verifyPassword('', hash), false);
  assert.equal(await verifyPassword(null, hash), false);
  assert.equal(await verifyPassword(undefined, hash), false);
  assert.equal(await verifyPassword(123, hash), false);
});

test('isValidPassword accepts strings of length 1..256', () => {
  assert.equal(isValidPassword('a'), true);
  assert.equal(isValidPassword('a'.repeat(256)), true);
  assert.equal(isValidPassword(''), false);
  assert.equal(isValidPassword('a'.repeat(257)), false);
  assert.equal(isValidPassword(null), false);
  assert.equal(isValidPassword(123), false);
});

test('hashPassword rejects invalid passwords', async () => {
  await assert.rejects(hashPassword(''), /Invalid password/);
  await assert.rejects(hashPassword('a'.repeat(257)));
  await assert.rejects(hashPassword(null));
});
