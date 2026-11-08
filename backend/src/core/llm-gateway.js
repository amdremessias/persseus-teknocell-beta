export function normalizeChatCompletionsUrl(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) throw new Error('BIA_LLM_BASE_URL não configurado');
  const url = new URL(raw);
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/chat/completions')) return url.toString();
  url.pathname = path.endsWith('/v1') ? path + '/chat/completions' : path + '/v1/chat/completions';
  return url.toString();
}

export function extractChatCompletionContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((part) => typeof part?.text === 'string' ? part.text : '').join('').trim();
  return '';
}

export async function callOpenAiCompatible({ baseUrl, apiKey, model, messages, timeoutMs = 30000 }) {
  const endpoint = normalizeChatCompletionsUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 30000));
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: model || 'default', messages, temperature: 0.3, max_tokens: 900 }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('LLM gateway HTTP ' + response.status);
    const data = await response.json().catch(() => null);
    const text = extractChatCompletionContent(data);
    if (!text) throw new Error('LLM gateway retornou conteúdo vazio');
    return text;
  } finally {
    clearTimeout(timer);
  }
}
