import prisma from '../lib/prisma.js';
import { getSetting } from '../lib/settings-cache.js';

// IA Agent state management - tracks active sessions and training data
const activeSessions = new Map();

export async function processIARequest({ leadId, mensagemCliente, canal, contexto = [] }) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error('[ia-agent] Lead not found: ' + leadId);

  // Check if IA is enabled globally
  const iaEnabled = getSetting('IA_ENABLED', false);
  if (iaEnabled === false || iaEnabled === 'false') {
    console.log('[ia-agent] IA disabled globally, skipping');
    return { success: false, reason: 'ia_disabled', resposta: null };
  }

  // Check lead-level biaAtiva flag
  if (!lead.biaAtiva) {
    console.log('[ia-agent] Lead biaAtiva=false, skipping');
    return { success: false, reason: 'lead_inactive', resposta: null };
  }

  // Build rich context for the IA model
  const context = buildIAContext(lead, mensagemCliente, contexto);

  // Call Anthropic/Claude API
  const { AnthropicSDK } = require('@anthropic-ai/sdk');
  const sdk = new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await sdk.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1000,
      temperature: 0.7,
      messages: [{ role: 'user', content: context }],
    });

    const resposta = response.content[0].text;
    console.log('[ia-agent] IA response for lead', leadId);

    // Store the session for tracking
    activeSessions.set(leadId, {
      timestamp: Date.now(),
      resposta,
    });

    return { success: true, resposta };
  } catch (err) {
    console.error('[ia-agent] Claude API error:', err.message);
    // Fallback: return graceful message instead of crashing
    return { 
      success: false, 
      reason: 'api_error', 
      resposta: 'Desculpe, estou tendo dificuldade para responder no momento. Um atendente humano será notificado.' 
    };
  }
}

function buildIAContext(lead, mensagemCliente, contexto) {
  // Build structured context from lead data + conversation history
  const leadInfo = `Lead: ${lead.nome || 'Anônimo'} (${lead.telefone || 'sem telefone'})\n`;
  const canalInfo = `Canal: ${lead.canal || 'whatsapp'}\n`;
  const pipelineInfo = `Pipeline: ${lead.statusPipeline || 'novo'}\n`;
  const biaInfo = `BIA Ativa: ${lead.biaAtiva}\n`;

  // Format conversation history
  const historico = contexto
    .filter(m => m.texto && m.texto.trim())
    .slice(-10) // last 10 messages
    .map((m, i) => {
      const prefix = m.tipo === 'cliente' ? 'Cliente' : 'BIA/Atendente';
      return `${prefix}${i + 1}: ${m.texto}`;
    })
    .join('\n');

  const contextoInfo = historico ? `Histórico da conversa:\n${historico}\n` : '';

  // Instructions for the IA
  const instrucoes = `
INSTRUÇÕES PARA IA:
1. Seja natural e útil no atendimento ao cliente
2. Seja breve e direto (máximo 2-3 frases por resposta)
3. Se não souber a resposta, sugira que um atendente humano entre em contato
4. Use o nome do cliente quando possível
5. Mantenha o tom profissional e empático
6. Nunca invente números de produto, preços ou dados técnicos
7. Se o cliente pedir para falar com humano, aceite e ofereça a transição
8. Respeite o horário comercial se mencionado
`;

  return `${leadInfo}${canalInfo}${pipelineInfo}${biaInfo}${contextoInfo}${instrucoes}Mensagem do cliente atual: "${mensagemCliente}"\nResposta da IA:`;
}

/**
 * Store IA feedback for model improvement
 */
export async function storeIAFeedback({ leadId, feedback, correcao, userId }) {
  try {
    await prisma.iaFeedback.create({
      data: {
        leadId,
        feedback,        // e.g. "útil", "inútil", "precisa melhorar"
        correcao,        // the corrected response
        userId,
        criadoEm: new Date(),
      },
    });
    console.log('[ia-agent] Feedback stored for lead', leadId);
    return true;
  } catch (err) {
    console.error('[ia-agent] erro ao stored feedback:', err.message);
    return false;
  }
}

/**
 * Get recent IA activity for a lead
 */
export function getIAActivity(leadId) {
  const session = activeSessions.get(leadId);
  if (!session) return null;
  
  const age = Date.now() - session.timestamp;
  const ageMin = Math.round(age / 60000);
  
  return {
    ...session,
    idade_minutos: ageMin,
    expirado: ageMin > 30, // session expires after 30 min
  };
}

/**
 * Get all IA feedback for reporting
 */
export async function getIAFeedbackReport() {
  try {
    const feedbacks = await prisma.iaFeedback.findMany({
      orderBy: { criadoEm: 'desc' },
      take: 100,
      include: {
        user: { select: { nome: true } },
      },
    });
    return feedbacks;
  } catch (err) {
    console.error('[ia-agent] erro ao buscar relatório:', err.message);
    return [];
  }
}