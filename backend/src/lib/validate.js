/**
 * Cac ham validation dung chung cho cac route CRUD/interactions/history.
 * Tra ve ket qua normalized hoac nem Error voi { status, code, message }.
 */

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ID_REGEX = /^[A-Za-z][A-Za-z0-9_-]*$/;

export const MAX_NAME_LEN = 200;
export const MAX_DESCRIPTION_LEN = 2000;
export const MAX_EMAIL_LEN = 254;
export const MAX_PASSWORD_LEN = 256;
export const MIN_PASSWORD_LEN = 8;
export const MAX_ID_LEN = 64;
export const MAX_EVENT_ID_LEN = 128;
export const MAX_URL_LEN = 2048;
export const MAX_PRICE = 1_000_000_000_000; // 1k ty VND, tran Number.MAX_SAFE_INTEGER
export const MIN_PRICE = 0;
export const MAX_QUANTITY = 1000;
export const MIN_QUANTITY = 1;
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 50;

export class ValidationError extends Error {
  constructor(message, code = 'INVALID_INPUT') {
    super(message);
    this.status = 400;
    this.code = code;
  }
}

export class ConflictError extends Error {
  constructor(message, code = 'CONFLICT') {
    super(message);
    this.status = 409;
    this.code = code;
  }
}

export class NotFoundError extends Error {
  constructor(message, code = 'NOT_FOUND') {
    super(message);
    this.status = 404;
    this.code = code;
  }
}

export class ForbiddenError extends Error {
  constructor(message, code = 'FORBIDDEN') {
    super(message);
    this.status = 403;
    this.code = code;
  }
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email) throw new ValidationError('Email khong duoc de trong.');
  if (email.length > MAX_EMAIL_LEN) throw new ValidationError('Email qua dai.');
  if (!EMAIL_REGEX.test(email)) throw new ValidationError('Email khong hop le.');
  return email;
}

export function validatePassword(value, { min = MIN_PASSWORD_LEN, max = MAX_PASSWORD_LEN } = {}) {
  if (typeof value !== 'string') throw new ValidationError('Mat khau phai la chuoi.');
  if (value.length < min) throw new ValidationError(`Mat khau can it nhat ${min} ky tu.`);
  if (value.length > max) throw new ValidationError(`Mat khau khong qua ${max} ky tu.`);
  return value;
}

export function validateOptionalPassword(value) {
  if (value === undefined || value === null) return undefined;
  return validatePassword(value);
}

export function validateId(value, fieldName = 'id', { allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw new ValidationError(`${fieldName} phai la chuoi.`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (allowEmpty) return '';
    throw new ValidationError(`${fieldName} khong duoc de trong.`);
  }
  if (trimmed.length > MAX_ID_LEN) throw new ValidationError(`${fieldName} qua dai (max ${MAX_ID_LEN}).`);
  if (!ID_REGEX.test(trimmed)) {
    throw new ValidationError(`${fieldName} chi duoc chua chu, so, '-' va '_'.`);
  }
  return trimmed;
}

export function validateEventId(value) {
  if (typeof value !== 'string') throw new ValidationError('eventId phai la chuoi.');
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError('eventId khong duoc de trong.');
  if (trimmed.length > MAX_EVENT_ID_LEN) {
    throw new ValidationError(`eventId qua dai (max ${MAX_EVENT_ID_LEN}).`);
  }
  return trimmed;
}

export function validateName(value, fieldName = 'name') {
  if (typeof value !== 'string') throw new ValidationError(`${fieldName} phai la chuoi.`);
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${fieldName} khong duoc de trong.`);
  if (trimmed.length > MAX_NAME_LEN) {
    throw new ValidationError(`${fieldName} qua dai (max ${MAX_NAME_LEN}).`);
  }
  return trimmed;
}

export function validateDescription(value, { allowNull = true, max = MAX_DESCRIPTION_LEN } = {}) {
  if (value === null && allowNull) return null;
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError('description phai la chuoi hoac null.');
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ValidationError(`description qua dai (max ${max}).`);
  return trimmed;
}

export function validateImageUrl(value, { allowNull = true, max = MAX_URL_LEN } = {}) {
  if (value === null && allowNull) return null;
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError('imageUrl phai la chuoi hoac null.');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new ValidationError(`imageUrl qua dai (max ${max}).`);
  if (!/^(\/|https?:\/\/)/i.test(trimmed)) {
    throw new ValidationError('imageUrl phai bat dau bang "/" hoac "http(s)://".');
  }
  return trimmed;
}

export function validatePrice(value, { allowNull = false } = {}) {
  if (value === null && allowNull) return null;
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError('price phai la so.');
  }
  if (!Number.isInteger(value)) {
    throw new ValidationError('price phai la so nguyen VND.');
  }
  if (value < MIN_PRICE || value > MAX_PRICE) {
    throw new ValidationError(`price phai trong [${MIN_PRICE}, ${MAX_PRICE}].`);
  }
  return value;
}

export function validatePriceRequired(value) {
  const v = validatePrice(value, { allowNull: false });
  if (v === undefined) throw new ValidationError('price la bat buoc.');
  return v;
}

export function validateQuantity(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ValidationError('quantity phai la so nguyen.');
  }
  if (value < MIN_QUANTITY || value > MAX_QUANTITY) {
    throw new ValidationError(`quantity phai trong [${MIN_QUANTITY}, ${MAX_QUANTITY}].`);
  }
  return value;
}

export function validateBoolean(value, fieldName = 'value') {
  if (typeof value !== 'boolean') throw new ValidationError(`${fieldName} phai la boolean.`);
  return value;
}

export function validatePage(value, { defaultValue = DEFAULT_PAGE, max = MAX_PAGE_SIZE * 1000 } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) throw new ValidationError('page phai la so nguyen duong.');
    value = Number.parseInt(value, 10);
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw new ValidationError(`page phai trong [1, ${max}].`);
  }
  return value;
}

export function validatePageSize(value, { defaultValue = DEFAULT_PAGE_SIZE } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) throw new ValidationError('pageSize phai la so nguyen duong.');
    value = Number.parseInt(value, 10);
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new ValidationError(`pageSize phai trong [1, ${MAX_PAGE_SIZE}].`);
  }
  return value;
}

export function validateHistoryType(value) {
  if (value === undefined || value === null || value === '' || value === 'all') return 'all';
  if (value !== 'bought' && value !== 'viewed') {
    throw new ValidationError('type phai la bought, viewed hoac all.');
  }
  return value;
}

/**
 * Dam bao body chi chua cac key trong whitelist. Tra ve object voi cac key do.
 * Neu co key ngoai whitelist, throw ValidationError.
 */
export function pickAllowed(body, allowed, { allowEmpty = false } = {}) {
  if (body === null || body === undefined) {
    if (allowEmpty) return {};
    throw new ValidationError('Body khong duoc de trong.');
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Body phai la object JSON.');
  }
  const picked = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      picked[k] = body[k];
    }
  }
  for (const k of Object.keys(body)) {
    if (!allowed.includes(k)) {
      throw new ValidationError(`Truong "${k}" khong thuoc hop dong.`);
    }
  }
  return picked;
}
