import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load `backend/.env.local` then `backend/.env` and merge into the env object.
// Never log secrets.
export function loadConfig(env = process.env, { cwd = process.cwd() } = {}) {
  // .env.local takes precedence over .env.
  const envFiles = ['.env.local', '.env'];
  const merged = { ...env };

  for (const fileName of envFiles) {
    const filePath = resolve(cwd, fileName);
    if (existsSync(filePath)) {
      const parsed = parseEnvFile(filePath);
      for (const [k, v] of Object.entries(parsed)) {
        if (merged[k] === undefined || merged[k] === '') {
          merged[k] = v;
        }
      }
    }
  }

  const nodeEnv = (merged.NODE_ENV || 'development').trim();
  const host = (merged.HOST || '127.0.0.1').trim();
  const port = parsePort(merged.PORT, 3001);

  const neo4jUri = (merged.NEO4J_URI || '').trim();
  const neo4jUsername = (merged.NEO4J_USERNAME || '').trim();
  const neo4jPassword = merged.NEO4J_PASSWORD ?? '';
  const neo4jDatabase = (merged.NEO4J_DATABASE || '').trim();

  const sessionSecret = (merged.SESSION_SECRET || '').trim();

  return {
    nodeEnv,
    host,
    port,
    neo4jUri,
    neo4jUsername,
    neo4jPassword,
    neo4jDatabase,
    sessionSecret,
    // True when all four Neo4j fields are present.
    get neo4jFullyConfigured() {
      return Boolean(neo4jUri && neo4jUsername && neo4jPassword && neo4jDatabase);
    },
  };
}

function parsePort(value, fallback) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0 || num > 65535) return fallback;
  return num;
}

// Minimal .env parser that skips comments and empty lines; optional single or double quotes are stripped.
export function parseEnvFile(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolves to `backend/` regardless of where the process was started.
export const backendRoot = resolve(__dirname, '..');
