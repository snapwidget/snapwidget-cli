import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';

// The CLI against a fake SnapWidget server: what it sends, and what it does with odd answers.
const bin = new URL('../bin/snapwidget.js', import.meta.url).pathname;
const BUNDLED = JSON.parse(readFileSync(new URL('../src/tools.json', import.meta.url)));
let server;
let url;
let calls;
let mode;

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const json = body ? JSON.parse(body) : {};
      calls.push({ path: req.url, auth: req.headers.authorization, body: json });
      res.setHeader('Content-Type', 'application/json');
      if (mode === 'html') {
        res.setHeader('Content-Type', 'text/html');
        return res.end('<html>Checking your browser</html>');
      }
      if (req.url === '/api/v1/signup/verify') {
        return res.end(JSON.stringify({ token: 'new-token', message: 'Ready.' }));
      }
      if (json.method === 'tools/list') {
        // The live list has an option that the bundled list does not have.
        const tools = BUNDLED.map((t) => (t.name === 'get_widget'
          ? { ...t, inputSchema: { ...t.inputSchema, properties: { ...t.inputSchema.properties, new_option: { type: 'integer' } } } }
          : t));
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools } }));
      }
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [], structuredContent: { email: 'a@example.com', name: json.params?.name, arguments: json.params?.arguments } } }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

let config;
beforeEach(() => {
  calls = [];
  mode = 'json';
  config = mkdtempSync(join(tmpdir(), 'snapwidget-test-'));
});

function cli(args, env = {}) {
  return new Promise((resolve) => {
    execFile('node', [bin, ...args], { env: { ...process.env, SNAPWIDGET_URL: url, XDG_CONFIG_HOME: config, SNAPWIDGET_TOKEN: '', ...env } }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, out: stdout ? JSON.parse(stdout) : undefined, err: stderr ? JSON.parse(stderr).error : undefined });
    });
  });
}

const toolCalls = () => calls.filter((c) => c.body.method === 'tools/call');

test('call: the tool name comes after an option with a value', async () => {
  const { code } = await cli(['call', '--json', '{"widget_id":"w1"}', 'get_widget'], { SNAPWIDGET_TOKEN: 't' });
  assert.equal(code, 0);
  assert.deepEqual(toolCalls()[0].body.params, { name: 'get_widget', arguments: { widget_id: 'w1' } });
});

test('a wrong embed format fails before any tool call', async () => {
  const { code, err } = await cli(['embed', 'w1', '--format', 'vue'], { SNAPWIDGET_TOKEN: 't' });
  assert.equal(code, 1);
  assert.match(err, /Unknown format "vue"/);
  assert.equal(toolCalls().length, 0);
});

test('a page that is not JSON gives a clear error, not a stack trace', async () => {
  mode = 'html';
  const { code, err } = await cli(['account'], { SNAPWIDGET_TOKEN: 't' });
  assert.equal(code, 1);
  assert.match(err, /not from the SnapWidget server \(HTTP 200\)/);
  assert.doesNotMatch(err, /TypeError|\n\s+at /);
});

test('verify checks the new token, also when SNAPWIDGET_TOKEN is set, and saves it for the owner only', async () => {
  mkdirSync(join(config, 'snapwidget'));
  writeFileSync(join(config, 'snapwidget', 'config.json'), '{}');
  chmodSync(join(config, 'snapwidget', 'config.json'), 0o644);
  const { code, out } = await cli(['verify', '--email', 'a@example.com', '--code', '123456'], { SNAPWIDGET_TOKEN: 'old-token' });
  assert.equal(code, 0);
  assert.equal(out.email, 'a@example.com');
  assert.equal(toolCalls()[0].auth, 'Bearer new-token');
  assert.equal(statSync(join(config, 'snapwidget', 'config.json')).mode & 0o777, 0o600);
});

test('logout says when SNAPWIDGET_TOKEN still signs the commands', async () => {
  assert.deepEqual((await cli(['logout'])).out, { signed_out: true });
  assert.match((await cli(['logout'], { SNAPWIDGET_TOKEN: 't' })).out.message, /SNAPWIDGET_TOKEN is still set/);
});

test('the live tool list allows a new option, and is read once a day', async () => {
  assert.equal((await cli(['widgets', 'get', 'w1', '--new-option', '3'], { SNAPWIDGET_TOKEN: 't' })).code, 0);
  assert.deepEqual(toolCalls()[0].body.params.arguments, { widget_id: 'w1', new_option: 3 });
  await cli(['widgets', 'get', 'w1'], { SNAPWIDGET_TOKEN: 't' });
  assert.equal(calls.filter((c) => c.body.method === 'tools/list').length, 1);
});

test('without a sign-in, the bundled list gives the options and help', async () => {
  const { code, err } = await cli(['widgets', 'get', 'w1', '--new-option', '3']);
  assert.equal(code, 1);
  assert.match(err, /Unknown option --new-option/);
  assert.equal(calls.length, 0);
});
