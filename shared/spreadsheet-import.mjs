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
  if (/^(м|m|male|писар|мард|муж|мужской|п)$/i.test(val)) return 'male';
  if (/^(ж|f|д|female|духтар|зан|жен|женский)$/i.test(val)) return 'female';
  return '';
}

function normalizeBirthDateAndYear(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { birth_date: null, birth_year: null, matchedText: '' };

  // ISO YYYY-MM-DD or YYYY.MM.DD
  const iso = s.match(/\b(199\d|20[0-2]\d)[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (iso) {
    const yr = Number(iso[1]);
    const mo = Number(iso[2]);
    const dy = Number(iso[3]);
    if (yr >= 1995 && yr <= 2026 && mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
      return {
        birth_date: `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`,
        birth_year: yr,
        matchedText: iso[0],
      };
    }
  }

  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](199\d|20[0-2]\d)\b/);
  if (dmy) {
    const dy = Number(dmy[1]);
    const mo = Number(dmy[2]);
    const yr = Number(dmy[3]);
    if (yr >= 1995 && yr <= 2026 && mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
      return {
        birth_date: `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`,
        birth_year: yr,
        matchedText: dmy[0],
      };
    }
  }

  // Excel 1900 serial date (approx 1995-01-01 = 34700 .. 2026-12-31 = 46387)
  if (/^\d{5}(?:\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 34700 && serial <= 46750) {
      const utc = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      const yr = utc.getUTCFullYear();
      if (yr >= 1995 && yr <= 2026) {
        const mo = String(utc.getUTCMonth() + 1).padStart(2, '0');
        const dy = String(utc.getUTCDate()).padStart(2, '0');
        return {
          birth_date: `${yr}-${mo}-${dy}`,
          birth_year: yr,
          matchedText: s,
        };
      }
    }
  }

  const yrMatch = s.match(/\b(199\d|20[0-2]\d)\b/);
  if (yrMatch) {
    const yr = Number(yrMatch[1]);
    if (yr >= 1995 && yr <= 2026) {
      return { birth_date: null, birth_year: yr, matchedText: yrMatch[0] };
    }
  }
  return { birth_date: null, birth_year: null, matchedText: '' };
}

function normalizeBirthYear(raw) {
  return normalizeBirthDateAndYear(raw).birth_year;
}

export function formatBirthDateDisplay(birthDate, birthYear) {
  const s = String(birthDate || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  return birthYear ? String(birthYear) : '';
}

function normalizeHeaderField(header) {
  const h = String(header || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!h) return '';
  if (/^(№|#|n|no|п\/п|тартиб|рақам)$/.test(h)) return 'index';
  if (/(ному?\s*насаб|фио|ф\.и\.о|хонанда|ученик|full\s*name|name|фамилия|ном)/i.test(h)) return 'full_name';
  if (/(синф|класс|class|grade)/i.test(h)) return 'class_code';
  if (/(таваллуд|birth|год\s*рожд|дата\s*рожд|санаи|соли|д\.р\.|dob)/i.test(h)) return 'birth_year';
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

  const bd = normalizeBirthDateAndYear(line);
  if (bd.matchedText) line = line.replace(bd.matchedText, '').trim();

  let gender = '';
  const gMatch = line.match(/(?:^|[\s,;])(писар|духтар|мард|зан|муж|жен|male|female|м|ж|п)(?:$|[\s,;])/i);
  if (gMatch) {
    gender = normalizeGender(gMatch[1]);
    if (gender) line = line.replace(gMatch[0], ' ').trim();
  }

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
    birth_date: bd.birth_date,
    birth_year: bd.birth_year,
    gender,
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
        birth_date: null,
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
        else if (key === 'birth_year') {
          const bd = normalizeBirthDateAndYear(val);
          rec.birth_date = bd.birth_date || rec.birth_date;
          rec.birth_year = bd.birth_year || rec.birth_year;
        }
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
      let birthDate = null;
      let birthYear = null;
      let gender = '';
      let phone = '';
      let guardian = '';
      for (let i = 1; i < filtered.length; i += 1) {
        const v = filtered[i];
        const bd = !birthDate && !birthYear ? normalizeBirthDateAndYear(v) : { birth_date: null, birth_year: null };
        if (!cls && /^(1[01]|[1-9])\s*[А-ЯЁA-Z]$/i.test(v)) cls = normalizeClassCode(v);
        else if (!birthDate && !birthYear && (bd.birth_date || bd.birth_year)) {
          birthDate = bd.birth_date;
          birthYear = bd.birth_year;
        }
        else if (!gender && normalizeGender(v)) gender = normalizeGender(v);
        else if (!phone && /\d{7,}/.test(v.replace(/[\s+()-]/g, ''))) phone = v;
        else if (!guardian && v.length >= 3) guardian = v;
      }
      out.push({
        full_name: name,
        class_code: cls || normalizeClassCode(defaultClassCode || '5А'),
        birth_date: birthDate,
        birth_year: birthYear,
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
  const fmt = lower.endsWith('.tsv') ? 'tsv' : (lower.endsWith('.txt') ? 'txt' : 'csv');
  return { format: fmt, rows: matrixToStudentRows(matrix, defaultClassCode) };
}

export function buildStudentsCsv(rows) {
  const header = ['№', 'Ному насаб', 'Синф', 'Санаи таваллуд', 'Ҷинс', 'Волидайн', 'Телефон'];
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
      esc(formatBirthDateDisplay(r.birth_date, r.birth_year)),
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
