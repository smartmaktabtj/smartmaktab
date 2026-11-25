import { getCloudConfig } from './cloud-config.mjs';

export async function hashReceiptBytes(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function parseReceiptText(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const amountMatches = [...normalized.matchAll(/(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:сомон[иӣ]?|tjs|смн|с\.|руб|usd)/gi)];
  const amounts = amountMatches.map(m => Number(m[1].replace(',', '.'))).filter(n => Number.isFinite(n) && n > 0);
  const dateMatch = normalized.match(/\b(\d{2}[./-]\d{2}[./-]20\d{2})\b/);
  const txMatch = normalized.match(/(?:trx|tx|id|чек|квитанц\w*|рақам\w*|операц\w*)[\s:#№-]*([a-z0-9-]{5,32})/i);
  const cardMatch = normalized.match(/(?:\*{2,4}|x{2,4}|•{2,4})\s*(\d{4})/i);
  return {
    normalized,
    amounts,
    detectedAmount: amounts.length ? Math.max(...amounts) : null,
    detectedDate: dateMatch ? dateMatch[1] : null,
    detectedReference: txMatch ? txMatch[1] : null,
    cardLast4: cardMatch ? cardMatch[1] : null,
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
  config = getCloudConfig(),
  fetchImpl = globalThis.fetch,
}) {
  if (!accessToken) throw new Error('Authentication token required');
  if (!organizationId) throw new Error('Organization ID required');
  const receiptHash = await hashReceiptBytes(bytes);
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
      provider_code: providerCode,
      amount_declared: amountDeclared,
      currency,
      ocr_text: ocrText,
      ocr_confidence: ocrConfidence,
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
