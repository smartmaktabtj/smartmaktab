import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const decodeXmlEntities = text => String(text || '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

const xmlEscape = text => String(text || '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[ch]));

function colLettersToIndex(ref) {
  const letters = String(ref || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  let idx = 0;
  for (let i = 0; i < letters.length; i += 1) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, idx - 1);
}

function normalizeClassCode(raw, fallbackClass = '') {
  const cleaned = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!cleaned) return String(fallbackClass || '').trim().toUpperCase();
  return cleaned.slice(0, 12);
}

function normalizeGender(raw) {
  const val = String(raw || '').trim().toLowerCase();
  if (!val) return '';
  if (/^(м|m|male|писар|мард|муж|мужской)$/i.test(val)) return 'male';
  if (/^(ж|f|д|female|духтар|зан|жен|женский)$/i.test(val)) return 'female';
  return '';
}

function normalizeBirthYear(raw) {
  const m = String(raw || '').match(/\b(199\d|20[0-2]\d)\b/);
  if (!m) return null;
  const yr = Number(m[1]);
  return yr >= 1995 && yr <= 2026 ? yr : null;
}

function normalizeHeaderField(header) {
  const h = String(header || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!h) return '';
  if (/^(№|#|n|no|п\/п|тартиб|рақам)$/.test(h)) return 'index';
  if (/(ному?\s*насаб|фио|ф\.и\.о|хонанда|ученик|full\s*name|name|фамилия)/i.test(h)) return 'full_name';
  if (/(синф|класс|class|grade)/i.test(h)) return 'class_code';
  if (/(таваллуд|birth|год\s*рожд|соли)/i.test(h)) return 'birth_year';
  if (/(ҷинс|пол|gender|sex)/i.test(h)) return 'gender';
  if (/(волид|падар|модар|родител|guardian|parent)/i.test(h)) return 'guardian_name';
  if (/(телеф|тел|phone|mob|рақами\s*тамос)/i.test(h)) return 'guardian_phone';
  if (/(рамз|код|id|code|личн)/i.test(h)) return 'student_code';
  return '';
}

function extractTextFromXmlRuns(fragment) {
  const out = [];
  const runRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g;
  let m;
  while ((m = runRe.exec(fragment)) !== null) {
    if (m[1] !== undefined) out.push(decodeXmlEntities(m[1]));
    else out.push(' ');
  }
  return out.join('').replace(/\s+/g, ' ').trim();
}

export function parseDocxMatrix(bytes) {
  const archive = unzipSync(new Uint8Array(bytes));
  const docEntry = archive['word/document.xml'];
  if (!docEntry) throw new Error('word/document.xml not found');
  const xml = strFromU8(docEntry);
  const rows = [];

  const tableMatches = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) || [];
  for (const tbl of tableMatches) {
    const trMatches = tbl.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    for (const tr of trMatches) {
      const tcMatches = tr.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
      const row = tcMatches.map(tc => {
        const paras = tc.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [tc];
        return paras.map(extractTextFromXmlRuns).filter(Boolean).join(' ').trim();
      });
      if (row.some(Boolean)) rows.push(row);
    }
  }

  if (!rows.length) {
    const paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    for (const p of paras) {
      const text = extractTextFromXmlRuns(p);
      if (!text) continue;
      if (text.includes('\t')) rows.push(text.split('\t').map(s => s.trim()));
      else if (text.includes(';')) rows.push(text.split(';').map(s => s.trim()));
      else rows.push([text]);
    }
  }
  return rows;
}

export function parseXlsxMatrix(bytes) {
  const archive = unzipSync(new Uint8Array(bytes));
  const sharedStrings = [];
  if (archive['xl/sharedStrings.xml']) {
    const ssXml = strFromU8(archive['xl/sharedStrings.xml']);
    const siMatches = ssXml.match(/<si\b[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
      const joined = tMatches.map(t => decodeXmlEntities(t.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, ''))).join('');
      sharedStrings.push(joined);
    }
  }

  const sheetNames = Object.keys(archive)
    .filter(k => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!sheetNames.length) throw new Error('xlsx worksheet not found');

  const sheetXml = strFromU8(archive[sheetNames[0]]);
  const matrix = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rMatch;
  while ((rMatch = rowRe.exec(sheetXml)) !== null) {
    const rowBody = rMatch[1];
    const rowCells = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cMatch;
    let autoCol = 0;
    while ((cMatch = cellRe.exec(rowBody)) !== null) {
      const attrs = cMatch[1] || '';
      const cellInner = cMatch[2] || '';
      const refMatch = attrs.match(/\br="([A-Za-z]+\d+)"/);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : autoCol;
      autoCol = colIdx + 1;
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : '';

      let value = '';
      if (cellType === 'inlineStr') {
        const tMatches = cellInner.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
        value = tMatches.map(t => decodeXmlEntities(t.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, ''))).join('');
      } else {
        const vMatch = cellInner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const rawV = vMatch ? decodeXmlEntities(vMatch[1]) : '';
        if (cellType === 's') {
          const sIdx = Number(rawV);
          value = Number.isInteger(sIdx) && sharedStrings[sIdx] !== undefined ? sharedStrings[sIdx] : '';
        } else {
          value = rawV;
        }
      }
      rowCells[colIdx] = String(value || '').trim();
    }
    const normalized = Array.from({ length: rowCells.length }, (_, i) => rowCells[i] || '');
    if (normalized.some(Boolean)) matrix.push(normalized);
  }
  return matrix;
}

export function parseCsvMatrix(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  const sample = lines.slice(0, 5).join('\n');
  const delim = sample.includes('\t') ? '\t' : (sample.split(';').length > sample.split(',').length ? ';' : ',');

  const rows = [];
  for (const line of lines) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delim && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    if (out.some(Boolean)) rows.push(out);
  }
  return rows;
}

function parseSingleLineFallback(rawText, defaultClassCode) {
  let line = String(rawText || '').trim();
  line = line.replace(/^\d+[.)]\s*/, '').trim();
  if (!line || line.length < 3) return null;
  if (/^(№|#|фио|ному\s*насаб|рӯйхати|список)/i.test(line)) return null;

  const year = normalizeBirthYear(line);
  if (year) line = line.replace(String(year), '').trim();

  let cls = '';
  const clsMatch = line.match(/\b(1[01]|[1-9])\s*[-–]?\s*([А-ЯЁA-Z])\b/u);
  if (clsMatch) {
    cls = normalizeClassCode(`${clsMatch[1]}${clsMatch[2]}`);
    line = line.replace(clsMatch[0], '').trim();
  }
  const fullName = line.replace(/\s{2,}/g, ' ').replace(/^[-–,;:\s]+|[-–,;:\s]+$/g, '').trim();
  if (!fullName) return null;
  return {
    full_name: fullName,
    class_code: cls || normalizeClassCode(defaultClassCode || '5А'),
    birth_year: year,
    gender: '',
    guardian_name: '',
    guardian_phone: '',
    student_code: '',
  };
}

export function matrixToStudentRows(matrix, defaultClassCode = '5А') {
  if (!Array.isArray(matrix) || !matrix.length) return [];
  const firstRow = matrix[0] || [];
  const headerKeys = firstRow.map(normalizeHeaderField);
  const hasHeader = headerKeys.some(k => k && k !== 'index');

  const out = [];
  const startIdx = hasHeader ? 1 : 0;

  for (let r = startIdx; r < matrix.length; r += 1) {
    const cells = matrix[r] || [];
    if (!cells.some(Boolean)) continue;

    if (cells.length === 1) {
      const parsed = parseSingleLineFallback(cells[0], defaultClassCode);
      if (parsed) out.push(parsed);
      continue;
    }

    if (hasHeader) {
      const rec = {
        full_name: '',
        class_code: '',
        birth_year: null,
        gender: '',
        guardian_name: '',
        guardian_phone: '',
        student_code: '',
      };
      for (let c = 0; c < cells.length; c += 1) {
        const key = headerKeys[c] || '';
        const val = String(cells[c] || '').trim();
        if (!val || key === 'index') continue;
        if (key === 'full_name') rec.full_name = val;
        else if (key === 'class_code') rec.class_code = normalizeClassCode(val);
        else if (key === 'birth_year') rec.birth_year = normalizeBirthYear(val);
        else if (key === 'gender') rec.gender = normalizeGender(val);
        else if (key === 'guardian_name') rec.guardian_name = val;
        else if (key === 'guardian_phone') rec.guardian_phone = val;
        else if (key === 'student_code') rec.student_code = val;
      }
      if (!rec.full_name) {
        const candidate = cells.find((v, i) => headerKeys[i] !== 'index' && !/^\d+$/.test(v.trim()) && v.trim().length > 2);
        if (candidate) rec.full_name = candidate.trim();
      }
      if (!rec.class_code) rec.class_code = normalizeClassCode(defaultClassCode || '5А');
      if (rec.full_name) out.push(rec);
    } else {
      const nonEmpty = cells.map(s => String(s || '').trim()).filter(Boolean);
      const filtered = /^\d{1,4}$/.test(nonEmpty[0] || '') ? nonEmpty.slice(1) : nonEmpty;
      if (!filtered.length) continue;
      const name = filtered[0];
      if (/^(фио|ному\s*насаб|хонанда)$/i.test(name)) continue;
      let cls = '';
      let birth = null;
      let gender = '';
      let phone = '';
      let guardian = '';
      for (let i = 1; i < filtered.length; i += 1) {
        const v = filtered[i];
        if (!cls && /^(1[01]|[1-9])\s*[А-ЯЁA-Z]$/i.test(v)) cls = normalizeClassCode(v);
        else if (!birth && normalizeBirthYear(v)) birth = normalizeBirthYear(v);
        else if (!gender && normalizeGender(v)) gender = normalizeGender(v);
        else if (!phone && /\d{7,}/.test(v.replace(/[\s+()-]/g, ''))) phone = v;
        else if (!guardian && v.length >= 3) guardian = v;
      }
      out.push({
        full_name: name,
        class_code: cls || normalizeClassCode(defaultClassCode || '5А'),
        birth_year: birth,
        gender,
        guardian_name: guardian,
        guardian_phone: phone,
        student_code: '',
      });
    }
  }
  return out;
}

export function parseStudentImportFile(bufferOrText, fileName = '', defaultClassCode = '5А') {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.docx')) {
    const matrix = parseDocxMatrix(bufferOrText);
    return { format: 'docx', rows: matrixToStudentRows(matrix, defaultClassCode) };
  }
  if (lower.endsWith('.xlsx')) {
    const matrix = parseXlsxMatrix(bufferOrText);
    return { format: 'xlsx', rows: matrixToStudentRows(matrix, defaultClassCode) };
  }
  const text = typeof bufferOrText === 'string'
    ? bufferOrText
    : new TextDecoder('utf-8').decode(new Uint8Array(bufferOrText));
  const matrix = parseCsvMatrix(text);
  return { format: lower.endsWith('.tsv') ? 'tsv' : 'csv', rows: matrixToStudentRows(matrix, defaultClassCode) };
}

export function buildStudentsCsv(rows) {
  const header = ['№', 'Ному насаб', 'Синф', 'Соли таваллуд', 'Ҷинс', 'Волидайн', 'Телефон'];
  const esc = v => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  (rows || []).forEach((r, idx) => {
    lines.push([
      idx + 1,
      esc(r.full_name || ''),
      esc(r.class_code || ''),
      esc(r.birth_year || ''),
      esc(r.gender === 'male' ? 'Писар' : (r.gender === 'female' ? 'Духтар' : '')),
      esc(r.guardian_name || ''),
      esc(r.guardian_phone || ''),
    ].join(','));
  });
  return '\uFEFF' + lines.join('\r\n');
}

export function buildSimpleDocxBytes(title, headers, rowArrays) {
  const makeCell = (text, bold = false) =>
    `<w:tc><w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;
  const headerRow = `<w:tr>${headers.map(h => makeCell(h, true)).join('')}</w:tr>`;
  const bodyRows = (rowArrays || []).map(arr => `<w:tr>${arr.map(v => makeCell(v, false)).join('')}</w:tr>`).join('');
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`
    + `<w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${xmlEscape(title)}</w:t></w:r></w:p>`
    + `<w:tbl><w:tblPr><w:tblBorders>`
    + `<w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/>`
    + `<w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>`
    + `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/>`
    + `<w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>`
    + `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>`
    + `<w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>`
    + `</w:tblBorders></w:tblPr>${headerRow}${bodyRows}</w:tbl>`
    + `<w:sectPr/></w:body></w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
    + `</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
    + `</Relationships>`;

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    'word/document.xml': strToU8(docXml),
  });
}
