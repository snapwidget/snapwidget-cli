import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;

// An error that the CLI prints as {"error": message} and exits with 1.
export class CliError extends Error {}

export function baseUrl() {
  return (process.env.SNAPWIDGET_URL || 'https://snapwidget.com').replace(/\/+$/, '');
}

export function configPath() {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'snapwidget', 'config.json');
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

// Only the owner can read the files: one holds the token. The mode of writeFileSync applies only
// to a new file, so chmod an old one too.
function writePrivate(path, data) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  chmodSync(path, 0o600);
}

// The token goes to the server it came from, never to another one (SNAPWIDGET_URL).
export function saveToken(token) {
  writePrivate(configPath(), { url: baseUrl(), token });
  return configPath();
}

export function forgetToken() {
  rmSync(configPath(), { force: true });
}

function token() {
  if (process.env.SNAPWIDGET_TOKEN) {
    return process.env.SNAPWIDGET_TOKEN;
  }
  const config = readJson(configPath()) || {};
  return config.url === baseUrl() ? config.token : undefined;
}

export const SIGN_IN_HELP = 'Sign in first: "snapwidget login" for an existing account, or "snapwidget signup --email <address>" for a new one. Or set SNAPWIDGET_TOKEN.';

async function request(path, { method = 'POST', headers = {}, body } = {}) {
  let response;
  try {
    response = await fetch(baseUrl() + path, {
      method,
      headers: { 'User-Agent': `snapwidget-cli/${VERSION}`, Accept: 'application/json', ...headers },
      body,
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    throw new CliError(error.name === 'TimeoutError'
      ? `No answer from ${baseUrl()} in 60 seconds. Try again.`
      : `Cannot reach ${baseUrl()}: ${error.cause?.message || error.message}`);
  }
  const text = await response.text();
  let data;
  try {
    // A streamed MCP answer: the JSON is on the last "data:" line.
    data = JSON.parse(text.startsWith('event:') || text.startsWith('data:')
      ? text.split('\n').filter((line) => line.startsWith('data:')).pop().slice(5)
      : text);
  } catch {
    data = { message: text.slice(0, 200) };
  }
  return { status: response.status, data };
}

// POST JSON to the REST API (the sign-up needs no token).
export async function post(path, body) {
  const { status, data } = await request(path, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (status >= 400) {
    throw new CliError(errorText(data, status));
  }
  return data;
}

// POST a form, as the OAuth token endpoint wants it.
export async function postForm(path, fields) {
  const { status, data } = await request(path, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  if (status >= 400) {
    throw new CliError(errorText(data, status));
  }
  return data;
}

function errorText(data, status) {
  if (data.errors) {
    return Object.values(data.errors).flat().join(' ');
  }
  return data.error_description || data.message || data.error || `HTTP ${status}`;
}

// One JSON-RPC request to the MCP server at /mcp.
async function rpc(method, params, bearer) {
  if (!bearer) {
    throw new CliError(SIGN_IN_HELP);
  }
  const { status, data } = await request('/mcp', {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${bearer}`,
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (status === 401) {
    throw new CliError(`The token was refused (signed out, or it expired). ${SIGN_IN_HELP}`);
  }
  if (status >= 400) {
    throw new CliError(errorText(data, status) + (data.upgrade_url ? ` Upgrade: ${data.upgrade_url}` : ''));
  }
  if (data.error) {
    throw new CliError(data.error.message);
  }
  if (!data.result) {
    throw new CliError(`${baseUrl()}/mcp gave an answer that is not from the SnapWidget server (HTTP ${status}): ${data.message || ''}`);
  }
  return data.result;
}

// Calls one tool. The answer is the tool's JSON, or its text. bearer: a token to use in place of
// the saved one (to check a new sign-in).
export async function callTool(name, args, bearer = token()) {
  const result = await rpc('tools/call', { name, arguments: args }, bearer);
  const text = (result.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('\n');
  if (result.isError) {
    throw new CliError(text);
  }
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

// Every tool of the server (tools/list, all pages): name, title, description, inputSchema, annotations.
export async function listTools(bearer = token()) {
  const tools = [];
  let cursor;
  do {
    const result = await rpc('tools/list', cursor ? { cursor } : {}, bearer);
    tools.push(...result.tools.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })));
    cursor = result.nextCursor;
  } while (cursor);
  return tools;
}

const DAY = 24 * 60 * 60 * 1000;

// The server's tools, for the options and --help: read once a day when signed in (tools/list is
// not a tool call, so it does not count toward the daily limit), else the last list, else the
// list that came with this version.
export async function tools(bundled) {
  const path = join(dirname(configPath()), 'tools.json');
  const cache = readJson(path);
  const cached = cache?.url === baseUrl() ? cache : undefined;
  if (cached && Date.now() - cached.fetched_at < DAY) {
    return cached.tools;
  }
  if (!token()) {
    return cached?.tools || bundled;
  }
  try {
    const list = await listTools();
    writePrivate(path, { url: baseUrl(), fetched_at: Date.now(), tools: list });
    return list;
  } catch {
    return cached?.tools || bundled;
  }
}
