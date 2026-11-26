/* Pure-JS Word (.docx) MiniZip OOXML exporter + PDF gateway/print exporter for Aliya results. */

let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(buf) {
  const table = getCrcTable();
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

const enc = new TextEncoder();

export function buildZip(files) {
  const localHeaders = [];
  const centralDirs = [];
  let offset = 0;

  for (const [path, raw] of Object.entries(files)) {
    const data = typeof raw === 'string' ? enc.encode(raw) : raw;
    const nameBuf = enc.encode(path);
    const crc = crc32(data);
    const size = data.length;

    const lh = new Uint8Array(30 + nameBuf.length + size);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(10, 0x4821, true);
    lv.setUint16(12, 0x556b, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBuf.length, true);
    lh.set(nameBuf, 30);
    lh.set(data, 30 + nameBuf.length);
    localHeaders.push(lh);

    const cd = new Uint8Array(46 + nameBuf.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0x4821, true);
    cv.setUint16(12, 0x556b, true);
    cv.setUint32(14, crc, true);
    cv.setUint32(18, size, true);
    cv.setUint32(22, size, true);
    cv.setUint16(26, nameBuf.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBuf, 46);
    centralDirs.push(cd);
    offset += lh.length;
  }

  const cdSize = centralDirs.reduce((sum, item) => sum + item.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centralDirs.length, true);
  ev.setUint16(10, centralDirs.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + cdSize + 22);
  let cur = 0;
  for (const lh of localHeaders) { out.set(lh, cur); cur += lh.length; }
  for (const cd of centralDirs) { out.set(cd, cur); cur += cd.length; }
  out.set(eocd, cur);
  return out;
}

const xmlEscape = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function runXml(text, opts = {}) {
  const { bold, italic, color, size, font } = opts;
  return `<w:r><w:rPr><w:rFonts w:ascii="${font || 'Calibri'}" w:hAnsi="${font || 'Calibri'}" w:cs="${font || 'Calibri'}"/>` +
    (bold ? '<w:b/>' : '') + (italic ? '<w:i/>' : '') +
    (color ? `<w:color w:val="${color}"/>` : '') +
    (size ? `<w:sz w:val="${size}"/>` : '') +
    `</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function inlineRuns(line, baseSize = 22) {
  const parts = String(line || '').split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g);
  return parts.filter(Boolean).map(p => {
    if (p.startsWith('**') && p.endsWith('**')) return runXml(p.slice(2, -2), { bold: true, color: '0D1B2A', size: baseSize });
    if (p.startsWith('[[') && p.endsWith(']]')) return runXml(p.slice(2, -2), { bold: true, italic: true, color: '9A6E1C', size: baseSize, font: 'Georgia' });
    return runXml(p, { color: '1F2937', size: baseSize });
  }).join('');
}

function markdownToBodyXml({ title, bookName, pageLabel, markdown }) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  const out = [];
  out.push(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="10" w:space="6" w:color="C9A84C"/></w:pBdr><w:spacing w:after="140"/></w:pPr>${runXml(title || 'Алия · SmartMaktab', { bold: true, size: 32, color: '0D1B2A' })}</w:p>`);
  if (bookName || pageLabel) {
    out.push(`<w:p><w:pPr><w:spacing w:after="180"/></w:pPr>${runXml([bookName, pageLabel].filter(Boolean).join(' · '), { italic: true, size: 20, color: '4A5D73' })}</w:p>`);
  }

  let tableRows = [];
  const flushTable = () => {
    if (!tableRows.length) return;
    const rowsXml = tableRows.map((cells, rIdx) => {
      const bg = rIdx === 0 ? 'E9EFF7' : rIdx % 2 === 1 ? 'FFFFFF' : 'F7F9FC';
      const tcXml = cells.map(c => `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${bg}"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="D0D7E2"/><w:bottom w:val="single" w:sz="4" w:color="D0D7E2"/><w:left w:val="single" w:sz="4" w:color="D0D7E2"/><w:right w:val="single" w:sz="4" w:color="D0D7E2"/></w:tcBorders></w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>${inlineRuns(c, 20)}</w:p></w:tc>`).join('');
      return `<w:tr>${tcXml}</w:tr>`;
    }).join('');
    out.push(`<w:tbl><w:tblPr><w:tblW w:w="9355" w:type="dxa"/></w:tblPr>${rowsXml}</w:tbl>`);
    tableRows = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushTable(); continue; }
    if (line.startsWith('@@')) continue;
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue;
      tableRows.push(cells);
      continue;
    }
    flushTable();
    if (line.startsWith('### ')) {
      out.push(`<w:p><w:pPr><w:spacing w:before="140" w:after="60"/></w:pPr>${runXml(line.slice(4), { bold: true, size: 24, color: '1A3A5C' })}</w:p>`);
    } else if (line.startsWith('## ') || line.startsWith('# ')) {
      const txt = line.replace(/^#+\s+/, '');
      out.push(`<w:p><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>${runXml(txt, { bold: true, size: 27, color: '0D1B2A' })}</w:p>`);
    } else if (/^[-•*]\s+/.test(line)) {
      out.push(`<w:p><w:pPr><w:ind w:left="360"/><w:spacing w:after="60"/></w:pPr>${runXml('•  ', { bold: true, color: 'C9A84C', size: 22 })}${inlineRuns(line.replace(/^[-•*]\s+/, ''), 22)}</w:p>`);
    } else {
      out.push(`<w:p><w:pPr><w:spacing w:after="100" w:line="280" w:lineRule="auto"/></w:pPr>${inlineRuns(line, 22)}</w:p>`);
    }
  }
  flushTable();
  return out.join('\n');
}

export function createAliyaDocxBytes({ title, bookName, pageLabel, markdown }) {
  const bodyXml = markdownToBodyXml({ title, bookName, pageLabel, markdown });
  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${W_NS}><w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="C9A84C"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9355"/></w:tabs><w:spacing w:before="0" w:after="0"/></w:pPr>${runXml('✦ Алия · SmartMaktab & Kitobkhona', { bold: true, color: '0D1B2A', size: 17 })}<w:r><w:tab/></w:r>${runXml([title, bookName].filter(Boolean).join(' · ').slice(0, 68), { color: '4A5D73', size: 15 })}</w:p></w:hdr>`;
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${W_NS}><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="D9DEE5"/></w:pBdr><w:spacing w:before="0" w:after="0"/></w:pPr>${runXml('SmartMaktab · Ёвари зеҳни сунъии «Алия»', { color: '5F6B7A', size: 15 })}</w:p></w:ftr>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdH1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdF1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}><w:body>${bodyXml}<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/><w:footerReference w:type="default" r:id="rIdF1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1247" w:right="1134" w:bottom="1247" w:left="1417" w:header="567" w:footer="510" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  return buildZip({
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': rels,
    'word/_rels/document.xml.rels': docRels,
    'word/styles.xml': stylesXml,
    'word/document.xml': documentXml,
    'word/header1.xml': headerXml,
    'word/footer1.xml': footerXml,
  });
}

export function downloadBytes(bytes, fileName, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeSlug(name) {
  return String(name || 'aliya-smartmaktab').replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'aliya';
}
