// Copies the tool list of the SnapWidget MCP server into src/tools.json: the list the CLI uses
// when it cannot read the server's own list. Run after a server change:
// SNAPWIDGET_TOKEN=<token> npm run tools (SNAPWIDGET_URL for another server). Any account's token
// works: the list is the same.
import { writeFileSync } from 'node:fs';
import { listTools } from '../src/client.js';

const tools = await listTools();
writeFileSync(new URL('../src/tools.json', import.meta.url), JSON.stringify(tools, null, 1) + '\n');
console.log(`${tools.length} tools`);
