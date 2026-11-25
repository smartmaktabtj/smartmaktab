import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import {
  listDocxTemplates,
  templatesForRole,
  getDocxTemplate,
  renderDocxTemplate,
} from '../shared/docx-templates.mjs';

test('all 9 draft templates are bundled and discoverable by role', () => {
  const all = listDocxTemplates();
  assert.equal(all.length, 9);
  assert.ok(templatesForRole('school-director').some(t => t.template_id === 'school_order'));
  assert.ok(templatesForRole('school-academic-deputy').some(t => t.template_id === 'lesson_observation_journal'));
  assert.ok(templatesForRole('school-sozmon').some(t => t.template_id === 'organization_admission_journal'));
  assert.ok(templatesForRole('school-library-head').some(t => t.template_id === 'library_council_protocol'));
  assert.ok(templatesForRole('school-records-clerk').some(t => t.template_id === 'student_enrollment_certificate'));
  assert.ok(templatesForRole('school-class-teacher').some(t => t.template_id === 'tavsifnoma'));
  assert.ok(templatesForRole('school-class-teacher').some(t => t.template_id === 'class_teacher_duties'));
  assert.ok(templatesForRole('school-subject-room-head').some(t => t.template_id === 'subject_room_report'));
  assert.ok(templatesForRole('school-teacher').some(t => t.template_id === 'lesson_plan'));
});

test('all 9 templates render valid DOCX XML without leftover markers and respect omit_line / multiline / XML escaping', () => {
  const sampleValues = {
    district_name: 'Ноҳияи Сино',
    school_name: 'Мактаби таълимии рақами 1 <Сино> & Co',
    school_address: '', // omit_line
    order_number: '14-А',
    order_date: '2026-11-25',
    order_title: 'Дар бораи оғози соли хониш',
    order_body: 'Банди 1.\nБанди 2 & масъулият.',
    order_basis: '', // leave_blank
    director_full_name: 'Раҳимов Б.',
    observation_date: '2026-11-25',
    teacher_full_name: 'Каримова М.',
    teacher_specialty: '',
    subject: 'Алгебра',
    class_code: '7А',
    topic: 'Муодилаи хаттӣ',
    lesson_type: '',
    lesson_flow: 'Саволу ҷавоб\nКори гурӯҳӣ',
    observation_summary: 'Дарс хуб гузашт',
    recommendation: '',
    observer_full_name: 'Нозиров С.',
    protocol_number: '3',
    meeting_date: '2026-11-25',
    members_total: '12',
    members_present: '12',
    members_absent: '', // omit_line
    agenda: '1. Фонди китобхона',
    speakers: '',
    decision: 'Таъмин карда шавад',
    chair_full_name: 'Сафаров Д.',
    secretary_full_name: 'Назарова З.',
    document_number: '22',
    issue_date: '2026-11-25',
    student_full_name: 'Шарипов А.',
    enrollment_year: '2025',
    class_teacher_full_name: 'Алиева Н.',
    description: 'Хонандаи фаъол.\nДар олимпиада ширкат кард.',
    deputy_full_name: 'Мирзоев Т.',
    rooms_info: 'Синфхонаи физика №4',
    purpose: '',
    conclusion: 'Омода ба дарс',
    recommendations: '',
    report_date: '2026-11-25',
    goal: 'Фаҳмидани мавзӯъ',
    method: '',
    equipment: '',
    lesson_stages: 'Ташкилӣ\nБаёни мавзӯи нав',
    responsible_full_name: 'Ҳасанова Л.',
  };

  for (const tpl of listDocxTemplates()) {
    if (tpl.template_id === 'organization_admission_journal') continue;
    const out = renderDocxTemplate(tpl, sampleValues);
    assert.ok(out.bytes instanceof Uint8Array, `expected bytes for ${tpl.template_id}: ${JSON.stringify(out)}`);
    const entries = unzipSync(out.bytes);
    const xml = strFromU8(entries['word/document.xml']);
    assert.ok(!xml.includes('{{'), `leftover marker in ${tpl.template_id}`);
    assert.ok(xml.includes('&lt;Сино&gt; &amp; Co'));
    if (tpl.template_id === 'school_order') {
      assert.ok(!xml.includes('Нишонӣ:'));
      assert.ok(xml.includes('25.11.2026'));
      assert.ok(xml.includes('<w:br/>'));
    }
    if (tpl.template_id === 'library_council_protocol') {
      assert.ok(!xml.includes('Иштирок надоштанд:'));
    }
  }
});

test('organization_admission_journal clones table rows for multi-row entries', () => {
  const tpl = getDocxTemplate('organization_admission_journal');
  const out = renderDocxTemplate(
    tpl,
    { responsible_full_name: 'Ҳасанова Л.' },
    [
      { student_full_name: 'Расулов А.', class_code: '5А', level_name: 'Сатҳи 1', admission_date: '2026-09-01' },
      { student_full_name: 'Содиқова М.', class_code: '6Б', level_name: 'Сатҳи 2', admission_date: '2026-09-02' },
      { student_full_name: 'Валиев Ф.', class_code: '7А', level_name: 'Сатҳи 3', admission_date: '2026-09-03' },
    ],
  );
  assert.ok(out.bytes instanceof Uint8Array, JSON.stringify(out));
  const xml = strFromU8(unzipSync(out.bytes)['word/document.xml']);
  assert.ok(!xml.includes('{{'));
  assert.ok(xml.includes('Расулов А.'));
  assert.ok(xml.includes('Содиқова М.'));
  assert.ok(xml.includes('Валиев Ф.'));
  assert.ok(xml.includes('Ҳасанова Л.'));
  assert.equal((xml.match(/0[123]\.09\.2026/g) || []).length, 3);
});

test('invalid template values and injection markers are rejected', () => {
  assert.equal(renderDocxTemplate('school_order', { district_name: 'Сино', school_name: 'Мактаб', order_number: '1', order_date: '2026-02-31', order_title: 'А', order_body: 'Б', director_full_name: 'В' }).error, 'order_date');
  assert.equal(renderDocxTemplate('tavsifnoma', { class_code: '5А', school_name: 'Мактаб', student_full_name: 'А{{hack}}', enrollment_year: '2022', description: 'Хуб', director_full_name: 'Д', class_teacher_full_name: 'Г' }).error, 'student_full_name');
  assert.equal(renderDocxTemplate('lesson_plan', { school_name: 'Мактаб', subject: 'Физика', class_code: '99Z', topic: 'Нури рӯшноӣ', goal: 'Фаҳмидан', lesson_stages: 'Қадам 1', teacher_full_name: 'Д' }).error, 'class_code');
});
