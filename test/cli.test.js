import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseArgs, toolArguments } from '../src/cli.js';
import { COMMANDS } from '../src/commands.js';

const TOOLS = Object.fromEntries(JSON.parse(readFileSync(new URL('../src/tools.json', import.meta.url))).map((t) => [t.name, t]));
const bin = new URL('../bin/snapwidget.js', import.meta.url).pathname;
const run = (...args) => spawnSync('node', [bin, ...args], { encoding: 'utf8', env: { ...process.env, SNAPWIDGET_TOKEN: '', XDG_CONFIG_HOME: '/nonexistent' } });

test('every command calls a tool of the server, with arguments the tool has', () => {
  for (const command of COMMANDS) {
    const tool = TOOLS[command.tool];
    assert.ok(tool, `${command.name}: no tool ${command.tool}`);
    for (const arg of command.args || []) {
      assert.ok(arg in tool.inputSchema.properties, `${command.name}: ${arg}`);
    }
  }
});

test('options: values, =values, booleans and repeats', () => {
  assert.deepEqual(parseArgs(['abc', '--per-page', '10', '--confirm', 'x', '--name=a b', '--ids', '1', '--ids', '2'], ['confirm']), {
    positionals: ['abc', 'x'],
    options: { per_page: '10', confirm: true, name: 'a b', ids: ['1', '2'] },
  });
  assert.deepEqual(parseArgs(['--confirm', 'false'], ['confirm']).options, { confirm: 'false' });
});

test('tool arguments get the types of the tool schema', () => {
  const create = TOOLS.create_widget;
  assert.deepEqual(toolArguments(create, [], [], { layout: 'grid', accounts: '12, 34' }), { layout: 'grid', accounts: [12, 34] });
  assert.deepEqual(toolArguments(create, [], [], { json: '{"layout":"wall","kind":"review"}', name: 'Reviews' }), { layout: 'wall', kind: 'review', name: 'Reviews' });
  assert.deepEqual(toolArguments(TOOLS.update_widget, ['widget_id'], ['w1'], { settings: '{"layoutx":4}' }), { widget_id: 'w1', settings: { layoutx: 4 } });
  assert.deepEqual(toolArguments(TOOLS.delete_widget, ['widget_id'], ['w1'], { confirm: true }), { widget_id: 'w1', confirm: true });
  assert.deepEqual(toolArguments(TOOLS.list_widgets, [], [], { per_page: '5' }), { per_page: 5 });
});

test('a wrong option or value says what is right', () => {
  assert.throws(() => toolArguments(TOOLS.list_widgets, [], [], { nope: '1' }), /Unknown option --nope\. Options: --page, --per-page\./);
  assert.throws(() => toolArguments(TOOLS.list_widgets, [], [], { per_page: 'ten' }), /--per-page needs a whole number/);
  assert.throws(() => toolArguments(TOOLS.list_widgets, [], [], { per_page: '' }), /--per-page needs a whole number/);
  assert.throws(() => toolArguments(TOOLS.get_widget_stats, [], [], { days: '1.5' }), /--days needs a whole number/);
  assert.throws(() => toolArguments(TOOLS.update_widget, ['widget_id'], ['w1'], { settings: '{bad' }), /--settings needs JSON/);
  assert.throws(() => toolArguments(TOOLS.get_widget, ['widget_id'], ['w1', 'w2'], {}), /Too many arguments: w2/);
});

test('help lists the commands, and a command shows its options', () => {
  const help = execFileSync('node', [bin, '--help'], { encoding: 'utf8' });
  for (const command of COMMANDS) {
    assert.match(help, new RegExp(`  ${command.name}( |$)`, 'm'));
  }
  const create = execFileSync('node', [bin, 'widgets', 'create', '--help'], { encoding: 'utf8' });
  assert.match(create, /Usage: snapwidget widgets create \[options\]/);
  assert.match(create, /--layout <string> \(required\)/);
  assert.match(execFileSync('node', [bin, 'embed', '--help'], { encoding: 'utf8' }), /--format <html\|react\|next>/);
});

test('without a sign-in, a tool command says how to sign in', () => {
  const result = run('account');
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /snapwidget login/);
});

test('an unknown command fails with JSON', () => {
  const result = run('nope');
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /Unknown command "nope"/);
});
