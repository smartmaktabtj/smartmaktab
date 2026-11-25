import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function normalizeRecipient(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 9) return `992${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

function parseReceiptText(text: string) {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();

  let detected_provider: string | null = null;
  if (/амонатбонк|амонат/i.test(normalized)) detected_provider = 'amonat';
  else if (/душанбе\s+сити|dushanbe\s+city|510022404|dc\s*\(по\s+номеру/i.test(normalized)) detected_provider = 'dcity';
  else if (/алиф|alif/i.test(normalized)) detected_provider = 'alif';
  else if (/эсхата|eskhata/i.test(normalized)) detected_provider = 'eskhata';
  else if (/спитамен|spitamen/i.test(normalized)) detected_provider = 'spitamen';

  const labeledAmount = normalized.match(
    /(?:сумма\s+операции|сумма\s+списания|сумма\s+перевода|сумма\s+оплаты|сумма|маблағ\w*)\s*:+\s*(\d{1,6}(?:[.,]\d{1,2})?)/i,
  );
  const currencyMatches = [...normalized.matchAll(/(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:сомон[иӣ]?|tjs|смн|с\.|руб|usd)/gi)];
  const amounts = currencyMatches.map(m => Number(m[1].replace(',', '.'))).filter(n => Number.isFinite(n) && n > 0);
  const labeledVal = labeledAmount ? Number(labeledAmount[1].replace(',', '.')) : null;
  const detected_amount = (labeledVal !== null && Number.isFinite(labeledVal) && labeledVal > 0)
    ? labeledVal
    : (amounts.length ? Math.max(...amounts) : null);

  const dateMatch = normalized.match(/\b(\d{2}[./-]\d{2}[./-]20\d{2})\b/);
  const timeMatch = normalized.match(/\b([012]?\d:[0-5]\d(?::[0-5]\d)?)\b/);
  const txMatch = normalized.match(
    /(?:номер\s+операции|номер\s+транзакции|чек\s*№?|trx|tx|id|квитанц\w*|рақам\w*|операц\w*)[\s:#№-]*([a-z0-9-]{5,32})/i,
  );
  const recipientMatch = normalized.match(
    /(?:счет\s+получателя|счет\s+зачисления|получатель|қабулкунанда|гиранда)\s*:+\s*(\+?[\d\s()-]{9,18})/i,
  );
  const detected_recipient = normalizeRecipient(recipientMatch?.[1] || '');
  const status_confirmed = /успешн\w*|операция\s+выполнена|исполнен\w*|муваффақ\w*|иҷро\s+шуд|бомуваффақият/i.test(normalized);

  return {
    amounts,
    detected_provider,
    detected_amount,
    detected_date: dateMatch ? dateMatch[1] : null,
    detected_time: timeMatch ? timeMatch[1] : null,
    detected_reference: txMatch ? txMatch[1] : null,
    detected_recipient,
    status_confirmed,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const orgId = typeof body?.organization_id === 'string' ? body.organization_id : '';
    const receiptHash = typeof body?.receipt_hash === 'string' ? body.receipt_hash.trim().toLowerCase() : '';
    const requestedProvider = typeof body?.provider_code === 'string' ? body.provider_code.trim().toLowerCase() : 'manual';
    const planCode = typeof body?.plan_code === 'string' && body.plan_code.trim() ? body.plan_code.trim().toLowerCase() : 'trial_10';
    const currency = typeof body?.currency === 'string' ? body.currency.trim() : 'TJS';
    let ocrText = typeof body?.ocr_text === 'string' ? body.ocr_text : '';
    let ocrSource = ocrText ? 'client_tesseract' : 'none';
    let ocrConfidence = typeof body?.ocr_confidence === 'number' ? body.ocr_confidence : null;

    if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[a-f0-9]{64}$/.test(receiptHash)) {
      return new Response(JSON.stringify({ error: 'invalid_parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optional server-side OCR.space extraction when OCR_SPACE_API_KEY secret is present.
    const ocrKey = Deno.env.get('OCR_SPACE_API_KEY');
    if (ocrKey && typeof body?.image_base64 === 'string' && body.image_base64.length > 32) {
      try {
        const form = new FormData();
        form.append('base64Image', body.image_base64);
        form.append('language', 'rus');
        form.append('isOverlayRequired', 'false');
        form.append('OCREngine', '2');
        const ocrRes = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          headers: { apikey: ocrKey },
          body: form,
        });
        if (ocrRes.ok) {
          const ocrJson = await ocrRes.json();
          const parsedText = ocrJson?.ParsedResults?.map((r: { ParsedText?: string }) => r.ParsedText || '').join('\n').trim();
          if (parsedText) {
            ocrText = parsedText;
            ocrSource = 'ocr_space';
            if (ocrConfidence === null) ocrConfidence = 0.85;
          }
        }
      } catch {
        // Fallback gracefully to client text + manual super_admin review
      }
    }

    const parsed = parseReceiptText(ocrText);
    const providerCode = parsed.detected_provider || requestedProvider || 'manual';
    const amountDeclared = parsed.detected_amount ?? (
      typeof body?.amount_declared === 'number' && body.amount_declared >= 0 ? body.amount_declared : null
    );
    const txId = parsed.detected_reference || (typeof body?.transaction_id === 'string' ? body.transaction_id : null);
    const recipient = parsed.detected_recipient || normalizeRecipient(typeof body?.recipient_account === 'string' ? body.recipient_account : '');
    const statusConfirmed = parsed.status_confirmed || body?.status_confirmed === true;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await userClient.rpc('submit_payment_receipt', {
      p_org_id: orgId,
      p_receipt_hash: receiptHash,
      p_provider_code: providerCode,
      p_amount_declared: amountDeclared,
      p_currency: currency,
      p_ocr_text: ocrText.slice(0, 8000),
      p_ocr_confidence: ocrConfidence,
      p_ocr_payload: { source: ocrSource, ...parsed },
      p_transaction_id: txId,
      p_recipient_account: recipient,
      p_status_confirmed: statusConfirmed,
      p_plan_code: planCode,
    });

    if (error) {
      const status = error.code === '23505' ? 409 : error.code === '42501' ? 403 : 400;
      return new Response(JSON.stringify({ error: error.code === '23505' ? 'duplicate_receipt' : error.message }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ submission_id: data, ocr_source: ocrSource, parsed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
