import { asyncHandler } from '../middleware/asyncHandler.js';
import { verifyPassword } from '../password.js';
import { QUERIES } from '../cypher/queries.js';

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LEN = 1;
const MAX_PASSWORD_LEN = 256;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function publicProfile(c) {
  const props = c.properties || c;
  return {
    customerId: props.customerId,
    name: props.name,
    email: props.email,
    role: props.role,
    active: props.active,
    createdAt: props.createdAt && props.createdAt.toString
      ? props.createdAt.toString()
      : props.createdAt,
  };
}

export function publicLogin(neo4jClient) {
  return asyncHandler(async (req, res) => {
    const { email, customerId, password } = req.body || {};
    let normalizedEmail = normalizeEmail(email);
    const normalizedCustomerId = typeof customerId === 'string' ? customerId.trim() : null;

    if (!normalizedEmail && !normalizedCustomerId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Vui long cung cap email hoac customerId.' },
      });
    }

    if (normalizedEmail && !EMAIL_REGEX.test(normalizedEmail)) {
      if (!normalizedCustomerId) {
        return res.status(400).json({
          error: { code: 'INVALID_INPUT', message: 'Email khong hop le.' },
        });
      }
      normalizedEmail = '';
    }

    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LEN || password.length > MAX_PASSWORD_LEN) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Mat khau khong hop le.' },
      });
    }
    if (!neo4jClient) {
      return res.status(503).json({
        error: { code: 'NEO4J_NOT_CONFIGURED', message: 'Backend chua ket noi CSDL.' },
      });
    }

    let result;
    if (normalizedCustomerId) {
      result = await neo4jClient.read(QUERIES.findCustomerById, { customerId: normalizedCustomerId });
      if (!result.records[0] && normalizedCustomerId.toUpperCase() !== normalizedCustomerId) {
        result = await neo4jClient.read(QUERIES.findCustomerById, { customerId: normalizedCustomerId.toUpperCase() });
      }
    } else {
      result = await neo4jClient.read(QUERIES.findCustomerByEmail, { email: normalizedEmail });
    }

    if (!result.records[0]) {
      return res.status(401).json({
        error: { code: 'AUTH_INVALID', message: 'Email hoac mat khau khong dung.' },
      });
    }
    const node = result.records[0].get('c');
    const props = node.properties;
    if (props.active === false) {
      return res.status(403).json({
        error: { code: 'ACCOUNT_INACTIVE', message: 'Tai khoan dang bi vo hieu hoa.' },
      });
    }
    const ok = await verifyPassword(password, props.passwordHash);
    if (!ok) {
      return res.status(401).json({
        error: { code: 'AUTH_INVALID', message: 'Email hoac mat khau khong dung.' },
      });
    }
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    req.session.customerId = props.customerId;
    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    return res.status(200).json({
      status: 'ok',
      profile: publicProfile(props),
    });
  });
}

export function publicLogout() {
  return asyncHandler(async (req, res) => {
    if (req.session) {
      await new Promise((resolve) => {
        req.session.destroy(() => resolve());
      });
    }
    res.clearCookie('dt13.sid');
    return res.status(204).end();
  });
}

export function guardedMe(neo4jClient) {
  return asyncHandler(async (req, res) => {
    if (!req.session || !req.session.customerId) {
      return res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Chua dang nhap.' },
      });
    }
    if (!neo4jClient) {
      return res.status(503).json({
        error: { code: 'NEO4J_NOT_CONFIGURED', message: 'Backend chua ket noi CSDL.' },
      });
    }
    const result = await neo4jClient.read(QUERIES.findCustomerById, {
      customerId: req.session.customerId,
    });
    if (!result.records[0]) {
      await new Promise((resolve) => {
        req.session.destroy(() => resolve());
      });
      res.clearCookie('dt13.sid');
      return res.status(401).json({
        error: { code: 'AUTH_REQUIRED', message: 'Tai khoan khong ton tai.' },
      });
    }
    const props = result.records[0].get('c').properties;
    if (props.active === false) {
      return res.status(403).json({
        error: { code: 'ACCOUNT_INACTIVE', message: 'Tai khoan dang bi vo hieu hoa.' },
      });
    }
    return res.status(200).json({ status: 'ok', profile: publicProfile(props) });
  });
}