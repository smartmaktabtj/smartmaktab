const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[ch]));

export function renderQualityRingSvg({ qualityPct = 0, passPct = 0, avgGrade = 0, lang = 'tg' } = {}) {
  const q = Math.max(0, Math.min(100, Number(qualityPct) || 0));
  const p = Math.max(0, Math.min(100, Number(passPct) || 0));
  const rOuter = 54;
  const rInner = 40;
  const cOuter = 2 * Math.PI * rOuter;
  const cInner = 2 * Math.PI * rInner;
  const qOffset = (cOuter * (1 - q / 100)).toFixed(2);
  const pOffset = (cInner * (1 - p / 100)).toFixed(2);
  const lblQuality = lang === 'ru' ? 'Качество' : 'Сифат';
  const lblPass = lang === 'ru' ? 'Успев.' : 'Азхудк.';

  return `
    <div class="sm-chart-card">
      <svg class="sm-ring-svg" viewBox="0 0 140 140" width="148" height="148" role="img" aria-label="${esc(lblQuality)} ${q}%, ${esc(lblPass)} ${p}%">
        <g transform="rotate(-90 70 70)">
          <circle cx="70" cy="70" r="${rOuter}" fill="none" stroke="rgba(16,61,51,0.12)" stroke-width="10"/>
          <circle cx="70" cy="70" r="${rOuter}" fill="none" stroke="#106b57" stroke-width="10" stroke-linecap="round"
            stroke-dasharray="${cOuter.toFixed(2)}" stroke-dashoffset="${qOffset}" class="sm-anim-stroke" style="--target-offset:${qOffset};--full-len:${cOuter.toFixed(2)}"/>
          <circle cx="70" cy="70" r="${rInner}" fill="none" stroke="rgba(200,157,57,0.16)" stroke-width="8"/>
          <circle cx="70" cy="70" r="${rInner}" fill="none" stroke="#c89d39" stroke-width="8" stroke-linecap="round"
            stroke-dasharray="${cInner.toFixed(2)}" stroke-dashoffset="${pOffset}" class="sm-anim-stroke sm-anim-delay" style="--target-offset:${pOffset};--full-len:${cInner.toFixed(2)}"/>
        </g>
        <text x="70" y="65" text-anchor="middle" font-size="18" font-weight="700" fill="currentColor">${q}%</text>
        <text x="70" y="83" text-anchor="middle" font-size="11" fill="var(--muted, #5c6863)">${esc(lblQuality)}</text>
      </svg>
      <div class="sm-chart-legend">
        <div><span class="sm-dot" style="background:#106b57"></span>${esc(lblQuality)}: <strong>${q}%</strong></div>
        <div><span class="sm-dot" style="background:#c89d39"></span>${esc(lblPass)}: <strong>${p}%</strong></div>
        <div><span class="sm-dot" style="background:#38598a"></span>${lang === 'ru' ? 'Ср. балл' : 'Холи миёна'}: <strong>${Number(avgGrade || 0).toFixed(2)}</strong></div>
      </div>
    </div>
  `;
}

const PERIOD_LABELS = {
  q1: { tg: 'Ч1', ru: 'Ч1' },
  q2: { tg: 'Ч2', ru: 'Ч2' },
  h1: { tg: 'Н1', ru: 'П1' },
  q3: { tg: 'Ч3', ru: 'Ч3' },
  q4: { tg: 'Ч4', ru: 'Ч4' },
  h2: { tg: 'Н2', ru: 'П2' },
  year: { tg: 'Сол', ru: 'Год' },
};

export function renderQuarterBarsSvg(periods = [], lang = 'tg') {
  const list = periods.length ? periods : [
    { period: 'q1', quality_pct: 0, pass_pct: 0, assessed: 0 },
    { period: 'q2', quality_pct: 0, pass_pct: 0, assessed: 0 },
    { period: 'q3', quality_pct: 0, pass_pct: 0, assessed: 0 },
    { period: 'q4', quality_pct: 0, pass_pct: 0, assessed: 0 },
  ];
  const width = Math.max(280, list.length * 64 + 36);
  const height = 160;
  const baseY = 126;
  const maxBarH = 96;

  const bars = list.map((item, idx) => {
    const x = 24 + idx * 62;
    const qH = Math.max(2, Math.round((Math.min(100, Number(item.quality_pct) || 0) / 100) * maxBarH));
    const pH = Math.max(2, Math.round((Math.min(100, Number(item.pass_pct) || 0) / 100) * maxBarH));
    const qY = baseY - qH;
    const pY = baseY - pH;
    const lbl = PERIOD_LABELS[item.period]?.[lang] || item.period;
    return `
      <g class="sm-bar-group">
        <rect x="${x}" y="${pY}" width="18" height="${pH}" rx="4" fill="#c89d39" opacity="0.82" class="sm-anim-bar"/>
        <rect x="${x + 21}" y="${qY}" width="18" height="${qH}" rx="4" fill="#106b57" class="sm-anim-bar"/>
        <text x="${x + 19}" y="${Math.max(12, Math.min(qY, pY) - 5)}" text-anchor="middle" font-size="10" font-weight="600" fill="currentColor">${item.quality_pct || 0}%</text>
        <text x="${x + 19}" y="${baseY + 18}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--muted, #5c6863)">${esc(lbl)}</text>
      </g>
    `;
  }).join('');

  return `
    <div class="sm-chart-card sm-chart-wide">
      <div class="sm-chart-title">${lang === 'ru' ? 'Динамика по четвертям (Качество и Успеваемость)' : 'Динамикаи чорякҳо (Сифат ва Азхудкунӣ)'}</div>
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${lang === 'ru' ? 'График по четвертям' : 'Нақшаи чорякҳо'}">
        <line x1="14" y1="${baseY}" x2="${width - 14}" y2="${baseY}" stroke="var(--line, #d5ddd8)" stroke-width="1"/>
        <line x1="14" y1="${baseY - maxBarH}" x2="${width - 14}" y2="${baseY - maxBarH}" stroke="var(--line, #d5ddd8)" stroke-dasharray="3 4" stroke-width="1" opacity="0.6"/>
        ${bars}
      </svg>
    </div>
  `;
}

export function renderTerritoryBarsSvg(schools = [], lang = 'tg') {
  const rows = (schools || []).slice(0, 10);
  if (!rows.length) {
    return `<div class="sm-chart-card"><p class="sm-muted">${lang === 'ru' ? 'Данные по школам появятся после сохранения оценок' : 'Пас аз ворид шудани баҳоҳо нақшаи муқоисавии мактабҳо намоиш дода мешавад'}</p></div>`;
  }
  const barsHtml = rows.map(r => {
    const q = Math.max(0, Math.min(100, Number(r.quality_pct) || 0));
    return `
      <div class="sm-hbar-row">
        <div class="sm-hbar-head">
          <span>${esc(r.name || 'Мактаб')}</span>
          <strong>${q}% (${r.students || 0} ${lang === 'ru' ? 'уч.' : 'хон.'})</strong>
        </div>
        <div class="sm-hbar-track">
          <div class="sm-hbar-fill sm-anim-width" style="width:${q}%"></div>
        </div>
      </div>
    `;
  }).join('');
  return `
    <div class="sm-chart-card sm-chart-wide">
      <div class="sm-chart-title">${lang === 'ru' ? 'Сравнительный рейтинг качества по школам' : 'Муқоисаи сифати таҳсилот дар мактабҳо'}</div>
      <div class="sm-hbars">${barsHtml}</div>
    </div>
  `;
}
