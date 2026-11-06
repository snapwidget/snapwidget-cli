import { readFileSync } from 'node:fs';
import { callTool, CliError, forgetToken, post, saveToken, tools, VERSION } from './client.js';
import { COMMANDS } from './commands.js';
import { convert, FORMATS } from './embed.js';
import { login } from './login.js';

// The tools of the MCP server when this version was made (npm run tools), for when the CLI cannot
// read the server's own list (client.js tools()).
const BUNDLED = JSON.parse(readFileSync(new URL('./tools.json', import.meta.url)));

const OWN = [
  { name: 'signup', usage: 'signup --email <address>', text: 'Makes a new SnapWidget account. SnapWidget emails a 6-digit code to the address.' },
  { name: 'verify', usage: 'verify --email <address> --code <code>', text: 'Finishes the sign-up with the code from the email and signs in.' },
  { name: 'login', usage: 'login [--no-browser]', text: 'Signs in to an existing account: opens the browser, where you sign in and click Allow.' },
  { name: 'logout', usage: 'logout', text: 'Removes the saved sign-in from this computer.' },
  { name: 'tools', usage: 'tools', text: 'Lists the tools of the SnapWidget MCP server.' },
  { name: 'call', usage: 'call <tool> [--json <arguments>] [--<argument> <value>]', text: 'Calls any tool of the SnapWidget MCP server by its name.' },
];

const firstSentence = (text) => text.split(/(?<=\.)\s/)[0];

// The command whose words start argv: the longest match ("widgets get" before "widgets").
function findCommand(argv) {
  const words = [];
  for (const arg of argv) {
    if (arg.startsWith('-')) break;
    words.push(arg);
  }
  let best;
  for (const command of [...OWN, ...COMMANDS]) {
    const parts = command.name.split(' ');
    if (parts.every((part, i) => words[i] === part) && (!best || parts.length > best.name.split(' ').length)) {
      best = command;
    }
  }
  return best;
}

// "--per-page 10", "--per-page=10" and "--confirm" (a boolean option needs no value).
export function parseArgs(argv, booleans = []) {
  const positionals = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--')) {
      const [raw, inline] = arg.slice(2).split(/=(.*)/s);
      const name = raw.replace(/-/g, '_');
      let value = inline;
      if (value === undefined) {
        const next = argv[i + 1];
        const takesValue = !booleans.includes(name) || next === 'true' || next === 'false';
        value = takesValue && next !== undefined && !next.startsWith('--') ? argv[++i] : true;
      }
      options[name] = name in options ? [].concat(options[name], value) : value;
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, options };
}

function coerce(name, value, schema = {}) {
  const fail = (what) => { throw new CliError(`--${name.replace(/_/g, '-')} needs ${what}.`); };
  const type = schema.type;
  if (value === true && type !== 'boolean') fail('a value');
  if (type === 'boolean') {
    if (value === true || value === 'true') return true;
    if (value === 'false') return false;
    fail('true or false');
  }
  if (type === 'integer') {
    return /^-?\d+$/.test(String(value).trim()) ? Number(value) : fail('a whole number');
  }
  if (type === 'number') {
    const number = Number(value);
    return String(value).trim() !== '' && Number.isFinite(number) ? number : fail('a number');
  }
  if (type === 'array') {
    const values = Array.isArray(value) ? value : String(value).trim().startsWith('[') ? json(name, value) : String(value).split(',');
    return values.map((item) => (typeof item === 'string' ? coerce(name, item.trim(), schema.items) : item));
  }
  if (type === 'object') {
    return json(name, value);
  }
  if (Array.isArray(value)) fail('one value');
  return String(value);
}

function json(name, value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new CliError(`--${name.replace(/_/g, '-')} needs JSON, for example '{"key": "value"}'.`);
  }
}

// The tool arguments from the positionals (in the command's order), --json and the options.
export function toolArguments(tool, positionalNames, positionals, options) {
  const properties = tool?.inputSchema?.properties || {};
  if (positionals.length > positionalNames.length) {
    throw new CliError(`Too many arguments: ${positionals.slice(positionalNames.length).join(' ')}.`);
  }
  const args = options.json !== undefined ? json('json', options.json) : {};
  positionalNames.forEach((name, i) => {
    if (positionals[i] !== undefined) args[name] = coerce(name, positionals[i], properties[name]);
  });
  for (const [name, value] of Object.entries(options)) {
    if (name === 'json') continue;
    if (tool && !(name in properties)) {
      const known = Object.keys(properties).map((key) => `--${key.replace(/_/g, '-')}`).join(', ') || 'none';
      throw new CliError(`Unknown option --${name.replace(/_/g, '-')}. Options: ${known}.`);
    }
    args[name] = tool ? coerce(name, value, properties[name]) : value;
  }
  return args;
}

function mainHelp(TOOLS) {
  const lines = [
    `SnapWidget CLI ${VERSION}: add social media feeds and reviews to a website.`,
    '',
    'Usage: snapwidget <command> [arguments] [options]',
    '',
    'Sign in',
    ...OWN.slice(0, 4).map((command) => `  ${command.usage.padEnd(42)} ${command.text}`),
  ];
  let group;
  for (const command of COMMANDS) {
    if (command.group !== group) {
      group = command.group;
      lines.push('', group);
    }
    const usage = [command.name, ...(command.args || []).map((arg) => `<${arg}>`)].join(' ');
    lines.push(`  ${usage.padEnd(42)} ${firstSentence(TOOLS[command.tool]?.description || '')}`);
  }
  lines.push(
    '',
    'Other',
    ...OWN.slice(4).map((command) => `  ${command.usage.padEnd(42)} ${command.text}`),
    '',
    'Run "snapwidget <command> --help" for the options of a command. Every command prints JSON.',
    'Environment: SNAPWIDGET_TOKEN (a token in place of the saved sign-in), SNAPWIDGET_URL (another server).',
  );
  return lines.join('\n');
}

function commandHelp(command, TOOLS) {
  if (!command.tool) {
    return `Usage: snapwidget ${command.usage}\n\n${command.text}`;
  }
  const tool = TOOLS[command.tool];
  const schema = tool?.inputSchema || {};
  const positional = command.args || [];
  const lines = [
    `Usage: snapwidget ${[command.name, ...positional.map((arg) => `<${arg}>`)].join(' ')} [options]`,
    '',
    tool?.description || '',
  ];
  const options = Object.entries(schema.properties || {}).filter(([name]) => !positional.includes(name));
  if (command.tool === 'get_embed_code') {
    options.push(['format', { type: 'string', enum: FORMATS, description: 'The code for a plain HTML page or website builder (html, the default), a React component (react) or a Next.js component (next).' }]);
  }
  if (positional.length || options.length) {
    lines.push('', 'Arguments and options:');
    for (const [name, property] of [...positional.map((name) => [name, schema.properties?.[name] || {}]), ...options]) {
      const flag = positional.includes(name) ? `<${name}>` : `--${name.replace(/_/g, '-')}`;
      const type = property.enum ? property.enum.join('|') : property.type === 'array' ? `${property.items?.type || 'value'},...` : property.type || 'value';
      const required = (schema.required || []).includes(name) ? ' (required)' : '';
      lines.push(`  ${flag} <${type}>${required}`, `      ${property.description || ''}`);
    }
  }
  lines.push('', `This calls the MCP tool ${command.tool}. --json '{...}' sends the arguments as JSON.`);
  return lines.join('\n');
}

const print = (value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');

async function signedIn(token) {
  const path = saveToken(token);
  const account = await callTool('get_account', {}, token);
  return { signed_in: true, email: account.email, plan: account.plan, trial_ends_at: account.trial_ends_at, saved_in: path };
}

async function run(argv) {
  if (argv[0] === '--version' || argv[0] === '-v') {
    process.stdout.write(VERSION + '\n');
    return;
  }
  const TOOLS = Object.fromEntries((await tools(BUNDLED)).map((tool) => [tool.name, tool]));
  const command = findCommand(argv);
  if (!command) {
    const words = argv.filter((arg) => !arg.startsWith('-')).join(' ');
    const group = COMMANDS.filter((c) => words && c.name.startsWith(words + ' '));
    if (group.length) {
      process.stdout.write(group.map((c) => `snapwidget ${[c.name, ...(c.args || []).map((a) => `<${a}>`)].join(' ').padEnd(44)} ${firstSentence(TOOLS[c.tool]?.description || '')}`).join('\n') + '\n');
      return;
    }
    if (argv.length && !['help', '--help', '-h'].includes(argv[0])) {
      throw new CliError(`Unknown command "${words}". Run "snapwidget --help" for the commands.`);
    }
    process.stdout.write(mainHelp(TOOLS) + '\n');
    return;
  }

  const rest = argv.slice(command.name.split(' ').length);
  // The boolean options of the command's tool; for "call", of every tool, as the tool name comes
  // only out of the parse.
  const booleansOf = (list) => list.flatMap((t) => Object.entries(t?.inputSchema?.properties || {}).filter(([, p]) => p.type === 'boolean').map(([name]) => name));
  const { positionals, options } = parseArgs(rest, ['help', 'no_browser', ...booleansOf(command.name === 'call' ? Object.values(TOOLS) : [TOOLS[command.tool]])]);
  const toolName = command.name === 'call' ? positionals[0] : command.tool;
  const tool = TOOLS[toolName];
  if (options.help) {
    process.stdout.write(commandHelp(command, TOOLS) + '\n');
    return;
  }

  switch (command.name) {
    case 'signup': {
      const answer = await post('/api/v1/signup', { email: options.email });
      // The server's text tells an API client to POST the code; the CLI has verify for that.
      print({ ...answer, message: answer.message.replace(/ Ask the owner of the address .*$/, ' Ask the owner of the address for it.'), next: `snapwidget verify --email ${answer.email} --code <6-digit code from the email>` });
      return;
    }
    case 'verify': {
      const answer = await post('/api/v1/signup/verify', { email: options.email, code: String(options.code ?? '') });
      print({ ...(await signedIn(answer.token)), message: answer.message.replace(/ Connect to the MCP server .*?<token>"\./, '') });
      return;
    }
    case 'login':
      print(await signedIn(await login({ browser: !options.no_browser })));
      return;
    case 'logout':
      forgetToken();
      print(process.env.SNAPWIDGET_TOKEN
        ? { signed_out: true, message: 'SNAPWIDGET_TOKEN is still set, so the commands still use that token until you unset it.' }
        : { signed_out: true });
      return;
    case 'tools':
      print(Object.values(TOOLS).map((t) => ({ name: t.name, title: t.title, description: firstSentence(t.description) })));
      return;
    case 'call': {
      if (!toolName) throw new CliError('Name the tool: snapwidget call <tool>. "snapwidget tools" lists them.');
      print(await callTool(toolName, toolArguments(tool, [], positionals.slice(1), options)));
      return;
    }
  }

  if (command.tool === 'get_embed_code') {
    const format = options.format === undefined ? 'html' : String(options.format);
    if (!FORMATS.includes(format)) {
      throw new CliError(`Unknown format "${format}". Use ${FORMATS.join(', ')}.`);
    }
    delete options.format;
    const answer = await callTool(command.tool, toolArguments(tool, command.args, positionals, options));
    print({ id: answer.id, format, code: convert(answer.embed_code, format), guides: answer.guides });
    return;
  }
  print(await callTool(command.tool, toolArguments(tool, command.args || [], positionals, options)));
}

export async function main(argv) {
  try {
    await run(argv);
    return 0;
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: error instanceof CliError ? error.message : String(error?.stack || error) }) + '\n');
    return 1;
  }
}

