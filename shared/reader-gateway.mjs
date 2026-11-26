import { appRoot, offlineViewer } from './cabinet-runtime.mjs';

export const DEFAULT_ALIYA_GATEWAY = 'https://sharipovip-aliya-gateway.hf.space';

const customGateway = () =>
  document.querySelector('meta[name="sm-aliya-gateway-url"]')?.content?.trim().replace(/\/+$/, '') || '';

export const isLocalGateway = () =>
  !offlineViewer &&
  document.querySelector('meta[name="sm-aliya-gateway"]')?.content === 'local' &&
  location.protocol === 'http:' &&
  ['127.0.0.1', 'localhost'].includes(location.hostname);

export const gatewayEndpoint = () => (isLocalGateway() ? '' : customGateway() || DEFAULT_ALIYA_GATEWAY);

export const gatewayEnabled =
  isLocalGateway() ||
  !offlineViewer ||
  ['http:', 'https:', 'smapp:', 'appassets:'].includes(location.protocol);

const LANG_LABEL = {
  tg: 'Тоҷикӣ',
  ru: 'Русский',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  uz: 'Oʻzbekcha',
  tr: 'Türkçe',
  ar: 'العربية',
  fa: 'فارسی',
  zh: '中文',
};

const FORMAT_RULES = {
  tg: `
ҚОИДАҲОИ ФОРМАТИ ПОСУХ (ҳатмӣ):
- Фақат матни тоҷикии адабӣ ва истилоҳоти илмию мактабӣ истифода бар.
- Номи шахсони машҳур, донишмандон ва муаллифонро дар дохили [[Номи пурра]] навис.
- Мафҳум ва истилоҳоти калидиро бо **истилоҳ** ҷудо кун.
- Сарлавҳаҳоро бо ## ва зерсарлавҳаҳоро бо ### навис. Барои рӯйхат аломати • ё рақам истифода бар.
- Агар муқоиса ё маълумоти сохторӣ бошад, ҷадвали Markdown (| ... |) соз.
- Дар сатри охирини посух (агар мувофиқ бошад) ин барчаспро навис: @@МАВЗӮЪ: Номи кӯтоҳи мавзӯъ`,
  ru: `
ПРАВИЛА ОФОРМЛЕНИЯ (обязательно):
- Отвечай грамотным литературным русским языком в стиле учебного пособия.
- Имена учёных, писателей и исторических лиц выделяй как [[Полное Имя]].
- Ключевые термины и понятия выделяй как **термин**.
- Разделы оформляй через ## и ###, списки через • или нумерацию, сравнения — через таблицы Markdown (| ... |).
- В самом конце ответа (если уместно) добавь строку: @@МАВЗӮЪ: Краткое название темы`,
  en: `
FORMATTING RULES (mandatory):
- Write clear, academic, well-structured text.
- Wrap notable figures/authors as [[Full Name]] and key concepts as **term**.
- Use ## / ### headings, bullet lists, and Markdown tables where helpful.
- End with one short topic line if appropriate: @@МАВЗӮЪ: Short topic title`,
};

function langKey(code) {
  return code === 'ru' ? 'ru' : code === 'en' ? 'en' : 'tg';
}

function buildSystemPrompt(lang, isChat = false) {
  const l = langKey(lang);
  if (l === 'ru') {
    return (
      'Ты — Алия, умный ИИ-помощник читателя и учителя в системе SmartMaktab & Kitobkhona. ' +
      'Ты помогаешь по учебникам и книгам: делаешь точные конспекты, объясняешь термины, переводишь с сохранением смысла, составляешь тесты, эссе и планы уроков для школы. ' +
      'Отвечай строго на основе переданного фрагмента книги; если в тексте чего-то нет, так и скажи.' +
      (isChat ? '' : FORMAT_RULES.ru)
    );
  }
  if (l === 'en') {
    return (
      'You are Aliya, the AI reading and teaching assistant in SmartMaktab & Kitobkhona. ' +
      'Summarize textbooks clearly, extract key terminology, translate accurately, and create classroom tests and lesson plans grounded strictly in the provided pages.' +
      (isChat ? '' : FORMAT_RULES.en)
    );
  }
  return (
    'Ту — Алия, ёвари зеҳнии китобхон ва омӯзгор дар низоми SmartMaktab ва Китобхона ҳастӣ. ' +
    'Ту танҳо дар асоси матни китоби пешниҳодшуда хулоса, шарҳи калимаҳо, тарҷума, тест, иншо ва нақшаи дарс омода мекунӣ. ' +
    'Ҳеҷ гоҳ маълумоти бардурӯғ наовар — агар чизе дар матн набошад, рост бигӯ.' +
    (isChat ? '' : FORMAT_RULES.tg)
  );
}

function buildTaskPrompt({ task, language, targetLang, mode, questionCount, answerStyle, pageLabel, customQuestion }) {
  const l = langKey(language);
  const count = Math.max(1, Math.min(50, Number(questionCount) || 5));
  const targetName = LANG_LABEL[targetLang] || targetLang || 'Русский';

  if (task === 'summary') {
    return l === 'ru'
      ? `Сделай структурированный, понятный и глубокий пересказ (${pageLabel}): главная идея, ключевые положения, выводы.`
      : `Хулосаи равшан, сохторёфта ва амиқи ин қисматро (${pageLabel}) омода кун: ғояи асосӣ, нуктаҳои муҳим ва хулоса.`;
  }
  if (task === 'words') {
    return l === 'ru'
      ? `Выпиши 8–12 важнейших терминов, сложных слов и понятий со страницы (${pageLabel}). Для каждого дай: **Термин** — простое и точное объяснение по смыслу учебника + краткий пример употребления.`
      : `8–12 истилоҳ ва калимаи калидиро аз ин матн (${pageLabel}) ҷудо кун. Барои ҳар кадом: **Истилоҳ** — шарҳи содаву дақиқ мувофиқи китоб ва мисоли кӯтоҳ.`;
  }
  if (task === 'translate') {
    return l === 'ru'
      ? `Переведи этот фрагмент учебника (${pageLabel}) на язык «${targetName}». Сохрани научную точность, абзацы и смысл оригинала.`
      : `Ин матни китобро (${pageLabel}) ба забони «${targetName}» дақиқ ва адабӣ тарҷума кун. Маъно, сохтор ва истилоҳотро нигоҳ дор.`;
  }
  if (task === 'lesson') {
    return l === 'ru'
      ? `Составь готовый школьный конспект/план урока (45 минут) по этому материалу (${pageLabel}): Цель урока, Задачи, Оргмомент, Объяснение новой темы, Вопросы классу, Практика, Домашнее задание.`
      : `Барои омӯзгор нақшаи мукаммали дарс (45 дақиқа) аз рӯи ҳамин мавод (${pageLabel}) соз: Мақсади дарс, Вазифаҳо, Муқаддима, Баёни мавзӯи нав, Саволҳо ба хонандагон, Кори амалӣ, Вазифаи хонагӣ.`;
  }
  if (task === 'notesTask') {
    return l === 'ru'
      ? `Сформируй короткую, ёмкую учебную заметку для запоминания (${pageLabel}): 3–5 главных тезисов и ключевых дат/формул/идей.`
      : `Барои сабт дар дафтари ёддошт хулосаи кӯтоҳу хотирмон омода кун (${pageLabel}): 3–5 фикри асосӣ, санаҳо ва нуктаҳои калидӣ.`;
  }
  if (task === 'test') {
    if (mode === 'essay') {
      return l === 'ru'
        ? `Напиши развёрнутое учебное сочинение по теме материала (${pageLabel}): Введение, Основная часть с аргументами из текста, Заключение.`
        : `Дар асоси маводи додашуда (${pageLabel}) иншои пурмазмун навис: Сарсухан, Қисми асосӣ бо далелҳо аз матн, Хулоса.`;
    }
    if (mode === 'argument') {
      return l === 'ru'
        ? `Напиши аналитическое эссе-рассуждение по материалу (${pageLabel}): Тезис, 2–3 аргумента с опорой на текст, Итоговый вывод.`
        : `Эссеи таҳлилӣ навис (${pageLabel}): Тезис, 2–3 далел аз матни китоб, Хулосаи ниҳоӣ.`;
    }
    if (mode === 'short') {
      return l === 'ru'
        ? `Напиши компактное мини-сочинение (120–180 слов) по теме этого фрагмента (${pageLabel}).`
        : `Иншои хурд (120–180 калима) дар бораи мавзӯи ҳамин порча (${pageLabel}) навис.`;
    }
    const keyMode =
      answerStyle === 'key_only'
        ? l === 'ru'
          ? 'В самих вопросах правильный вариант не отмечай — в самом конце приведи блок «🔑 Ключи: 1-А, 2-В, ...».'
          : 'Дар саволҳо ҷавобро нишон надеҳ — танҳо дар охир бахши «🔑 Калидҳо: 1-А, 2-В, ...»-ро биёр.'
        : l === 'ru'
          ? 'Сразу отмечай правильный вариант знаком ✔ и давай короткое пояснение (1 строка).'
          : 'Варианти дурустро бо аломати ✔ нишон деҳ ва шарҳи кӯтоҳ (1 сатр) навис.';
    return l === 'ru'
      ? `Составь ровно ${count} тестовых вопросов с 4 вариантами ответа (А, Б, В, Г) строго по этому фрагменту (${pageLabel}). Формат каждого вопроса: «Савол 1. ...» затем А) ... Б) ... В) ... Г) ... ${keyMode}`
      : `Аз рӯи ҳамин матн (${pageLabel}) дақиқан ${count} саволи тестӣ бо 4 вариант (А, Б, В, Г) соз. Шакли ҳар савол: «Савол 1. ...» сипас А) ... Б) ... В) ... Г) ... ${keyMode}`;
  }
  if (task === 'ask' && customQuestion) {
    return customQuestion;
  }
  return l === 'ru' ? `Разбери и объясни материал (${pageLabel}).` : `Ин маводро (${pageLabel}) шарҳ деҳ.`;
}

function looksTruncated(text) {
  const s = String(text || '').trim();
  if (s.length < 180) return false;
  if (/@@МАВЗӮЪ:[^\n]*$/.test(s)) return false;
  if (/[.!?»)"'\u2026]$/.test(s)) return false;
  return true;
}

export function extractAliyaTopic(raw) {
  const s = String(raw || '');
  const m = s.match(/@@МАВЗӮЪ:\s*(.+)/);
  const topic = m ? m[1].trim() : '';
  const body = s.replace(/\n*@@МАВЗӮЪ:[^\n]*/g, '').trim();
  return { topic, body };
}

function parseReply(json) {
  const reply = json?.reply ?? json?.text ?? json?.content ?? json?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) throw new Error(json?.error || 'unavailable');
  return reply;
}

async function postJson(url, body, signal) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
    signal,
  });
  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (!response.ok) throw new Error(result?.detail || result?.error || `HTTP ${response.status}`);
  return result;
}

export async function runGateway(payload, signal) {
  if (!gatewayEnabled) throw new Error('disabled');
  if (isLocalGateway()) {
    const response = await fetch(new URL('api/aliya/run', appRoot), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      body: JSON.stringify(payload),
      signal,
    });
    const result = await response.json();
    if (!response.ok || typeof result.text !== 'string' || !result.text.trim()) throw new Error(result.error ?? 'unavailable');
    return result.text;
  }

  const base = gatewayEndpoint();
  if (!base) throw new Error('unavailable');

  if (payload.task === 'ocr') {
    const res = await postJson(
      `${base}/v1/vision`,
      {
        image_base64: payload.image,
        prompt:
          payload.prompt ||
          'Транскрибируй весь видимый текст с этой страницы учебника дословно, сохраняя формулы, абзацы, таджикские/русские буквы и нумерацию. Без комментариев.',
        max_tokens: 1800,
      },
      signal
    );
    return parseReply(res);
  }

  const lang = payload.language || 'tg';
  const targetLang = payload.targetLang || payload.language || 'ru';
  const pageLabel = payload.pageLabel || 'саҳ.';
  const bookName = payload.bookName || '';
  const system = buildSystemPrompt(lang, payload.task === 'ask');
  const materialHeader = [
    bookName ? `Китоб / Книга: «${bookName}»` : '',
    pageLabel ? `Саҳифа / Страница: ${pageLabel}` : '',
    '',
    String(payload.text || '').slice(0, 26000),
  ]
    .filter(Boolean)
    .join('\n');

  const taskPrompt = buildTaskPrompt({
    task: payload.task,
    language: lang,
    targetLang,
    mode: payload.mode || 'test',
    questionCount: payload.questionCount || 5,
    answerStyle: payload.answerStyle || 'with_answer',
    pageLabel,
    customQuestion: payload.question,
  });

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `МАВОДИ КИТОБ:\n${materialHeader}` },
    { role: 'assistant', content: langKey(lang) === 'ru' ? 'Понял, материал прочитан. Жду задачу.' : 'Фаҳмидам, мавод хонда шуд. Супоришро интизорам.' },
    ...(Array.isArray(payload.history) ? payload.history.slice(-6) : []),
    { role: 'user', content: taskPrompt },
  ];

  const reqBody = {
    messages,
    max_tokens: payload.task === 'test' || payload.task === 'lesson' ? 2800 : 2200,
    temperature: payload.task === 'translate' ? 0.15 : 0.35,
    reasoning_mode: 'medium',
    target_language: payload.task === 'translate' ? LANG_LABEL[targetLang] || targetLang : LANG_LABEL[langKey(lang)],
  };

  let out = parseReply(await postJson(`${base}/v1/chat`, reqBody, signal));

  // Auto-continue if response cut off mid-sentence (Kitobkhona protocol)
  for (let step = 0; step < 2 && looksTruncated(out); step++) {
    const contMessages = [
      ...messages,
      { role: 'assistant', content: out },
      {
        role: 'user',
        content: langKey(lang) === 'ru' ? 'Продолжи ровно с места обрыва, ничего не повторяй.' : 'Аз ҷои буридашуда бе такрор идома деҳ.',
      },
    ];
    try {
      const extra = parseReply(await postJson(`${base}/v1/chat`, { ...reqBody, messages: contMessages, max_tokens: 1600 }, signal));
      if (!extra || out.endsWith(extra)) break;
      out = `${out}\n${extra}`;
    } catch {
      break;
    }
  }
  return out;
}

export async function generateGatewayPdf({ title, bookName, markdown }, signal) {
  if (isLocalGateway()) return null;
  const base = gatewayEndpoint();
  if (!base) return null;
  const res = await postJson(
    `${base}/v1/document/generate`,
    {
      title: title || 'Алия · SmartMaktab',
      subtitle: bookName || '',
      markdown: String(markdown || ''),
      target_format: 'pdf',
    },
    signal
  );
  const b64 = res?.file_base64 || res?.pdf_base64 || res?.data;
  if (typeof b64 !== 'string' || !b64.trim()) return null;
  const raw = b64.replace(/^data:[^,]+,/, '');
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
