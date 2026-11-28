import { gzipSync, gunzipSync, strFromU8, strToU8, unzipSync } from './vendor/fflate.mjs';
import { formatPositionTitle } from './position-catalog.mjs';

export const DEFAULT_PAGE_MARGINS_MM = Object.freeze({ top: 20, right: 15, bottom: 20, left: 30 });

export const TEMPLATE_AUTOFILL_TAGS = Object.freeze([
  { key: 'school.name', group: 'org', labelTg: 'Номи муассиса', labelRu: 'Название учреждения' },
  { key: 'school.code', group: 'org', labelTg: 'Рамзи муассиса', labelRu: 'Код учреждения' },
  { key: 'school.region', group: 'org', labelTg: 'Вилоят', labelRu: 'Область' },
  { key: 'school.district', group: 'org', labelTg: 'Шаҳр / Ноҳия', labelRu: 'Город / Район' },
  { key: 'school.jamoat', group: 'org', labelTg: 'Ҷамоат', labelRu: 'Джамоат' },
  { key: 'school.village', group: 'org', labelTg: 'Деҳа / Маҳал', labelRu: 'Село / Местность' },
  { key: 'school.type', group: 'org', labelTg: 'Навъи муассиса', labelRu: 'Тип учреждения' },
  { key: 'school.shifts', group: 'org', labelTg: 'Баст', labelRu: 'Сменность' },
  { key: 'director.full_name', group: 'people', labelTg: 'Ному насаби директор', labelRu: 'ФИО директора' },
  { key: 'director.phone', group: 'people', labelTg: 'Телефони директор', labelRu: 'Телефон директора' },
  { key: 'user.full_name', group: 'people', labelTg: 'Ному насаби корбар', labelRu: 'ФИО пользователя' },
  { key: 'user.position', group: 'people', labelTg: 'Вазифаи корбар', labelRu: 'Должность пользователя' },
  { key: 'user.phone', group: 'people', labelTg: 'Телефони корбар', labelRu: 'Телефон пользователя' },
  { key: 'user.birth_date', group: 'people', labelTg: 'Санаи таваллуд', labelRu: 'Дата рождения' },
  { key: 'user.method_group', group: 'people', labelTg: 'Иттиҳодияи методӣ', labelRu: 'Методобъединение' },
  { key: 'date.today', group: 'dates', labelTg: 'Санаи имрӯз', labelRu: 'Текущая дата' },
  { key: 'date.year', group: 'dates', labelTg: 'Соли ҷорӣ', labelRu: 'Текущий год' },
  { key: 'date.academic_year', group: 'dates', labelTg: 'Соли таҳсил', labelRu: 'Учебный год' },
  { key: 'stats.students_total', group: 'stats', labelTg: 'Шумораи хонандагон', labelRu: 'Всего учащихся' },
  { key: 'stats.students_boys', group: 'stats', labelTg: 'Писарон', labelRu: 'Мальчиков' },
  { key: 'stats.students_girls', group: 'stats', labelTg: 'Духтарон', labelRu: 'Девочек' },
  { key: 'table.students', group: 'tables', labelTg: 'Ҷадвали хонандагон', labelRu: 'Таблица учащихся' },
  { key: 'table.workloads', group: 'tables', labelTg: 'Ҷадвали сарбории омӯзгорон', labelRu: 'Таблица нагрузки учителей' },
]);

export function escapeHtml(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const cp = Number(n);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const cp = parseInt(h, 16);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&amp;/g, '&');
}

const ALLOWED_TAGS = new Set([
  'p', 'div', 'span', 'br', 'hr', 'h1', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'colgroup', 'col', 'blockquote',
]);

const BLOCKED_WITH_BODY = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea',
  'select', 'button', 'meta', 'link', 'base', 'svg', 'math', 'noscript',
  'template', 'applet',
]);

const ALLOWED_STYLE_PROPS = new Set([
  'text-align', 'font-family', 'font-size', 'font-weight', 'font-style',
  'text-decoration', 'color', 'background-color', 'line-height',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'text-indent', 'padding', 'border', 'border-collapse', 'width', 'height',
  'vertical-align', 'list-style-type', 'page-break-before', 'break-before',
]);

export function sanitizeInlineStyle(rawStyle) {
  const parts = String(rawStyle || '').split(';');
  const safe = [];
  for (const part of parts) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
    if (!val || /expression|javascript:|vbscript:|url\s*\(|@import|<|>/i.test(val)) continue;
    safe.push(`${prop}:${val}`);
  }
  return safe.join(';');
}

function sanitizeAttributes(tag, attrString) {
  const kept = [];
  const attrRe = /([a-z0-9:-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;
  let m;
  while ((m = attrRe.exec(attrString))) {
    const name = m[1].toLowerCase();
    const rawVal = m[2] ?? m[3] ?? m[4] ?? '';
    if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction' || name === 'href' || name === 'src') {
      continue;
    }
    if (name === 'style') {
      const cleaned = sanitizeInlineStyle(rawVal);
      if (cleaned) kept.push(`style="${escapeHtml(cleaned)}"`);
    } else if (name === 'class') {
      const cls = rawVal
        .split(/\s+/)
        .filter((c) => /^[a-z0-9_-]{1,40}$/i.test(c))
        .join(' ');
      if (cls) kept.push(`class="${cls}"`);
    } else if ((tag === 'td' || tag === 'th') && (name === 'colspan' || name === 'rowspan')) {
      const num = parseInt(rawVal, 10);
      if (Number.isFinite(num) && num >= 1 && num <= 30) kept.push(`${name}="${num}"`);
    } else if (name === 'align' && /^(left|right|center|justify)$/i.test(rawVal)) {
      kept.push(`align="${rawVal.toLowerCase()}"`);
    } else if (name === 'data-sm-field' || name === 'data-sm-field-key' || name === 'data-sm-lock') {
      kept.push(`${name}="${escapeHtml(rawVal.slice(0, 80))}"`);
    } else if (name === 'contenteditable' && (rawVal === 'true' || rawVal === 'false')) {
      kept.push(`contenteditable="${rawVal}"`);
    }
  }
  return kept.length ? ' ' + kept.join(' ') : '';
}

export function sanitizeDocHtml(rawHtml) {
  let html = String(rawHtml ?? '');
  if (!html.trim()) return '<p><br></p>';

  // Strip dangerous blocks with their content first
  for (const tag of BLOCKED_WITH_BODY) {
    const pairRe = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    html = html.replace(pairRe, '');
    const singleRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    html = html.replace(singleRe, '');
  }
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // Filter every remaining tag through allowlist
  html = html.replace(/<(\/?)([a-z0-9:-]+)([^>]*)>/gi, (_, slash, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (slash) {
      if (tag === 'br' || tag === 'hr' || tag === 'col') return '';
      return `</${tag}>`;
    }
    const cleanAttrs = sanitizeAttributes(tag, attrs || '');
    return `<${tag}${cleanAttrs}>`;
  });

  return html.trim() || '<p><br></p>';
}

export function normalizePageMargins(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  const clamp = (v, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(5, Math.min(50, Math.round(n)));
  };
  return {
    top: clamp(m.top, DEFAULT_PAGE_MARGINS_MM.top),
    right: clamp(m.right, DEFAULT_PAGE_MARGINS_MM.right),
    bottom: clamp(m.bottom, DEFAULT_PAGE_MARGINS_MM.bottom),
    left: clamp(m.left, DEFAULT_PAGE_MARGINS_MM.left),
  };
}

export function htmlToPlainText(html) {
  return decodeXmlEntities(
    String(html || '')
      .replace(/<\/(p|div|h[1-6]|tr|li|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<t[dh][^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parsePlainTextToDocModel(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const html = lines
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>'))
    .join('');
  return {
    html: html || '<p><br></p>',
    pageOrientation: 'portrait',
    pageMarginsMm: { ...DEFAULT_PAGE_MARGINS_MM },
    plainPreview: lines.join('\n').trim().slice(0, 500),
  };
}

function extractXmlBlocks(xml, tagName) {
  const results = [];
  const openTag = `<${tagName}`;
  const closeTag = `</${tagName}>`;
  let pos = 0;
  while (pos < xml.length) {
    const start = xml.indexOf(openTag, pos);
    if (start < 0) break;
    const afterName = xml[start + openTag.length];
    if (afterName !== '>' && afterName !== ' ' && afterName !== '\t' && afterName !== '\n' && afterName !== '/') {
      pos = start + openTag.length;
      continue;
    }
    const tagEnd = xml.indexOf('>', start);
    if (tagEnd < 0) break;
    if (xml[tagEnd - 1] === '/') {
      results.push(xml.slice(start, tagEnd + 1));
      pos = tagEnd + 1;
      continue;
    }
    let depth = 1;
    let scan = tagEnd + 1;
    while (depth > 0 && scan < xml.length) {
      const nextOpen = xml.indexOf(openTag, scan);
      const nextClose = xml.indexOf(closeTag, scan);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        const ch = xml[nextOpen + openTag.length];
        if (ch === '>' || ch === ' ' || ch === '\t' || ch === '\n') depth += 1;
        scan = nextOpen + openTag.length;
      } else {
        depth -= 1;
        scan = nextClose + closeTag.length;
      }
    }
    results.push(xml.slice(start, scan));
    pos = scan;
  }
  return results;
}

function extractAttr(tagXml, attrName) {
  const re = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const m = String(tagXml || '').match(re);
  return m ? m[1] : '';
}

function parseDocxRun(runXml) {
  const rPr = extractXmlBlocks(runXml, 'w:rPr')[0] || '';
  if (/<w:br\b[^>]*w:type="page"/i.test(runXml)) {
    return { pageBreak: true, html: '' };
  }
  const hasBr = /<w:br\b/i.test(runXml);
  const textParts = [];
  const textRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\s*\/>/gi;
  let m;
  while ((m = textRe.exec(runXml))) {
    if (m[0].startsWith('<w:tab')) {
      textParts.push('    ');
    } else {
      textParts.push(decodeXmlEntities(m[1] || ''));
    }
  }
  let inner = escapeHtml(textParts.join(''));
  if (!inner && hasBr) return { pageBreak: false, html: '<br>' };
  if (!inner) return { pageBreak: false, html: '' };
  if (hasBr) inner += '<br>';

  const isBold = /<w:b\b(?![^>]*w:val="0")(?![^>]*w:val="false")/i.test(rPr);
  const isItalic = /<w:i\b(?![^>]*w:val="0")(?![^>]*w:val="false")/i.test(rPr);
  const isUnderline = /<w:u\b(?![^>]*w:val="none")/i.test(rPr);
  const isStrike = /<w:strike\b(?![^>]*w:val="0")/i.test(rPr);

  const szMatch = rPr.match(/<w:sz\b[^>]*w:val="(\d+)"/i);
  const colorMatch = rPr.match(/<w:color\b[^>]*w:val="([0-9a-f]{6})"/i);
  const fontMatch = rPr.match(/<w:rFonts\b[^>]*w:ascii="([^"]+)"/i);
  const styles = [];
  if (szMatch) {
    const pt = Math.max(8, Math.min(48, Math.round(Number(szMatch[1]) / 2)));
    styles.push(`font-size:${pt}pt`);
  }
  if (colorMatch && colorMatch[1].toLowerCase() !== 'auto') {
    styles.push(`color:#${colorMatch[1]}`);
  }
  if (fontMatch && /^[a-z0-9 ,_-]{2,40}$/i.test(fontMatch[1])) {
    styles.push(`font-family:${fontMatch[1]}`);
  }

  if (isBold) inner = `<strong>${inner}</strong>`;
  if (isItalic) inner = `<em>${inner}</em>`;
  if (isUnderline) inner = `<u>${inner}</u>`;
  if (isStrike) inner = `<s>${inner}</s>`;
  if (styles.length) inner = `<span style="${styles.join(';')}">${inner}</span>`;
  return { pageBreak: false, html: inner };
}

function parseDocxParagraph(pXml, insideCell = false) {
  const pPr = extractXmlBlocks(pXml, 'w:pPr')[0] || '';
  const styleVal = (pPr.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/i) || [])[1] || '';
  const jcVal = (pPr.match(/<w:jc\b[^>]*w:val="([^"]+)"/i) || [])[1] || '';
  const isList = /<w:numPr\b/i.test(pPr);
  const indLeft = (pPr.match(/<w:ind\b[^>]*w:left="(\d+)"/i) || [])[1];
  const firstLine = (pPr.match(/<w:ind\b[^>]*w:firstLine="(\d+)"/i) || [])[1];

  const runs = extractXmlBlocks(pXml, 'w:r');
  let body = '';
  let hasPageBreak = false;
  for (const r of runs) {
    const parsed = parseDocxRun(r);
    if (parsed.pageBreak) hasPageBreak = true;
    body += parsed.html;
  }

  // Fallback for direct text inside hyperlinks or smart tags
  if (!body && /<w:hyperlink\b/i.test(pXml)) {
    const linkTexts = [];
    for (const hl of extractXmlBlocks(pXml, 'w:hyperlink')) {
      for (const hr of extractXmlBlocks(hl, 'w:r')) linkTexts.push(parseDocxRun(hr).html);
    }
    body = linkTexts.join('');
  }

  const alignMap = { center: 'center', right: 'right', both: 'justify', justify: 'justify', left: 'left' };
  const styles = [];
  if (alignMap[jcVal]) styles.push(`text-align:${alignMap[jcVal]}`);
  if (indLeft && Number(indLeft) > 0 && !isList) {
    styles.push(`margin-left:${Math.round(Number(indLeft) / 56.69)}mm`);
  }
  if (firstLine && Number(firstLine) > 0) {
    styles.push(`text-indent:${Math.round(Number(firstLine) / 56.69)}mm`);
  }

  let tag = 'p';
  if (/^Heading1|^Заголовок1|^Title$/i.test(styleVal)) tag = 'h1';
  else if (/^Heading2|^Заголовок2|^Subtitle$/i.test(styleVal)) tag = 'h2';
  else if (/^Heading3|^Заголовок3/i.test(styleVal)) tag = 'h3';
  else if (isList) tag = 'li';

  const styleAttr = styles.length ? ` style="${styles.join(';')}"` : '';
  const content = body.trim() ? body : (insideCell ? '' : '<br>');
  let out = `<${tag}${styleAttr}>${content}</${tag}>`;
  if (hasPageBreak) out += '<hr class="sm-page-break">';
  return { tag, html: out };
}

function parseDocxTable(tblXml) {
  const rows = extractXmlBlocks(tblXml, 'w:tr');
  const rowHtmls = [];
  for (const tr of rows) {
    const cells = extractXmlBlocks(tr, 'w:tc');
    const cellHtmls = [];
    for (const tc of cells) {
      const tcPr = extractXmlBlocks(tc, 'w:tcPr')[0] || '';
      const span = Number((tcPr.match(/<w:gridSpan\b[^>]*w:val="(\d+)"/i) || [])[1] || 1);
      const cellParas = extractXmlBlocks(tc, 'w:p').map((p) => parseDocxParagraph(p, true).html).join('');
      const spanAttr = span > 1 ? ` colspan="${Math.min(30, span)}"` : '';
      cellHtmls.push(`<td${spanAttr} style="border:1px solid #334155;padding:4px 6px;vertical-align:top">${cellParas || '<br>'}</td>`);
    }
    rowHtmls.push(`<tr>${cellHtmls.join('')}</tr>`);
  }
  return `<table style="width:100%;border-collapse:collapse;margin:6px 0"><tbody>${rowHtmls.join('')}</tbody></table>`;
}

export function parseDocxBytesToDocModel(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const archive = unzipSync(u8);
  const docEntry = archive['word/document.xml'];
  if (!docEntry) {
    throw new Error('docx_missing_document_xml');
  }
  const xml = strFromU8(docEntry);

  // Page setup from last w:sectPr
  const sectPrs = extractXmlBlocks(xml, 'w:sectPr');
  const sectPr = sectPrs[sectPrs.length - 1] || '';
  const orientMatch = sectPr.match(/<w:pgSz\b[^>]*w:orient="([^"]+)"/i);
  const wMatch = sectPr.match(/<w:pgSz\b[^>]*w:w="(\d+)"/i);
  const hMatch = sectPr.match(/<w:pgSz\b[^>]*w:h="(\d+)"/i);
  let pageOrientation = 'portrait';
  if (orientMatch?.[1] === 'landscape' || (wMatch && hMatch && Number(wMatch[1]) > Number(hMatch[1]))) {
    pageOrientation = 'landscape';
  }
  const pgMar = sectPr.match(/<w:pgMar\b[^>]*>/i)?.[0] || '';
  const twipToMm = (attr, fallback) => {
    const val = Number(extractAttr(pgMar, attr));
    return Number.isFinite(val) && val > 0 ? Math.round(val / 56.6929) : fallback;
  };
  const pageMarginsMm = normalizePageMargins({
    top: twipToMm('w:top', DEFAULT_PAGE_MARGINS_MM.top),
    right: twipToMm('w:right', DEFAULT_PAGE_MARGINS_MM.right),
    bottom: twipToMm('w:bottom', DEFAULT_PAGE_MARGINS_MM.bottom),
    left: twipToMm('w:left', DEFAULT_PAGE_MARGINS_MM.left),
  });

  // Walk direct children of <w:body> (paragraphs and tables in document order)
  const bodyBlock = extractXmlBlocks(xml, 'w:body')[0] || xml;
  const parts = [];
  let inList = false;
  let pos = 0;
  while (pos < bodyBlock.length) {
    const nextP = bodyBlock.indexOf('<w:p', pos);
    const nextT = bodyBlock.indexOf('<w:tbl', pos);
    const candidates = [
      nextP >= 0 ? { type: 'p', idx: nextP } : null,
      nextT >= 0 ? { type: 'tbl', idx: nextT } : null,
    ].filter(Boolean);
    if (!candidates.length) break;
    candidates.sort((a, b) => a.idx - b.idx);
    const first = candidates[0];
    const ch = bodyBlock[first.idx + (first.type === 'p' ? 4 : 6)];
    if (ch !== '>' && ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '/') {
      pos = first.idx + 3;
      continue;
    }
    if (first.type === 'p') {
      const slice = extractXmlBlocks(bodyBlock.slice(first.idx), 'w:p')[0];
      if (!slice) break;
      const parsed = parseDocxParagraph(slice, false);
      if (parsed.tag === 'li') {
        if (!inList) {
          parts.push('<ul>');
          inList = true;
        }
        parts.push(parsed.html);
      } else {
        if (inList) {
          parts.push('</ul>');
          inList = false;
        }
        parts.push(parsed.html);
      }
      pos = first.idx + slice.length;
    } else {
      if (inList) {
        parts.push('</ul>');
        inList = false;
      }
      const slice = extractXmlBlocks(bodyBlock.slice(first.idx), 'w:tbl')[0];
      if (!slice) break;
      parts.push(parseDocxTable(slice));
      pos = first.idx + slice.length;
    }
  }
  if (inList) parts.push('</ul>');

  const sanitized = sanitizeDocHtml(parts.join(''));
  return {
    html: sanitized,
    pageOrientation,
    pageMarginsMm,
    plainPreview: htmlToPlainText(sanitized).slice(0, 500),
  };
}

function buildDynamicTableHtml(type, stats) {
  if (type === 'students') {
    const list = Array.isArray(stats?.students) ? stats.students : [];
    const rows = list.length
      ? list.map((s, idx) => (
        `<tr><td>${idx + 1}</td><td>${escapeHtml(s.full_name || '')}</td><td>${escapeHtml(s.class_code || '')}</td><td>${escapeHtml(s.birth_year ?? '')}</td><td>${escapeHtml(s.gender === 'female' ? 'Д' : s.gender === 'male' ? 'П' : '')}</td></tr>`
      )).join('')
      : '<tr><td>1</td><td></td><td></td><td></td><td></td></tr>';
    return `<table class="sm-doc-auto-table" style="width:100%;border-collapse:collapse;margin:6px 0"><thead><tr><th>№</th><th>Ному насаб</th><th>Синф</th><th>Соли таваллуд</th><th>Ҷинс</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  if (type === 'workloads') {
    const list = Array.isArray(stats?.workloads) ? stats.workloads : [];
    const rows = list.length
      ? list.map((w, idx) => (
        `<tr><td>${idx + 1}</td><td>${escapeHtml(w.teacher_name || '')}</td><td>${escapeHtml(w.subject || '')}</td><td>${escapeHtml(w.weekly_hours ?? '')}</td><td>${escapeHtml(w.category || '')}</td></tr>`
      )).join('')
      : '<tr><td>1</td><td></td><td></td><td></td><td></td></tr>';
    return `<table class="sm-doc-auto-table" style="width:100%;border-collapse:collapse;margin:6px 0"><thead><tr><th>№</th><th>Омӯзгор</th><th>Фан</th><th>Соат/ҳафта</th><th>Дараҷа</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  return '';
}

export function buildAutofillValueMap(autofill = {}, lang = 'tg') {
  const org = autofill?.organization || {};
  const dir = autofill?.director || {};
  const usr = autofill?.user || {};
  const stats = autofill?.stats || {};
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const acadStart = now.getMonth() >= 8 ? yyyy : yyyy - 1;
  const posCode = usr.position_code || '';

  return {
    'school.name': String(org.name || ''),
    'school.code': String(org.school_code || ''),
    'school.region': String(org.region_name || ''),
    'school.district': String(org.district_name || ''),
    'school.jamoat': String(org.jamoat_name || ''),
    'school.village': String(org.village_name || ''),
    'school.type': String(org.institution_type || ''),
    'school.shifts': String(org.institution_shifts || ''),
    'director.full_name': String(dir.full_name || ''),
    'director.phone': String(dir.phone || ''),
    'user.full_name': String(usr.full_name || ''),
    'user.position': posCode ? formatPositionTitle(posCode, lang === 'ru' ? 'ru' : 'tg') : '',
    'user.phone': String(usr.phone || ''),
    'user.birth_date': String(usr.birth_date || ''),
    'user.method_group': String(usr.custom_method_name || ''),
    'date.today': `${dd}.${mm}.${yyyy}`,
    'date.year': String(yyyy),
    'date.academic_year': `${acadStart}–${acadStart + 1}`,
    'stats.students_total': String(stats.students_total ?? 0),
    'stats.students_boys': String(stats.students_boys ?? 0),
    'stats.students_girls': String(stats.students_girls ?? 0),
    'table.students': buildDynamicTableHtml('students', stats),
    'table.workloads': buildDynamicTableHtml('workloads', stats),
  };
}

export function renderTemplateWithAutofill(templateHtml, autofill = {}, options = {}) {
  const lang = options.lang === 'ru' ? 'ru' : 'tg';
  const editMode = options.editMode === 'fields_only' ? 'fields_only' : 'full';
  const valueMap = buildAutofillValueMap(autofill, lang);
  const clean = sanitizeDocHtml(templateHtml || '');

  return clean.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, rawKey) => {
    const key = rawKey.toLowerCase();
    if (key === 'table.students' || key === 'table.workloads') {
      return valueMap[key] || '';
    }
    const rawVal = Object.prototype.hasOwnProperty.call(valueMap, key) ? valueMap[key] : '';
    const display = rawVal ? escapeHtml(rawVal) : `[${escapeHtml(key)}]`;
    if (editMode === 'fields_only') {
      return `<span class="sm-doc-field" data-sm-field="1" data-sm-field-key="${escapeHtml(key)}" contenteditable="true">${display}</span>`;
    }
    return rawVal
      ? `<span class="sm-doc-autofilled" data-sm-field-key="${escapeHtml(key)}">${display}</span>`
      : `<span class="sm-doc-field" data-sm-field="1" data-sm-field-key="${escapeHtml(key)}">${display}</span>`;
  });
}

function uint8ToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToUint8(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function compressDocPayload(payloadObj) {
  const safeObj = {
    v: 1,
    title: String(payloadObj?.title || '').slice(0, 180),
    html: sanitizeDocHtml(payloadObj?.html || '<p><br></p>'),
    pageOrientation: payloadObj?.pageOrientation === 'landscape' ? 'landscape' : 'portrait',
    pageMarginsMm: normalizePageMargins(payloadObj?.pageMarginsMm),
    updatedAt: payloadObj?.updatedAt || new Date().toISOString(),
  };
  const jsonText = JSON.stringify(safeObj);
  const rawBytes = strToU8(jsonText);
  const compressed = gzipSync(rawBytes, { level: 6 });
  return {
    gzipB64: uint8ToBase64(compressed),
    compressedBytes: compressed.byteLength,
    rawBytes: rawBytes.byteLength,
  };
}

export function decompressDocPayload(gzipB64) {
  const compressed = base64ToUint8(gzipB64);
  const rawBytes = gunzipSync(compressed);
  if (rawBytes.byteLength > 4 * 1024 * 1024) {
    throw new Error('doc_payload_too_large');
  }
  const parsed = JSON.parse(strFromU8(rawBytes));
  return {
    v: Number(parsed?.v || 1),
    title: String(parsed?.title || ''),
    html: sanitizeDocHtml(parsed?.html || '<p><br></p>'),
    pageOrientation: parsed?.pageOrientation === 'landscape' ? 'landscape' : 'portrait',
    pageMarginsMm: normalizePageMargins(parsed?.pageMarginsMm),
    updatedAt: String(parsed?.updatedAt || ''),
  };
}
