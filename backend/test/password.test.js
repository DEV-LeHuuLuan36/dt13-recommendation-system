import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, isValidPassword } from '../src/password.js';

test('hashPassword tra ve dinh dang scrypt$...', async () => {
  const hash = await hashPassword('mat-khau-123');
  assert.equal(hash.split('$')[0], 'scrypt');
  assert.equal(hash.split('$').length, 6);
});

test('hashPassword tao hash khac nhau cho cung mat khau (salt khac nhau)', async () => {
  const a = await hashPassword('mat-khau-123');
  const b = await hashPassword('mat-khau-123');
  assert.notEqual(a, b);
  // Verifier chap nhan ca hai
  assert.equal(await verifyPassword('mat-khau-123', a), true);
  assert.equal(await verifyPassword('mat-khau-123', b), true);
});

test('verifyPassword tra ve false voi mat khau sai', async () => {
  const hash = await hashPassword('dung-roi');
  assert.equal(await verifyPassword('sai-roi', hash), false);
});

test('verifyPassword tra ve false voi hash khong hop le', async () => {
  assert.equal(await verifyPassword('abc', 'not-a-hash'), false);
  assert.equal(await verifyPassword('abc', ''), false);
  assert.equal(await verifyPassword('abc', 'scrypt$abc$def$ghi$xx$yy'), false);
  assert.equal(await verifyPassword('abc', 'scrypt$abc$def$0$xx$yy'), false);
  assert.equal(await verifyPassword('abc', 'plain$1$2$3$BBBBBB$cccc'), false);
});

test('verifyPassword tra ve false voi mat khau rong hoac khong phai string', async () => {
  const hash = await hashPassword('dung-roi');
  assert.equal(await verifyPassword('', hash), false);
  assert.equal(await verifyPassword(null, hash), false);
  assert.equal(await verifyPassword(undefined, hash), false);
  assert.equal(await verifyPassword(123, hash), false);
});

test('isValidPassword chap nhan string 1..256 ky tu', () => {
  assert.equal(isValidPassword('a'), true);
  assert.equal(isValidPassword('a'.repeat(256)), true);
  assert.equal(isValidPassword(''), false);
  assert.equal(isValidPassword('a'.repeat(257)), false);
  assert.equal(isValidPassword(null), false);
  assert.equal(isValidPassword(123), false);
});

test('hashPassword reject mat khau khong hop le', async () => {
  await assert.rejects(hashPassword(''), /khong hop le/);
  await assert.rejects(hashPassword('a'.repeat(257)));
  await assert.rejects(hashPassword(null));
});