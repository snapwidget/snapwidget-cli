import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convert, parse } from '../src/embed.js';

const APP = 'https://snapwidget.com';
const IFRAME = `<iframe src="${APP}/embed/123" class="snapwidget-widget" allowtransparency="true" frameborder="0" scrolling="no" style="border:none; overflow:hidden; width:100%" title="Posts from &quot;Acme&quot;"></iframe>`;

// The shapes of app/Services/EmbedCode.php: responsive, lightbox, popup and banner.
const RESPONSIVE = `<!-- SnapWidget -->\n<script src="${APP}/js/snapwidget.js"></script>\n${IFRAME}`;
const LIGHTBOX = `<!-- SnapWidget -->\n<link rel="stylesheet" href="${APP}/stylesheets/snapwidget-lightbox.css" />\n<script src="${APP}/js/snapwidget-lightbox.js"></script>\n<script src="${APP}/js/snapwidget.js"></script>\n${IFRAME}`;
const POPUP = `<!-- SnapWidget -->\n<div class="snapwidget-rpf" data-widget-id="123"></div>\n<script>!function(s,n,ap){if(!s.getElementById(ap)){var a=s.createElement("script");a.id=ap,a.src="${APP}/js/snapwidget-rpf.js",s.getElementsByTagName("head")[0].appendChild(a)}}(document,0,"snaprpf");</script>`;

test('html stays as it is', () => {
  assert.equal(convert(RESPONSIVE, 'html'), RESPONSIVE);
});

test('the parts of each shape', () => {
  assert.deepEqual(parse(LIGHTBOX).map((p) => p.kind), ['stylesheet', 'script', 'script', 'element']);
  assert.deepEqual(parse(POPUP), [
    { kind: 'element', tag: 'div', attributes: [['class', 'snapwidget-rpf'], ['data-widget-id', '123']] },
    { kind: 'script', src: `${APP}/js/snapwidget-rpf.js`, id: 'snaprpf' },
  ]);
});

test('react: the scripts load in useEffect, the iframe is JSX', () => {
  const code = convert(LIGHTBOX, 'react');
  assert.match(code, /^'use client';/);
  assert.match(code, /const SCRIPTS = \[\{"src":"https:\/\/snapwidget\.com\/js\/snapwidget-lightbox\.js","id":""\},\{"src":"https:\/\/snapwidget\.com\/js\/snapwidget\.js","id":""\}\];/);
  assert.match(code, /<link rel="stylesheet" href="https:\/\/snapwidget\.com\/stylesheets\/snapwidget-lightbox\.css" \/>/);
  assert.match(code, /<iframe src="https:\/\/snapwidget\.com\/embed\/123" className="snapwidget-widget" frameBorder="0" scrolling="no" style=\{\{ border: "none", overflow: "hidden", width: "100%" \}\} title=\{"Posts from \\"Acme\\""\} \/>/);
  assert.doesNotMatch(code, /<script src|<\/script>/);
});

test('next: next/script with the loader id', () => {
  const code = convert(POPUP, 'next');
  assert.match(code, /import Script from 'next\/script';/);
  assert.match(code, /<div className="snapwidget-rpf" data-widget-id="123" \/>/);
  assert.match(code, /<Script id="snaprpf" src="https:\/\/snapwidget\.com\/js\/snapwidget-rpf\.js" strategy="afterInteractive" \/>/);
});

test('a name with a quote, a backslash, an ampersand or > stays valid JSX', () => {
  const html = `<!-- SnapWidget -->\n<script src="${APP}/js/snapwidget.js"></script>\n<iframe src="${APP}/embed/1" class="snapwidget-widget" title="Reviews &quot;4&gt; stars&quot; \\ A&amp;B >"></iframe>`;
  const code = convert(html.replace('&gt;', '>'), 'next');
  assert.match(code, /title=\{"Reviews \\"4> stars\\" \\\\ A&B >"\}/);
  assert.match(convert(RESPONSIVE.replace('Posts from &quot;Acme&quot;', 'Plain name'), 'react'), / title="Plain name" \/>/);
});

test('an unknown part or format fails instead of losing code', () => {
  assert.throws(() => convert(`${RESPONSIVE}\n<p>hi</p>`, 'react'), /cannot convert/);
  assert.throws(() => convert(RESPONSIVE, 'vue'), /Unknown format "vue"/);
});
