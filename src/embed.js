import { CliError } from './client.js';

export const FORMATS = ['html', 'react', 'next'];

// The parts of a SnapWidget embed code (app/Services/EmbedCode.php): stylesheets, scripts (a
// src, or the small loader of the popup and banner widgets), the popup and banner placeholder
// divs, and the widget iframe.
const PARTS = [
  ['comment', /<!--[\s\S]*?-->/y],
  ['stylesheet', /<link rel="stylesheet" href="([^"]+)"\s*\/?>/y],
  ['script', /<script src="([^"]+)"><\/script>/y],
  ['loader', /<script>!function\(s,n,ap\)\{[\s\S]*?a\.src="([^"]+)"[\s\S]*?\}\(document,0,"([^"]+)"\);<\/script>/y],
  ['element', /<(div|iframe)((?:\s+[\w-]+="[^"]*")*)\s*><\/\1>/y],
];

export function parse(html) {
  const parts = [];
  let at = 0;
  while (at < html.length) {
    if (/\s/.test(html[at])) {
      at++;
      continue;
    }
    const found = PARTS.find(([, pattern]) => {
      pattern.lastIndex = at;
      return pattern.test(html);
    });
    if (!found) {
      throw new CliError('This embed code has a part the CLI cannot convert. Use --format html and add it as HTML.');
    }
    const [kind, pattern] = found;
    pattern.lastIndex = at;
    const match = pattern.exec(html);
    at = pattern.lastIndex;
    if (kind === 'stylesheet') parts.push({ kind, href: match[1] });
    if (kind === 'script') parts.push({ kind: 'script', src: match[1] });
    if (kind === 'loader') parts.push({ kind: 'script', src: match[1], id: match[2] });
    if (kind === 'element') parts.push({ kind, tag: match[1], attributes: [...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]) });
  }
  return parts;
}

const decode = (value) => value.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

const JSX_NAMES = { class: 'className', frameborder: 'frameBorder' };

function styleObject(css) {
  const entries = css.split(';').map((rule) => rule.trim()).filter(Boolean).map((rule) => {
    const [name, ...value] = rule.split(':');
    const key = name.trim().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return `${key}: ${JSON.stringify(value.join(':').trim())}`;
  });
  return `{{ ${entries.join(', ')} }}`;
}

// A JSX string attribute has no escapes and reads "&...;" as a character: a value with a quote, a
// backslash or an ampersand goes in braces.
const jsxString = (value) => (/["\\&]/.test(value) ? `{${JSON.stringify(value)}}` : `"${value}"`);

function jsxElement({ tag, attributes }) {
  // allowtransparency was for old Internet Explorer: React 19 warns about it, and "true" fails a
  // TypeScript build. An iframe is transparent without it.
  const props = attributes.filter(([name]) => name !== 'allowtransparency').map(([name, value]) => name === 'style'
    ? `style=${styleObject(value)}`
    : `${JSX_NAMES[name] || name}=${jsxString(value)}`);
  return `<${tag} ${props.join(' ')} />`;
}

function react(parts) {
  const scripts = parts.filter((part) => part.kind === 'script');
  const body = [
    ...parts.filter((part) => part.kind === 'stylesheet').map((part) => `<link rel="stylesheet" href=${JSON.stringify(part.href)} />`),
    ...parts.filter((part) => part.kind === 'element').map(jsxElement),
  ];
  return `'use client';

import { useEffect } from 'react';

// SnapWidget. A <script> tag inside JSX does not run, so the widget's scripts load here, once per page.
const SCRIPTS = ${JSON.stringify(scripts.map(({ src, id = '' }) => ({ src, id })))};

export default function SnapWidget() {
  useEffect(() => {
    for (const { src, id } of SCRIPTS) {
      if (document.querySelector(id ? \`script#\${id}\` : \`script[src="\${src}"]\`)) continue;
      const script = document.createElement('script');
      script.src = src;
      if (id) script.id = id;
      document.body.appendChild(script);
    }
  }, []);

  return (
    <>
${body.map((line) => `      ${line}`).join('\n')}
    </>
  );
}
`;
}

function next(parts) {
  const body = [
    ...parts.filter((part) => part.kind === 'stylesheet').map((part) => `<link rel="stylesheet" href=${JSON.stringify(part.href)} />`),
    ...parts.filter((part) => part.kind === 'script').map(({ src, id }) => `<Script ${id ? `id=${JSON.stringify(id)} ` : ''}src=${JSON.stringify(src)} strategy="afterInteractive" />`),
    ...parts.filter((part) => part.kind === 'element').map(jsxElement),
  ];
  return `import Script from 'next/script';

// SnapWidget. next/script loads the widget's scripts once per page.
export default function SnapWidget() {
  return (
    <>
${body.map((line) => `      ${line}`).join('\n')}
    </>
  );
}
`;
}

export function convert(html, format) {
  if (format === 'html') {
    return html;
  }
  if (format === 'react') {
    return react(parse(html));
  }
  if (format === 'next') {
    return next(parse(html));
  }
  throw new CliError(`Unknown format "${format}". Use ${FORMATS.join(', ')}.`);
}
