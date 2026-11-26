import { createCloudClient } from './cloud-client.mjs';
import { getCloudConfig } from './cloud-config.mjs';

export const CATEGORY_LABELS = {
  higher: { tg: 'Дараҷаи олӣ (+20%)', ru: 'Высшая категория (+20%)', defaultPct: 20 },
  first: { tg: 'Дараҷаи якум (+15%)', ru: 'Первая категория (+15%)', defaultPct: 15 },
  second: { tg: 'Дараҷаи дуюм (+10%)', ru: 'Вторая категория (+10%)', defaultPct: 10 },
  none: { tg: 'Бе дараҷа (0%)', ru: 'Без категории (0%)', defaultPct: 0 },
};

export const TAJIK_HOLIDAY_PRESETS = [
  { md: '01-01', tg: 'Соли нав', ru: 'Новый год' },
  { md: '03-08', tg: 'Рӯзи Модар', ru: 'День матери' },
  { md: '03-21', tg: 'Наврӯз (1)', ru: 'Навруз (1)' },
  { md: '03-22', tg: 'Наврӯз (2)', ru: 'Навруз (2)' },
  { md: '03-23', tg: 'Наврӯз (3)', ru: 'Навруз (3)' },
  { md: '03-24', tg: 'Наврӯз (4)', ru: 'Навруз (4)' },
  { md: '05-09', tg: 'Рӯзи Ғалаба', ru: 'День Победы' },
  { md: '06-27', tg: 'Рӯзи Ваҳдати миллӣ', ru: 'День национального единства' },
  { md: '09-09', tg: 'Рӯзи Истиқлолияти давлатӣ', ru: 'День независимости' },
  { md: '11-06', tg: 'Рӯзи Конститутсия', ru: 'День Конституции' },
  { md: '11-16', tg: 'Рӯзи Президент', ru: 'День Президента' },
  { md: '11-24', tg: 'Рӯзи Парчами давлатӣ', ru: 'День государственного флага' },
];

export const DEFAULT_PAYROLL_CONFIG = {
  base_rate_18h_tjs: 1800,
  category_bonus_pct: { higher: 20, first: 15, second: 10, none: 0 },
  class_leadership_tjs: 180,
  notebook_check_tjs: 120,
  income_tax_pct: 13,
  social_tax_pct: 1,
  holiday_dates: [],
  excluded_weekdays: [0],
  pro_rate_holidays: true,
};

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readJsonStore(key, fallback) {
  const st = getStorage();
  if (!st) return fallback;
  try {
    const raw = st.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStore(key, value) {
  const st = getStorage();
  if (!st) return;
  try {
    st.setItem(key, JSON.stringify(value));
  } catch {}
}

function makeCloudClient() {
  const st = getStorage();
  if (!st) return null;
  try {
    const client = createCloudClient({ config: getCloudConfig(st), storage: st, storageKey: 'smartmaktab.cloud.session.v1' });
    return client?.session?.access_token ? client : null;
  } catch {
    return null;
  }
}

async function cloudRestGet(pathAndQuery) {
  const cl = makeCloudClient();
  if (!cl) return null;
  const qIdx = pathAndQuery.indexOf('?');
  const table = qIdx >= 0 ? pathAndQuery.slice(0, qIdx) : pathAndQuery;
  const qs = qIdx >= 0 ? pathAndQuery.slice(qIdx + 1) : '';
  return cl.select(table, qs);
}

async function cloudRpc(fnName, params) {
  const cl = makeCloudClient();
  if (!cl) return null;
  return cl.rpc(fnName, params);
}

export function resolvePhase2Context(pageCtx = {}) {
  const cloudProfile = readJsonStore('smartmaktab.profile.v1', null);
  const cloudSess = readJsonStore('smartmaktab.cloud.session.v1', null);
  const cfg = getCloudConfig(getStorage());
  const orgId = pageCtx.organizationId || cloudProfile?.organizationId || 'demo-school';
  const orgName = pageCtx.organizationName || cloudProfile?.organizationName || 'Мактаби намунавӣ № 1';
  const kind = pageCtx.cabinetId && (pageCtx.cabinetId.startsWith('office-') || pageCtx.cabinetId.startsWith('maorif-') || pageCtx.cabinetId.startsWith('raesat-')) ? 'education_authority' : 'school';
  const tier = pageCtx.cabinetId?.startsWith('raesat-') ? 'raesat' : (kind === 'education_authority' ? 'maorif' : '');
  const isOnline = Boolean(cloudSess?.access_token && cfg?.url && cfg?.publishableKey && /^[0-9a-f-]{36}$/i.test(String(orgId)));
  const actorRole = pageCtx.cabinetId === 'school-director' ? 'director' : (kind === 'education_authority' ? 'authority_viewer' : 'staff');
  const actorName = cloudProfile?.fullName || pageCtx.userName || pageCtx.cabinetTitle || '';
  return {
    orgId: String(orgId),
    orgName,
    kind,
    tier,
    isOnline,
    accessToken: cloudSess?.access_token || '',
    actorRole,
    actorName,
    cabinetId: pageCtx.cabinetId || '',
    userId: cloudSess?.user?.id || 'local-user',
  };
}

function makeUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'p2-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

// ============================================================================
// 1. STUDENTS REGISTRY
// ============================================================================
export async function loadStudents(ctx, classFilter = '') {
  const c = resolvePhase2Context(ctx);
  const key = `smartmaktab.phase2.students.${c.orgId}`;
  let rows = readJsonStore(key, []);
  if (c.isOnline) {
    try {
      const q = `organization_id=eq.${encodeURIComponent(c.orgId)}&deleted_at=is.null&order=class_code.asc,full_name.asc`;
      const remote = await cloudRestGet(`school_students?${q}`, c.accessToken);
      if (Array.isArray(remote)) {
        rows = remote;
        writeJsonStore(key, rows);
      }
    } catch {}
  }
  const cleanFilter = String(classFilter || '').trim().toUpperCase();
  return cleanFilter ? rows.filter(r => String(r.class_code || '').toUpperCase() === cleanFilter) : rows;
}

export async function upsertStudents(ctx, incomingRows, { replaceClass = '' } = {}) {
  const c = resolvePhase2Context(ctx);
  const key = `smartmaktab.phase2.students.${c.orgId}`;
  const cleanReplace = String(replaceClass || '').trim().toUpperCase();
  const normalized = (incomingRows || [])
    .map(r => ({
      id: r.id || makeUuid(),
      organization_id: c.orgId,
      class_code: String(r.class_code || '').trim().toUpperCase().slice(0, 12) || '5А',
      full_name: String(r.full_name || '').trim().slice(0, 180),
      birth_year: r.birth_year ? Number(r.birth_year) : null,
      gender: ['male', 'female'].includes(r.gender) ? r.gender : '',
      guardian_name: String(r.guardian_name || '').trim().slice(0, 160),
      guardian_phone: String(r.guardian_phone || '').trim().slice(0, 40),
      student_code: String(r.student_code || '').trim().slice(0, 40),
      status: ['active', 'transferred', 'graduated'].includes(r.status) ? r.status : 'active',
      updated_at: new Date().toISOString(),
    }))
    .filter(r => r.full_name.length > 0);

  let current = readJsonStore(key, []);
  if (cleanReplace) {
    current = current.filter(r => String(r.class_code || '').toUpperCase() !== cleanReplace);
  }
  const byId = new Map(current.map(r => [r.id, r]));
  const byNatural = new Map(current.map(r => [`${String(r.class_code).toUpperCase()}::${r.full_name.toLowerCase()}`, r.id]));

  for (const row of normalized) {
    const natKey = `${row.class_code.toUpperCase()}::${row.full_name.toLowerCase()}`;
    const existingId = byId.has(row.id) ? row.id : byNatural.get(natKey);
    if (existingId) {
      byId.set(existingId, { ...byId.get(existingId), ...row, id: existingId });
    } else {
      byId.set(row.id, row);
      byNatural.set(natKey, row.id);
    }
  }
  const next = [...byId.values()].sort((a, b) => (a.class_code || '').localeCompare(b.class_code || '') || (a.full_name || '').localeCompare(b.full_name || ''));
  writeJsonStore(key, next);

  if (c.isOnline && normalized.length) {
    try {
      await cloudRpc('upsert_school_students', {
        p_org_id: c.orgId,
        p_rows: normalized,
        p_replace_class: cleanReplace || null,
      }, c.accessToken);
      return loadStudents(c);
    } catch {}
  }
  return next;
}

export async function deleteStudent(ctx, studentId) {
  const c = resolvePhase2Context(ctx);
  const key = `smartmaktab.phase2.students.${c.orgId}`;
  const current = readJsonStore(key, []);
  const next = current.filter(r => r.id !== studentId);
  writeJsonStore(key, next);
  if (c.isOnline && /^[0-9a-f-]{36}$/i.test(String(studentId))) {
    try {
      await cloudRpc('delete_school_student', { p_org_id: c.orgId, p_student_id: studentId }, c.accessToken);
    } catch {}
  }
  return next;
}

// ============================================================================
// 2. TEACHER WORKLOADS & CATEGORIES
// ============================================================================
export async function loadWorkloads(ctx) {
  const c = resolvePhase2Context(ctx);
  const key = `smartmaktab.phase2.workloads.${c.orgId}`;
  let rows = readJsonStore(key, []);
  if (c.isOnline) {
    try {
      const remote = await cloudRestGet(`teacher_workloads?organization_id=eq.${encodeURIComponent(c.orgId)}&order=teacher_name.asc`, c.accessToken);
      if (Array.isArray(remote)) {
        rows = remote;
        writeJsonStore(key, rows);
      }
    } catch {}
  }
  return rows;
}

export async function upsertWorkload(ctx, item) {
  const c = resolvePhase2Context(ctx);
  const key = `smartmaktab.phase2.workloads.${c.orgId}`;
  const clean = {
    id: item.id || makeUuid(),
    organization_id: c.orgId,
    teacher_name: String(item.teacher_name || '').trim().slice(0, 160),
    category: ['higher', 'first', 'second', 'none'].includes(item.category) ? item.category : 'none',
    attestation_year: item.attestation_year ? Number(item.attestation_year) : null,
    weekly_hours: Math.max(0, Math.min(60, Number(item.weekly_hours) || 0)),
    subject: String(item.subject || '').trim().slice(0, 120),
    class_codes: Array.isArray(item.class_codes) ? item.class_codes.map(s => String(s).trim().toUpperCase()).filter(Boolean) : [],
    class_leadership: Boolean(item.class_leadership),
    notebook_check: Boolean(item.notebook_check),
    notes: String(item.notes || '').trim().slice(0, 400),
    updated_at: new Date().toISOString(),
  };
  if (!clean.teacher_name) throw new Error('teacher_name_required');

  const current = readJsonStore(key, []);
  const idx = current.findIndex(r => r.id === clean.id || r.teacher_name.toLowerCase() === clean.teacher_name.toLowerCase());
  if (idx >= 0) current[idx] = { ...current[idx], ...clean, id: current[idx].id };
  else current.push(clean);
  writeJsonStore(key, current);

  if (c.isOnline) {
    try {
      const remoteId = await cloudRpc('upsert_teacher_workload', {
        p_org_id: c.orgId,
        p_teacher_name: clean.teacher_name,
        p_category: clean.category,
        p_attestation_year: clean.attestation_year,
        p_weekly_hours: clean.weekly_hours,
        p_subject: clean.subject,
        p_class_codes: clean.class_codes,
        p_class_leadership: clean.class_leadership,
        p_notebook_check: clean.notebook_check,
        p_notes: clean.notes,
        p_workload_id: /^[0-9a-f-]{36}$/i.test(clean.id) ? clean.id : null,
      }, c.accessToken);
      if (remoteId) return loadWorkloads(c);
    } catch {}
  }
  return current;
}

export async function deleteWorkload(ctx, workloadId) {
  const c = resolvePhase2Context(ctx);
  const key = `smartmaktab.phase2.workloads.${c.orgId}`;
  const next = readJsonStore(key, []).filter(r => r.id !== workloadId);
  writeJsonStore(key, next);
  return next;
}

// ============================================================================
// 3. ACCOUNTANT PAYROLL & CALENDAR EXCLUSIONS
// ============================================================================
export async function loadPayrollConfig(ctx) {
  const c = resolvePhase2Context(ctx);
  const key = `smartmaktab.phase2.payroll_cfg.${c.orgId}`;
  let cfg = { ...DEFAULT_PAYROLL_CONFIG, ...readJsonStore(key, {}) };
  if (c.isOnline) {
    try {
      const remote = await cloudRestGet(`accountant_payroll_configs?organization_id=eq.${encodeURIComponent(c.orgId)}&limit=1`, c.accessToken);
      if (Array.isArray(remote) && remote[0]) {
        cfg = { ...cfg, ...remote[0] };
        writeJsonStore(key, cfg);
      }
    } catch {}
  }
  return cfg;
}

export async function savePayrollConfig(ctx, nextCfg) {
  const c = resolvePhase2Context(ctx);
  const key = `smartmaktab.phase2.payroll_cfg.${c.orgId}`;
  const merged = {
    ...DEFAULT_PAYROLL_CONFIG,
    ...nextCfg,
    base_rate_18h_tjs: Math.max(0, Number(nextCfg.base_rate_18h_tjs) || 0),
    class_leadership_tjs: Math.max(0, Number(nextCfg.class_leadership_tjs) || 0),
    notebook_check_tjs: Math.max(0, Number(nextCfg.notebook_check_tjs) || 0),
    income_tax_pct: Math.max(0, Math.min(60, Number(nextCfg.income_tax_pct) || 0)),
    social_tax_pct: Math.max(0, Math.min(40, Number(nextCfg.social_tax_pct) || 0)),
    holiday_dates: Array.isArray(nextCfg.holiday_dates) ? [...new Set(nextCfg.holiday_dates)].sort() : [],
    excluded_weekdays: Array.isArray(nextCfg.excluded_weekdays) ? [...new Set(nextCfg.excluded_weekdays.map(Number))] : [0],
    pro_rate_holidays: nextCfg.pro_rate_holidays !== false,
    updated_at: new Date().toISOString(),
  };
  writeJsonStore(key, merged);
  if (c.isOnline) {
    try {
      await cloudRpc('save_accountant_payroll_config', {
        p_org_id: c.orgId,
        p_base_rate: merged.base_rate_18h_tjs,
        p_category_bonus: merged.category_bonus_pct,
        p_class_leadership: merged.class_leadership_tjs,
        p_notebook_check: merged.notebook_check_tjs,
        p_income_tax_pct: merged.income_tax_pct,
        p_social_tax_pct: merged.social_tax_pct,
        p_holiday_dates: merged.holiday_dates,
        p_excluded_weekdays: merged.excluded_weekdays,
      }, c.accessToken);
    } catch {}
  }
  return merged;
}

export function buildMonthCalendar(yearMonth, excludedWeekdays = [0], holidayDates = []) {
  const m = String(yearMonth || '').match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = m ? Number(m[1]) : now.getFullYear();
  const month = m ? Number(m[2]) : now.getMonth() + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const excludedSet = new Set((excludedWeekdays || [0]).map(Number));
  const holidaySet = new Set(holidayDates || []);

  const days = [];
  let possibleWorkingDays = 0;
  let effectiveWorkingDays = 0;
  let excludedHolidayWorkingDays = 0;

  for (let d = 1; d <= daysInMonth; d += 1) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    const weekday = dt.getUTCDay();
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isExcludedWeekday = excludedSet.has(weekday);
    const isHoliday = holidaySet.has(iso);
    if (!isExcludedWeekday) {
      possibleWorkingDays += 1;
      if (isHoliday) excludedHolidayWorkingDays += 1;
      else effectiveWorkingDays += 1;
    }
    days.push({
      date: iso,
      day: d,
      weekday,
      isExcludedWeekday,
      isHoliday,
      isWorkingDay: !isExcludedWeekday && !isHoliday,
    });
  }
  const factor = possibleWorkingDays > 0 ? effectiveWorkingDays / possibleWorkingDays : 1;
  return {
    yearMonth: `${year}-${String(month).padStart(2, '0')}`,
    daysInMonth,
    possibleWorkingDays,
    effectiveWorkingDays,
    excludedHolidayWorkingDays,
    attendanceFactor: Number(factor.toFixed(4)),
    days,
  };
}

export function computeMonthlyPayroll(config, workloads, yearMonth) {
  const cfg = { ...DEFAULT_PAYROLL_CONFIG, ...(config || {}) };
  const cal = buildMonthCalendar(yearMonth, cfg.excluded_weekdays, cfg.holiday_dates);
  const ratio = cfg.pro_rate_holidays ? cal.attendanceFactor : 1;
  const base18 = Number(cfg.base_rate_18h_tjs) || 0;
  const bonusMap = cfg.category_bonus_pct || DEFAULT_PAYROLL_CONFIG.category_bonus_pct;

  const rows = (workloads || []).map(w => {
    const hours = Math.max(0, Number(w.weekly_hours) || 0);
    const stavka = Number((hours / 18).toFixed(3));
    const fullBase = base18 * stavka;
    const basePay = Number((fullBase * ratio).toFixed(2));
    const catPct = Number(bonusMap[w.category] ?? 0);
    const categoryBonus = Number(((basePay * catPct) / 100).toFixed(2));
    const supplements = Number((
      (w.class_leadership ? Number(cfg.class_leadership_tjs || 0) : 0)
      + (w.notebook_check ? Number(cfg.notebook_check_tjs || 0) : 0)
    ).toFixed(2));
    const grossPay = Number((basePay + categoryBonus + supplements).toFixed(2));
    const incomeTax = Number(((grossPay * Number(cfg.income_tax_pct || 0)) / 100).toFixed(2));
    const socialTax = Number(((grossPay * Number(cfg.social_tax_pct || 0)) / 100).toFixed(2));
    const netPay = Number(Math.max(0, grossPay - incomeTax - socialTax).toFixed(2));

    return {
      ...w,
      stavka,
      effective_hours: Number(((hours * cal.effectiveWorkingDays) / 6).toFixed(1)),
      basePay,
      catPct,
      categoryBonus,
      supplements,
      grossPay,
      incomeTax,
      socialTax,
      netPay,
    };
  });

  const totals = rows.reduce((acc, r) => ({
    hours: acc.hours + (Number(r.weekly_hours) || 0),
    gross: Number((acc.gross + r.grossPay).toFixed(2)),
    tax: Number((acc.tax + r.incomeTax + r.socialTax).toFixed(2)),
    net: Number((acc.net + r.netPay).toFixed(2)),
  }), { hours: 0, gross: 0, tax: 0, net: 0 });

  return { calendar: cal, config: cfg, rows, totals };
}

// ============================================================================
// 4. CLASS TEACHER QUARTER GRADES & ANALYTICS
// ============================================================================
export async function loadQuarterGrades(ctx, { yearStart = 2026, period = '', classCode = '', subject = '' } = {}) {
  const c = resolvePhase2Context(ctx);
  const key = `smartmaktab.phase2.grades.${c.orgId}`;
  let rows = readJsonStore(key, []);
  if (c.isOnline) {
    try {
      const remote = await cloudRestGet(`quarter_grades?organization_id=eq.${encodeURIComponent(c.orgId)}&year_start=eq.${Number(yearStart)}&order=class_code.asc,student_name.asc`, c.accessToken);
      if (Array.isArray(remote)) {
        rows = remote;
        writeJsonStore(key, rows);
      }
    } catch {}
  }
  const pClean = String(period || '').trim();
  const cClean = String(classCode || '').trim().toUpperCase();
  const sClean = String(subject || '').trim().toLowerCase();
  return rows.filter(r =>
    Number(r.year_start) === Number(yearStart)
    && (!pClean || r.period === pClean)
    && (!cClean || String(r.class_code || '').toUpperCase() === cClean)
    && (!sClean || String(r.subject || '').toLowerCase() === sClean));
}

export async function saveQuarterGrades(ctx, { yearStart = 2026, period = 'q1', classCode, subject, entries }) {
  const c = resolvePhase2Context(ctx);
  const key = `smartmaktab.phase2.grades.${c.orgId}`;
  const clsClean = String(classCode || '').trim().toUpperCase().slice(0, 12);
  const subjClean = String(subject || '').trim().slice(0, 120);
  if (!clsClean || !subjClean) throw new Error('class_and_subject_required');

  const current = readJsonStore(key, []);
  const map = new Map(current.map(r => [`${r.year_start}::${r.period}::${String(r.class_code).toUpperCase()}::${r.subject.toLowerCase()}::${r.student_name.toLowerCase()}`, r]));

  const cleanEntries = [];
  for (const e of entries || []) {
    const sName = String(e.student_name || '').trim().slice(0, 180);
    if (!sName) continue;
    const rawG = e.grade === '' || e.grade === null || e.grade === undefined ? null : Number(e.grade);
    const grade = rawG !== null && Number.isFinite(rawG) ? Math.max(0, Math.min(10, rawG)) : null;
    const absent = Math.max(0, Math.min(1000, Math.round(Number(e.absent_hours) || 0)));
    const item = {
      id: e.id || makeUuid(),
      organization_id: c.orgId,
      year_start: Number(yearStart),
      period,
      class_code: clsClean,
      subject: subjClean,
      student_id: e.student_id || null,
      student_name: sName,
      grade,
      absent_hours: absent,
      updated_at: new Date().toISOString(),
    };
    const k = `${item.year_start}::${item.period}::${clsClean}::${subjClean.toLowerCase()}::${sName.toLowerCase()}`;
    map.set(k, item);
    cleanEntries.push(item);
  }
  const next = [...map.values()];
  writeJsonStore(key, next);

  if (c.isOnline && cleanEntries.length) {
    try {
      await cloudRpc('save_quarter_grades', {
        p_org_id: c.orgId,
        p_year_start: Number(yearStart),
        p_period: period,
        p_class_code: clsClean,
        p_subject: subjClean,
        p_entries: cleanEntries,
      }, c.accessToken);
    } catch {}
  }
  return cleanEntries;
}

export function computeGradeMetrics(rows) {
  const assessedRows = (rows || []).filter(r => r.grade !== null && r.grade !== undefined && Number.isFinite(Number(r.grade)));
  const assessed = assessedRows.length;
  const excellent = assessedRows.filter(r => Number(r.grade) >= 9).length;
  const good = assessedRows.filter(r => Number(r.grade) >= 8 && Number(r.grade) < 9).length;
  const medium = assessedRows.filter(r => Number(r.grade) >= 4 && Number(r.grade) < 8).length;
  const failing = assessedRows.filter(r => Number(r.grade) < 4).length;
  const qualityCount = excellent + good;
  const passedCount = assessed - failing;
  const qualityPct = assessed > 0 ? Number(((qualityCount / assessed) * 100).toFixed(1)) : 0;
  const passPct = assessed > 0 ? Number(((passedCount / assessed) * 100).toFixed(1)) : 0;
  const avgGrade = assessed > 0
    ? Number((assessedRows.reduce((s, r) => s + Number(r.grade), 0) / assessed).toFixed(2))
    : 0;
  return {
    total: (rows || []).length,
    assessed,
    excellent,
    good,
    medium,
    failing,
    qualityCount,
    passedCount,
    qualityPct,
    passPct,
    avgGrade,
  };
}

// ============================================================================
// 5. HIERARCHICAL VERIFICATION (Staff -> Director -> Maorif)
// ============================================================================
function verificationStoreKey(orgId) {
  return `smartmaktab.phase2.verifications.${orgId}`;
}

export async function loadVerifications(ctx) {
  const c = resolvePhase2Context(ctx);
  if (c.isOnline) {
    try {
      const q = c.kind === 'school'
        ? `verification_submissions?organization_id=eq.${encodeURIComponent(c.orgId)}&order=submitted_at.desc`
        : `verification_submissions?maorif_status=neq.not_sent&order=submitted_at.desc`;
      const remote = await cloudRestGet(q, c.accessToken);
      if (Array.isArray(remote)) return remote;
    } catch {}
  }
  const st = getStorage();
  if (!st) return [];
  if (c.kind === 'school') {
    return readJsonStore(verificationStoreKey(c.orgId), []);
  }
  // Authority (Maorif / Raesat) aggregates forwarded items across local schools
  const collected = [];
  for (let i = 0; i < st.length; i += 1) {
    const k = st.key(i);
    if (k && k.startsWith('smartmaktab.phase2.verifications.')) {
      const list = readJsonStore(k, []);
      if (Array.isArray(list)) {
        collected.push(...list.filter(item => item.maorif_status && item.maorif_status !== 'not_sent'));
      }
    }
  }
  return collected.sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
}

export async function submitVerification(ctx, { category, title, periodLabel = '', payload = {}, directToMaorif = false }) {
  const c = resolvePhase2Context(ctx);
  const isDirector = c.cabinetId === 'school-director' || ['director', 'school_admin'].includes(c.actorRole);
  const dirApproved = Boolean(directToMaorif && isDirector);

  const rec = {
    id: makeUuid(),
    organization_id: c.orgId,
    organization_name: c.orgName,
    source_cabinet: c.cabinetId || 'school',
    category: category || 'document',
    title: String(title || '').trim() || 'Ҳуҷҷат',
    period_label: String(periodLabel || '').trim(),
    payload: payload && typeof payload === 'object' ? payload : {},
    submitted_by: c.userId,
    submitted_by_name: c.actorName || c.cabinetId || 'Корманд',
    submitted_at: new Date().toISOString(),
    director_status: dirApproved ? 'approved' : 'pending',
    director_note: '',
    director_at: dirApproved ? new Date().toISOString() : null,
    maorif_status: dirApproved ? 'pending' : 'not_sent',
    maorif_note: '',
    maorif_at: null,
  };

  if (c.isOnline) {
    try {
      const remoteId = await cloudRpc('submit_for_verification', {
        p_org_id: c.orgId,
        p_source_cabinet: rec.source_cabinet,
        p_category: rec.category,
        p_title: rec.title,
        p_period_label: rec.period_label,
        p_payload: rec.payload,
        p_submitted_by_name: rec.submitted_by_name,
        p_direct_to_maorif: dirApproved,
      }, c.accessToken);
      if (remoteId) rec.id = remoteId;
    } catch {}
  }

  const list = readJsonStore(verificationStoreKey(c.orgId), []);
  list.unshift(rec);
  writeJsonStore(verificationStoreKey(c.orgId), list);
  return rec;
}

export async function directorReviewVerification(ctx, submissionId, decision, note = '', forwardToMaorif = false) {
  const c = resolvePhase2Context(ctx);
  if (c.isOnline && /^[0-9a-f-]{36}$/i.test(String(submissionId))) {
    try {
      await cloudRpc('director_review_submission', {
        p_submission_id: submissionId,
        p_decision: decision,
        p_note: note,
        p_forward_to_maorif: Boolean(forwardToMaorif),
      }, c.accessToken);
    } catch {}
  }
  const key = verificationStoreKey(c.orgId);
  const list = readJsonStore(key, []);
  const idx = list.findIndex(r => r.id === submissionId);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      director_status: decision,
      director_note: String(note || ''),
      director_at: new Date().toISOString(),
      maorif_status: decision === 'approved' && forwardToMaorif
        ? 'pending'
        : (decision === 'rejected' || decision === 'changes' ? 'not_sent' : list[idx].maorif_status),
    };
    writeJsonStore(key, list);
  }
  return loadVerifications(c);
}

export async function maorifReviewVerification(ctx, submissionId, schoolOrgId, decision, note = '') {
  const c = resolvePhase2Context(ctx);
  if (c.isOnline && /^[0-9a-f-]{36}$/i.test(String(submissionId))) {
    try {
      await cloudRpc('maorif_review_submission', {
        p_submission_id: submissionId,
        p_decision: decision,
        p_note: note,
      }, c.accessToken);
    } catch {}
  }
  const targetOrg = schoolOrgId || 'demo-school';
  const key = verificationStoreKey(targetOrg);
  const list = readJsonStore(key, []);
  const idx = list.findIndex(r => r.id === submissionId);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      maorif_status: decision,
      maorif_note: String(note || ''),
      maorif_at: new Date().toISOString(),
    };
    writeJsonStore(key, list);
  }
  return loadVerifications(c);
}

// ============================================================================
// 6. ANALYTICS SUMMARY (School / Maorif / Raesat)
// ============================================================================
export async function loadAnalyticsSummary(ctx, yearStart = 2026) {
  const c = resolvePhase2Context(ctx);
  if (c.isOnline) {
    try {
      const remote = await cloudRpc('get_analytics_summary', {
        p_org_id: c.orgId,
        p_year_start: Number(yearStart),
        p_period: null,
      }, c.accessToken);
      if (remote && typeof remote === 'object') return remote;
    } catch {}
  }

  // Local aggregation fallback across single school or demo schools for authorities
  const st = getStorage();
  const orgIds = new Set();
  if (c.kind === 'school') {
    orgIds.add(c.orgId);
  } else if (st) {
    for (let i = 0; i < st.length; i += 1) {
      const k = st.key(i) || '';
      const m = k.match(/^smartmaktab\.phase2\.(?:students|grades|verifications)\.(.+)$/);
      if (m && m[1]) orgIds.add(m[1]);
    }
    if (!orgIds.size) orgIds.add('demo-school');
  } else {
    orgIds.add(c.orgId);
  }

  let totalStudents = 0;
  let allGrades = [];
  let allVerifs = [];
  const schoolRows = [];

  for (const oid of orgIds) {
    const students = readJsonStore(`smartmaktab.phase2.students.${oid}`, []);
    const grades = readJsonStore(`smartmaktab.phase2.grades.${oid}`, []).filter(g => Number(g.year_start) === Number(yearStart));
    const verifs = readJsonStore(`smartmaktab.phase2.verifications.${oid}`, []);
    totalStudents += students.length;
    allGrades = allGrades.concat(grades);
    allVerifs = allVerifs.concat(verifs);
    const gm = computeGradeMetrics(grades);
    schoolRows.push({
      id: oid,
      name: verifs[0]?.organization_name || (oid === c.orgId ? c.orgName : (oid === 'demo-school' ? 'Мактаби намунавӣ № 1' : oid)),
      district: '',
      students: students.length,
      assessed: gm.assessed,
      quality_pct: gm.qualityPct,
      pass_pct: gm.passPct,
    });
  }

  const overall = computeGradeMetrics(allGrades);
  const order = ['q1', 'q2', 'h1', 'q3', 'q4', 'h2', 'year'];
  const periods = order.map(p => {
    const slice = allGrades.filter(g => g.period === p);
    const pm = computeGradeMetrics(slice);
    return {
      period: p,
      assessed: pm.assessed,
      quality_pct: pm.qualityPct,
      pass_pct: pm.passPct,
      avg_grade: pm.avgGrade,
    };
  }).filter(p => p.assessed > 0);

  return {
    organization_id: c.orgId,
    organization_name: c.orgName,
    kind: c.kind,
    authority_tier: c.tier,
    student_count: totalStudents,
    grades: {
      assessed: overall.assessed,
      quality_count: overall.qualityCount,
      passed_count: overall.passedCount,
      avg_grade: overall.avgGrade,
      quality_pct: overall.qualityPct,
      pass_pct: overall.passPct,
    },
    periods,
    schools: schoolRows,
    verifications: {
      total: allVerifs.length,
      director_pending: allVerifs.filter(v => v.director_status === 'pending').length,
      director_approved: allVerifs.filter(v => v.director_status === 'approved').length,
      maorif_pending: allVerifs.filter(v => v.maorif_status === 'pending').length,
      maorif_approved: allVerifs.filter(v => v.maorif_status === 'approved').length,
    },
  };
}
