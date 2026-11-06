// Copies skills/ into the SnapWidget app, which serves them at /.well-known/agent-skills/ from
// resources/agent-skills/. Run after each skill change: npm run sync-app -- <agent folder> <app folder>
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [agent, app] = process.argv.slice(2);
if (!agent || !app || !existsSync(join(agent, 'skills')) || !existsSync(join(app, 'artisan'))) {
  throw new Error('Give both folders: npm run sync-app -- <agent folder> <app folder>');
}
const source = resolve(agent, 'skills');
const target = resolve(app, 'resources/agent-skills');
for (const skill of readdirSync(source)) {
  // Delete first, so a file that left the skill also leaves the app.
  rmSync(join(target, skill), { recursive: true, force: true });
  cpSync(join(source, skill), join(target, skill), { recursive: true });
  console.log(`${skill} -> ${join(target, skill)}`);
}
