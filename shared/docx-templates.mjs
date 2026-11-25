import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { normalizeClasses } from './class-picker.mjs';
import { docxTemplates } from './docx-templates-data.mjs';

const xmlEscape = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
const xmlMultilineEscape = text => xmlEscape(text).replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">');

export function listDocxTemplates() {
  return docxTemplates;
}

export function templatesForRole(cabinetId) {
  return docxTemplates.filter(t => t.primary_role === cabinetId || (t.related_roles || []).includes(cabinetId));
}

export function getDocxTemplate(templateId) {
  return docxTemplates.find(t => t.template_id === templateId) || null;
}

function validateField(field, rawValue) {
  const isMultiline = field.type === 'multiline' || /body|flow|stages|summary|info|conclusion|agenda|decision|description/i.test(field.key);
  const raw = rawValue === undefined || rawValue === null ? '' : String(rawValue);
  const text = isMultiline ? raw.replace(/\r\n/g, '\n').trim() : raw.trim();
  if (!text) {
    if (field.required) return { error: field.key };
    return { value: '' };
  }
  const maxLen = isMultiline ? 4000 : 300;
  if (text.length > maxLen) return { error: field.key };
  if (/\{\{|\}\}/.test(text)) return { error: field.key };
  if (isMultiline) {
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) return { error: field.key };
    return { value: text };
  }
  if (/[\x00-\x1f\x7f]/.test(text)) return { error: field.key };
  if (field.type === 'class_code') {
    const normalized = normalizeClasses([text]);
    if (!normalized.length) return { error: field.key };
    return { value: normalized[0] };
  }
  if (field.type === 'date') {
    if (!/^(19|20)\d\d-\d\d-\d\d$/.test(text)) return { error: field.key };
    const parsed = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) return { error: field.key };
    return { value: text.split('-').reverse().join('.') };
  }
  if (field.type === 'integer') {
    if (!/^\d{1,6}$/.test(text)) return { error: field.key };
    return { value: String(Number(text)) };
  }
  if (field.type === 'year') {
    if (!/^(19|20)\d\d$/.test(text)) return { error: field.key };
    return { value: text };
  }
  return { value: text };
}

export function validateTemplateInput(templateOrId, rawValues, extraRows = null) {
  const template = typeof templateOrId === 'string' ? getDocxTemplate(templateOrId) : templateOrId;
  if (!template) return { error: 'unknown_template' };

  if (template.template_id === 'organization_admission_journal') {
    const respField = template.fields.find(f => f.key === 'responsible_full_name');
    const respCheck = validateField(respField, rawValues?.responsible_full_name);
    if (respCheck.error) return { error: respCheck.error };

    const rowFields = template.fields.filter(f => f.key !== 'responsible_full_name');
    const inputRows = Array.isArray(extraRows) && extraRows.length ? extraRows : [rawValues || {}];
    const normalizedRows = [];
    for (let i = 0; i < inputRows.length; i++) {
      const rowRaw = inputRows[i] || {};
      const rowData = {};
      for (const field of rowFields) {
        const val = field.key === 'row_number' && !rowRaw.row_number ? String(i + 1) : rowRaw[field.key];
        const checked = validateField(field, val);
        if (checked.error) return { error: checked.error, rowIndex: i };
        rowData[field.key] = checked.value;
      }
      normalizedRows.push(rowData);
    }
    return { data: { responsible_full_name: respCheck.value }, rows: normalizedRows };
  }

  const data = {};
  for (const field of template.fields) {
    const checked = validateField(field, rawValues?.[field.key]);
    if (checked.error) return { error: checked.error };
    data[field.key] = checked.value;
  }
  return { data };
}

function replaceParagraphs(xml, template, data, used) {
  const fieldByKey = new Map(template.fields.map(f => [f.key, f]));
  return xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, block => {
    for (const field of template.fields) {
      if (field.when_empty === 'omit_line' && !data[field.key] && block.includes(`{{${field.key}}}`)) {
        used.add(field.key);
        return '';
      }
    }
    return block.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, key) => {
      if (!Object.hasOwn(data, key)) throw new Error(`Unknown template marker: ${key}`);
      used.add(key);
      const val = data[key];
      const field = fieldByKey.get(key);
      if (field?.type === 'multiline' || /[\r\n]/.test(val)) return xmlMultilineEscape(val);
      return xmlEscape(val);
    });
  });
}

export function renderDocxTemplate(templateOrId, rawValues, extraRows = null) {
  const template = typeof templateOrId === 'string' ? getDocxTemplate(templateOrId) : templateOrId;
  const validated = validateTemplateInput(template, rawValues, extraRows);
  if (!validated.data) return validated;

  const entries = unzipSync(Uint8Array.from(atob(template.docx_base64), x => x.charCodeAt(0)));
  let xml = strFromU8(entries['word/document.xml']);
  const used = new Set();

  if (template.template_id === 'organization_admission_journal' && Array.isArray(validated.rows)) {
    const trMatches = [...xml.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)];
    const templateRow = trMatches.find(m => m[0].includes('{{student_full_name}}'));
    if (!templateRow) throw new Error('Missing journal template row');
    const renderedRows = validated.rows.map(rowData => replaceParagraphs(templateRow[0], template, rowData, used)).join('');
    xml = xml.replace(templateRow[0], renderedRows);
    xml = replaceParagraphs(xml, template, validated.data, used);
  } else {
    xml = replaceParagraphs(xml, template, validated.data, used);
  }

  if (used.size !== template.fields.length || xml.includes('{{')) {
    throw new Error(`Unresolved template markers in ${template.template_id}`);
  }
  entries['word/document.xml'] = strToU8(xml);
  return {
    template,
    data: validated.data,
    rows: validated.rows || null,
    bytes: zipSync(entries, { level: 6 }),
  };
}
