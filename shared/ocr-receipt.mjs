import { getCloudConfig } from './cloud-config.mjs';

export const DEFAULT_PAYMENT_TARIFF = Object.freeze({
  code: 'trial_10',
  priceTjs: 10,
  durationDays: 30,
  recipientPhone: '+992 907972295',
  recipientAccount: '992907972295',
  providers: Object.freeze(['amonat', 'dcity']),
});

export function normalizeRecipientAccount(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 9) return `992${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

export async function hashReceiptBytes(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function parseReceiptText(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();

  // Bank/provider detection (check Amonatbonk first because transfers to DC Wallet include "DC Кошелек").
  let detectedProvider = null;
  if (/амонатбонк|амонат/i.test(normalized)) detectedProvider = 'amonat';
  else if (/душанбе\s+сити|dushanbe\s+city|510022404|dc\s*\(по\s+номеру/i.test(normalized)) detectedProvider = 'dcity';
  else if (/алиф|alif/i.test(normalized)) detectedProvider = 'alif';
  else if (/эсхата|eskhata/i.test(normalized)) detectedProvider = 'eskhata';
  else if (/спитамен|spitamen/i.test(normalized)) detectedProvider = 'spitamen';

  // Primary amount extraction prefers explicit operation/debit labels before falling back to currency tokens.
  const labeledAmount = normalized.match(
    /(?:сумма\s+операции|сумма\s+списания|сумма\s+перевода|сумма\s+оплаты|сумма|маблағ\w*)\s*:+\s*(\d{1,6}(?:[.,]\d{1,2})?)/i,
  );
  const currencyMatches = [...normalized.matchAll(/(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:сомон[иӣ]?|tjs|смн|с\.|руб|usd)/gi)];
  const amounts = currencyMatches.map(m => Number(m[1].replace(',', '.'))).filter(n => Number.isFinite(n) && n > 0);
  const labeledValue = labeledAmount ? Number(labeledAmount[1].replace(',', '.')) : null;
  const detectedAmount = (Number.isFinite(labeledValue) && labeledValue > 0)
    ? labeledValue
    : (amounts.length ? Math.max(...amounts) : null);

  const dateMatch = normalized.match(/\b(\d{2}[./-]\d{2}[./-]20\d{2})\b/);
  const timeMatch = normalized.match(/\b([012]?\d:[0-5]\d(?::[0-5]\d)?)\b/);
  const txMatch = normalized.match(
    /(?:номер\s+операции|номер\s+транзакции|чек\s*№?|trx|tx|id|квитанц\w*|рақам\w*|операц\w*)[\s:#№-]*([a-z0-9-]{5,32})/i,
  );
  const recipientMatch = normalized.match(
    /(?:сч[её]т\s+получателя|сч[её]т\s+зачисления|получатель|номер\s+телефона|телефон|қабулкунанда|гиранда)\s*:+\s*(\+?[\d\s()-]{9,18})/i,
  );
  const detectedRecipient = normalizeRecipientAccount(recipientMatch?.[1] || '');
  const cardMatch = normalized.match(/(?:\*{2,4}|x{2,4}|•{2,4})\s*(?:amo\*{2,4}\s*)?(\d{4})/i);
  const statusConfirmed = /успешн\w*|операция\s+выполнена|исполнен\w*|муваффақ\w*|иҷро\s+шуд|бомуваффақият/i.test(normalized);

  return {
    normalized,
    amounts,
    detectedProvider,
    detectedAmount,
    detectedDate: dateMatch ? dateMatch[1] : null,
    detectedTime: timeMatch ? timeMatch[1] : null,
    detectedReference: txMatch ? txMatch[1] : null,
    detectedRecipient,
    cardLast4: cardMatch ? cardMatch[1] : null,
    statusConfirmed,
  };
}

export async function runClientOcr(fileOrBlob, recognizeFn = null) {
  if (typeof recognizeFn === 'function') {
    const out = await recognizeFn(fileOrBlob);
    return {
      text: String(out?.text || out?.data?.text || '').trim(),
      confidence: typeof out?.confidence === 'number' ? out.confidence : (typeof out?.data?.confidence === 'number' ? out.data.confidence : null),
    };
  }
  if (globalThis.Tesseract?.recognize) {
    const res = await globalThis.Tesseract.recognize(fileOrBlob, 'rus+eng');
    return {
      text: String(res?.data?.text || '').trim(),
      confidence: typeof res?.data?.confidence === 'number' ? res.data.confidence : null,
    };
  }
  return { text: '', confidence: null };
}

export async function submitReceiptForVerification({
  accessToken,
  organizationId,
  bytes,
  imageBase64 = '',
  providerCode = 'manual',
  amountDeclared = null,
  currency = 'TJS',
  ocrText = '',
  ocrConfidence = null,
  planCode = DEFAULT_PAYMENT_TARIFF.code,
  primaryPosition = null,
  extraPositions = [],
  includeAliya = false,
  months = 1,
  config = getCloudConfig(),
  fetchImpl = globalThis.fetch,
}) {
  if (!accessToken) throw new Error('Authentication token required');
  if (!organizationId) throw new Error('Organization ID required');
  const receiptHash = await hashReceiptBytes(bytes);
  const parsedLocal = parseReceiptText(ocrText);
  const response = await fetchImpl(`${config.url}/functions/v1/verify-payment-receipt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      organization_id: organizationId,
      receipt_hash: receiptHash,
      image_base64: imageBase64 || undefined,
      provider_code: parsedLocal.detectedProvider || providerCode,
      amount_declared: amountDeclared,
      currency,
      ocr_text: ocrText,
      ocr_confidence: ocrConfidence,
      transaction_id: parsedLocal.detectedReference || undefined,
      recipient_account: parsedLocal.detectedRecipient || undefined,
      status_confirmed: parsedLocal.statusConfirmed,
      plan_code: planCode,
      primary_position: primaryPosition || undefined,
      extra_positions: Array.isArray(extraPositions) && extraPositions.length ? extraPositions : undefined,
      include_aliya: Boolean(includeAliya),
      months: [1, 3, 6, 9, 12].includes(Number(months)) ? Number(months) : 1,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload?.error || `Receipt submission failed (${response.status})`);
    err.status = response.status;
    err.code = payload?.error || 'request_failed';
    throw err;
  }
  return { ...payload, receipt_hash: receiptHash };
}
