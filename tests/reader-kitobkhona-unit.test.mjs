import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAliyaDocxBytes, safeSlug } from '../shared/reader-doc-export.mjs';

if (!globalThis.location) globalThis.location = { protocol: 'https:', hostname: 'smartmaktabtj.github.io', href: 'https://smartmaktabtj.github.io/smartmaktab/cabinets/school/teacher.html' };
if (!globalThis.window) globalThis.window = { origin: 'https://smartmaktabtj.github.io' };
if (!globalThis.document) {
  globalThis.document = {
    baseURI: 'https://smartmaktabtj.github.io/smartmaktab/cabinets/school/teacher.html',
    getElementById: () => null,
    querySelector: () => null,
    documentElement: { lang: 'tg' },
  };
}

const gw = await import('../shared/reader-gateway.mjs');

test('MiniZip DOCX exporter creates valid OOXML archive with Tajik/Russian markdown', () => {
  const bytes = createAliyaDocxBytes({
    title: 'Хулосаи мавзӯъ',
    bookName: 'Информатика — синфи 7',
    pageLabel: 'Саҳифаи 12',
    markdown: '## Мавзӯи нав\n\n[[Муҳаммад Хоразмӣ]] асосгузори **алгоритм** мебошад.\n\n- Нуктаи <1> & "2"\n\n| Мафҳум | Маъно |\n| --- | --- |\n| Алгоритм | Пайдарпайии амалҳо |\n\n@@МАВЗӮЪ: Таърихи алгоритм',
  });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0x04);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('[Content_Types].xml'));
  assert.ok(text.includes('word/document.xml'));
  assert.ok(text.includes('word/header1.xml'));
  assert.ok(text.includes('Муҳаммад Хоразмӣ'));
  assert.ok(text.includes('алгоритм'));
  assert.ok(text.includes('&lt;1&gt; &amp; &quot;2&quot;'));
  assert.ok(!text.includes('@@МАВЗӮЪ'));
  assert.equal(safeSlug('Информатика — синфи 7!'), 'Информатика_синфи_7');
});

test('Aliya gateway defaults to sharipovip-aliya-gateway.hf.space in production and extracts topics', () => {
  assert.equal(gw.DEFAULT_ALIYA_GATEWAY, 'https://sharipovip-aliya-gateway.hf.space');
  assert.equal(gw.gatewayEnabled, true);
  assert.equal(gw.gatewayEndpoint(), 'https://sharipovip-aliya-gateway.hf.space');
  const parsed = gw.extractAliyaTopic('## Мавзӯъ\nМатни асосӣ.\n@@МАВЗӮЪ: Алгоритмҳо');
  assert.equal(parsed.topic, 'Алгоритмҳо');
  assert.equal(parsed.body, '## Мавзӯъ\nМатни асосӣ.');
});

test('pdf-reader defines 12 paper colors and curl module is bundled into teacher cabinet', async () => {
  const src = await readFile(new URL('../shared/pdf-reader.mjs', import.meta.url), 'utf8');
  const matches = src.match(/\{\s*id:\s*'[a-z]+'/g) || [];
  assert.equal(matches.length, 12);
  const teacherHtml = await readFile(new URL('../cabinets/school/teacher.html', import.meta.url), 'utf8');
  assert.ok(teacherHtml.includes('reader-paper-tint'));
  assert.ok(teacherHtml.includes('reader-curl-layer'));
  const m = teacherHtml.match(/id="sm-inline-source"\s+data-code="([^"]+)"/);
  assert.ok(m, 'inline script bundle missing in teacher.html');
  const decodedJs = Buffer.from(m[1], 'base64').toString('utf8');
  assert.ok(decodedJs.includes('sharipovip-aliya-gateway.hf.space'));
  assert.ok(decodedJs.includes('word/header1.xml'));
  assert.ok(decodedJs.includes('reader-curl-surface'));
});
