import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { baseUrl, CliError, post, postForm } from './client.js';

const base64url = (buffer) => buffer.toString('base64url');

// On Windows not "cmd /c start": cmd reads the "&" in the link as the end of the command.
function openBrowser(url) {
  const [command, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : ['xdg-open', [url]];
  try {
    spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    // The link is on stderr as well.
  }
}

const PAGE = (text) => `<!doctype html><meta charset="utf-8"><title>SnapWidget</title>`
  + `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><p>${text}</p></body>`;

/**
 * Signs in to an existing account with the browser: OAuth 2.1 with PKCE on the SnapWidget OAuth
 * server, the way Claude and ChatGPT connect. The CLI registers itself as a client with a
 * callback on 127.0.0.1, opens the Allow page and waits for the code. Returns the access token.
 */
export async function login({ browser = true, timeoutMinutes = 10 } = {}) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;

  try {
    const client = await post('/oauth/register', { client_name: 'SnapWidget CLI', redirect_uris: [redirectUri] });
    const verifier = base64url(randomBytes(32));
    const state = base64url(randomBytes(16));
    const url = `${baseUrl()}/oauth/authorize?` + new URLSearchParams({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: redirectUri,
      scope: 'mcp:use',
      state,
      code_challenge: base64url(createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
    });

    process.stderr.write(`Open this link to sign in to SnapWidget and click Allow:\n${url}\n`);
    if (browser) {
      openBrowser(url);
    }

    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new CliError(`No sign-in after ${timeoutMinutes} minutes. Run "snapwidget login" again.`)), timeoutMinutes * 60000);
      server.on('request', (req, res) => {
        const query = new URL(req.url, redirectUri).searchParams;
        if (!req.url.startsWith('/callback') || query.get('state') !== state) {
          res.writeHead(404).end();
          return;
        }
        clearTimeout(timer);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        if (query.get('code')) {
          res.end(PAGE('You are signed in to SnapWidget. You can close this tab and go back to your terminal.'));
          resolve(query.get('code'));
        } else {
          res.end(PAGE('The sign-in did not finish. Close this tab and run snapwidget login again.'));
          reject(new CliError(`The sign-in did not finish (${query.get('error') || 'no code'}). Run "snapwidget login" again.`));
        }
      });
    });

    const answer = await postForm('/oauth/token', {
      grant_type: 'authorization_code',
      client_id: client.client_id,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      code,
    });
    return answer.access_token;
  } finally {
    server.close();
  }
}
