// Novo payload stateless — n8n recebe contexto pronto, não precisa buscar histórico
// Atualizar workflow n8n para "BIA AI Service v3" conforme Tarefa 5
import { getSetting } from '../lib/settings-cache.js';

export async function fireBia({ leadId, mensagemCliente, canal, contexto = [] }) {
  const url = getSetting('N8N_BIA_URL', 'https://n8n.teknoscel.shop/webhook/bia-processar');
  if (!url) {
    console.warn('[bia-client] N8N_BIA_URL não configurado');
    return;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, mensagemCliente, canal, contexto }),
    });
    const body = await res.text().catch(() => '');
    console.log(`[bia-client] n8n status=${res.status} body=${body.slice(0, 200)}`);
  } catch (err) {
    console.error('[bia-client] erro ao chamar n8n:', err.message);
  }
}
