// Makes skills/snapwidget/references/<builder>.md of snapwidget-agent from the install guides of the
// SnapWidget docs (https://snapwidget.com/docs/install/*). Run: npm run references -- <agent folder>
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const agent = process.argv[2];
if (!agent || !existsSync(join(agent, 'skills/snapwidget/SKILL.md'))) {
  throw new Error('Give the folder of snapwidget-agent: npm run references -- <agent folder>');
}

const DOCS = 'https://snapwidget.com/docs';
const OUT = pathToFileURL(resolve(agent, 'skills/snapwidget/references') + '/');

const index = await (await fetch(`${DOCS}/llms.txt`)).text();
const pages = [...new Set(index.match(/https:\/\/snapwidget\.com\/docs\/install\/[a-z0-9-]+\.md/g))].sort();

const guides = [];
for (const url of pages) {
  const text = await (await fetch(url)).text();
  // The docs put a "Documentation Index" note above each page.
  const body = text.replace(/^(>.*\n)+\n/, '').trim();
  const slug = url.match(/install\/([a-z0-9-]+)\.md/)[1];
  writeFileSync(new URL(`${slug}.md`, OUT), `<!-- From ${url.replace(/\.md$/, '')}. To change it, change the docs and run npm run references. -->

Get the code with \`snapwidget embed <widget_id> --format html\` (the MCP tool get_embed_code). It is the same code as **Copy Code** in the steps below, so skip the steps in SnapWidget.

${body}
`);
  guides.push(`- [${body.match(/^# (.+)$/m)[1]}](${slug}.md)`);
  console.log(slug);
}

// The list of the guides: an agent that reads the skill from a web address cannot list a folder.
writeFileSync(new URL('index.md', OUT), `# Install guides

Get the code with \`snapwidget embed <widget_id> --format html\` (the MCP tool get_embed_code), then follow the guide of the website builder. For React, Next.js, Vue, Nuxt, Svelte and Astro, read [frameworks.md](frameworks.md).

${guides.join('\n')}
`);
console.log(`${pages.length} guides`);
