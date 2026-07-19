import Anthropic from "@anthropic-ai/sdk";
import prisma from "../lib/prisma.js";
import { getSetting } from "../lib/settings-cache.js";

function buildClient() {
  const apiKey = getSetting("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export async function getSuggestions(leadId) {
  const client = buildClient();
  if (!client) {
    console.warn("[suggestions] ANTHROPIC_API_KEY não configurada — sugestões desabilitadas");
    return [];
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      messages: {
        orderBy: { criadoEm: "desc" },
        take: 10,
      },
    },
  });
  if (!lead) return [];

  const history = lead.messages
    .reverse()
    .map((m) => `[${m.tipo}]: ${m.texto}`)
    .join("\n");

  const ficha = [
    lead.nome && `Nome: ${lead.nome}`,
    lead.interesse && `Interesse: ${lead.interesse}`,
    lead.modeloDesejado && `Modelo desejado: ${lead.modeloDesejado}`,
    lead.faixaInvestimento && `Faixa: ${lead.faixaInvestimento}`,
    lead.vaiTrocar !== null && `Vai trocar: ${lead.vaiTrocar ? "Sim" : "Não"}`,
    lead.observacoes && `Obs: ${lead.observacoes}`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Você é um assistente de vendas de veículos. Com base na ficha do lead e no histórico recente, sugira 3 respostas curtas e naturais que o atendente pode enviar agora. Responda APENAS com um JSON array de strings, sem explicações.\n\nFicha:\n${ficha}\n\nHistórico:\n${history}`;

  const response = await client.messages.create({
    model: getSetting("CLAUDE_MODEL", "claude-sonnet-4-20250514"),
    max_tokens: 400,
    system: "Você é um assistente de CRM para concessionária. Responda sempre em português brasileiro.",
    messages: [{ role: "user", content: prompt }],
  });

  try {
    const text = response.content[0].text.trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]") + 1;
    return JSON.parse(text.slice(start, end));
  } catch {
    return [];
  }
}
