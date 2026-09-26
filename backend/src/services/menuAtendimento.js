// ── MENU DE ATENDIMENTO ─────────────────────────────────────────────────────
// Fluxo determinístico para novos contatos no WhatsApp:
//   boas-vindas + menu (Comercial | Suporte | Financeiro | Ouvidoria)
//   → coleta do pedido → handoff pendente ("quem vê, assume").
// Roda ANTES do dispatch da BIA: enquanto o menu consome a mensagem, a BIA não
// é acionada (a BIA só assume conversas livres, depois do menu ou sem menu).
//
// Estado salvo em lead.metadata:
//   menu: { etapa: 'aguardando' | 'coletando' | 'feito', fila?, requisicao?, criadoEm }
//   fila: nome da fila de destino (para surfacer no chat)
//   handoffPendenteDesde: marca p/ re-alerta do handoffWatch (quando transferido)
import prisma from "../lib/prisma.js";
import redis from "../lib/redis.js";
import { getSettingBool } from "../lib/settings-cache.js";
import { sendToCustomer } from "../core/outbound.js";

const MENU_OPTIONS = [
  { fila: "Comercial",  keys: ["1", "comercial", "venda", "vendas", "comprar", "iphone", "maquininha", "orcamento", "produto", "parcelar"] },
  { fila: "Suporte",    keys: ["2", "suporte", "assistencia", "defeito", "conserto", "garantia", "tela", "bateria"] },
  { fila: "Financeiro", keys: ["3", "financeiro", "boleto", "pagamento", "nota", "cobranca", "fatura", "parcela"] },
  { fila: "Ouvidoria",  keys: ["4", "ouvidoria", "reclamacao", "reclamar", "elogio"] },
];

const MANUAL_KEYS = ["0", "atendente", "humano", "agente", "falar com", "falar com alguem"];

const FILA_TAG_SLUG = { Comercial: "fila-comercial", Suporte: "fila-suporte", Financeiro: "fila-financeiro", Ouvidoria: "fila-ouvidoria" };

const TEXTO_BEM_VINDO = `Olá! 👋 Bem-vindo(a) à *TeknosCel*.
Como posso te ajudar? Escolha uma opção:

1️⃣ *Comercial* — comprar iPhone, maquininha ou cotar produtos
2️⃣ *Suporte* — assistência técnica, conserto ou garantia
3️⃣ *Financeiro* — boletos, pagamentos ou nota fiscal
4️⃣ *Ouvidoria* — reclamações e assuntos formais

Digite o número da opção (ou *0* para falar com um atendente agora).`;

const TEXTO_PEDIDO = "Pode me contar em detalhes o que você precisa? ✍️";
const TEXTO_ESCOLHER_FILA = "Entendi sua necessidade. Pra eu encaminhar pro setor certo, me confirma qual opção combina com você: *1* Comercial, *2* Suporte, *3* Financeiro, *4* Ouvidoria (ou *0* p/ atendente).";
const TEXTO_OPCAO_INVALIDA = `Hmm, não reconheci essa opção. 😕
Escolha: *1* Comercial, *2* Suporte, *3* Financeiro, *4* Ouvidoria (ou *0* pra falar com um atendente).`;

function normalizar(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function acharFila(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  const num = t.replace(/[^\d]/g, "");
  for (const op of MENU_OPTIONS) {
    if (num && op.keys.includes(num[0])) return op.fila;
    if (op.keys.some((k) => t === k || t.includes(k))) return op.fila;
  }
  return null;
}

function ehManual(texto) {
  const t = normalizar(texto);
  return MANUAL_KEYS.some((k) => t === k || t.includes(k));
}

function proximoEstado(meta) {
  const menu = meta.menu && typeof meta.menu === "object" ? meta.menu : {};
  return menu.etapa ?? null;
}

// Marca handoff pendente + fila + tag, desliga BIA, emite banner.
async function transferirParaHumano(lead, fila, requisicao, io) {
  const meta = lead.metadata && typeof lead.metadata === "object" ? { ...lead.metadata } : {};
  const tags = Array.isArray(lead.tags) ? lead.tags : [];
  const slug = FILA_TAG_SLUG[fila] ?? (fila ? `fila-${normalizar(fila).replace(/\s+/g, "-")}` : null);

  const novoMeta = {
    ...meta,
    fila: fila || meta.fila || "Geral",
    menu: { etapa: "feito", fila: fila || null, requisicao: requisicao || meta.menu?.requisicao || null, criadoEm: meta.menu?.criadoEm || new Date().toISOString() },
    handoffPendenteDesde: meta.handoffPendenteDesde || new Date().toISOString(),
  };
  const novasTags = slug && !tags.includes(slug) ? [...tags, slug] : tags;

  await prisma.lead.update({
    where: { id: lead.id },
    data: { biaAtiva: false, metadata: novoMeta, tags: novasTags },
  });

  const nomeAtual = lead.nome || "Lead";
  io?.emit("handoff:new", {
    lead_id: lead.id,
    lead_nome: nomeAtual,
    lead_telefone: lead.telefone,
    handoff_reason: `Fila: ${novoMeta.fila}`,
    fila: novoMeta.fila,
    agente_id: null,
    agente_nome: null,
    timestamp: new Date().toISOString(),
  });

  const filaLower = (novoMeta.fila || "").toLowerCase();
  const confirmacao = `Recebido! ✅ Encaminhei seu pedido para o time de *${novoMeta.fila}*.\nUm atendente vai te atender em instantes. Obrigado pela paciência! 🙏` + (filaLower === "ouvidoria" ? "\n\n*Protocolo de ouvidoria:* seu caso ficará registrado para análise." : "");

  await sendToCustomer(lead.id, confirmacao).catch((err) =>
    console.error("[menu] confirmacao de handoff falhou:", err.message)
  );

  console.log(`[menu] handoff pendente lead=${lead.id} fila="${novoMeta.fila}" req="${(requisicao || meta.menu?.requisicao || "").slice(0, 80)}"`);
  return { handled: true };
}

// Ponto único de interação. Retorna { handled: true } quando o menu consumiu a
// mensagem (BIA não deve ser acionada) ou { handled: false } caso contrário.
export async function handleMenuAtendimento({ lead, texto, io, reaberto = false }) {
  try {
    // Só entra em WhatsApp, lead sem dono e com BIA ligada (menu = atendimento automático).
    if (lead.canal !== 'whatsapp') return { handled: false };
    if (lead.atendenteId) return { handled: false };

    const enabled = getSettingBool("MENU_ATENDIMENTO", true);
    if (!enabled) return { handled: false };

    const meta = lead.metadata && typeof lead.metadata === "object" ? { ...lead.metadata } : {};
    const etapa = proximoEstado(meta);
    const t = String(texto ?? "");

    // Primeiro contato (sem estado de menu): só ativa quando o lead ainda não
    // tem nenhuma mensagem de cliente anterior (leads antigos seguem com a BIA).
    // Guards de corrida: o bootstrap usa lock no Redis p/ não duplicar boas-vindas
    // nem liberar a mensagem pra BIA quando chegam eventos concorrentes da WAHA.
    // O flag reaberto permite o menu reiniciar para um contato que voltou DEPOIS
    // de a conversa ter sido finalizada (novo ticket).
    if (!etapa) {
      // Guarda de corrida: a WAHA entrega eventos concorrentes (msg + eco vazio) —
      // só um processo pode "nascer" o menu. Se outro já está bootando, o evento
      // atual é consumido (NÃO vai pra BIA).
      const claimed = await redis.set(`menu:bootstrap:${lead.id}`, "1", "EX", 30, "NX");
      if (!claimed) return { handled: true };

      try {
        // Re-lê o estado fresco: outro evento pode ter commitado o menu enquanto
        // aguardávamos o lock. Se commitou, esse evento é só mais uma mensagem.
        const fresh = await prisma.lead.findUnique({
          where: { id: lead.id },
          select: { metadata: true },
        });
        if (fresh?.metadata?.menu?.etapa) return { handled: true };

        // Lead antigo (já com histórico) sem dono → BIA segue no controle.
        // A menos que a conversa tenha sido reaberta (reaberto=true).
        if (!reaberto) {
          const totalCliente = await prisma.message.count({
            where: { leadId: lead.id, tipo: 'cliente' },
          });
          if (totalCliente > 1) return { handled: false };
        }

        // Commita o estado ANTES de enviar (fecha a janela de corrida).
        await prisma.lead.update({
          where: { id: lead.id },
          data: { metadata: { ...meta, menu: { etapa: "aguardando", criadoEm: new Date().toISOString() } } },
        });
        await sendToCustomer(lead.id, TEXTO_BEM_VINDO).catch((err) =>
          console.error("[menu] envio de boas-vindas falhou:", err.message)
        );
        console.log(`[menu] boas-vindas+menu lead=${lead.id} "${lead.nome || t.slice(0, 40)}"${reaberto ? " (reaberto)" : ""}`);
        return { handled: true };
      } finally {
        await redis.del(`menu:bootstrap:${lead.id}`).catch(() => {});
      }
    }

    // Cliente pediu atendente humano → transferência imediata.
    if (ehManual(t)) {
      return transferirParaHumano(lead, meta.fila || "Comercial", meta.menu?.requisicao, io);
    }

    const fila = acharFila(t);

    // Estado "aguardando" (menu na tela):
    //   - opção válida → pede detalhes (vai p/ coleta);
    //   - texto livre → guarda a necessidade e pede pra confirmar o setor;
    //   - opção inválida → reexibe o menu.
    if (etapa === "aguardando") {
      if (fila) {
        await sendToCustomer(lead.id, TEXTO_PEDIDO).catch(() => {});
        await prisma.lead.update({
          where: { id: lead.id },
          data: { metadata: { ...meta, menu: { ...meta.menu, etapa: "coletando", fila, requisicao: null } } },
        });
        console.log(`[menu] coleta iniciada lead=${lead.id} fila="${fila}"`);
        return { handled: true };
      }
      if (t.trim()) {
        await sendToCustomer(lead.id, TEXTO_ESCOLHER_FILA).catch(() => {});
        await prisma.lead.update({
          where: { id: lead.id },
          data: { metadata: { ...meta, menu: { ...meta.menu, requisicao: t.trim().slice(0, 2000) } } },
        });
        console.log(`[menu] necessidade anotada lead=${lead.id}: "${t.trim().slice(0, 80)}"`);
        return { handled: true };
      }
      // Texto vazio (eco/duplicata): não responde, mas NÃO libera pra BIA —
      // o menu segue dono da conversa até a coleta/transferência concluir.
      return { handled: true };
    }

    // Estado "coletando": qualquer texto é o pedido → transfere pra fila escolhida.
    if (etapa === "coletando") {
      const filaEscolhida = meta.menu?.fila || fila || "Comercial";
      const requisicao = t.trim() || meta.menu?.requisicao;
      return transferirParaHumano(lead, filaEscolhida, requisicao, io);
    }

    // "feito" → menu encerrado; não intercepta (BIA segue desligada pelo biaAtiva=false).
    return { handled: false };
  } catch (err) {
    console.error("[menu] erro no fluxo de menu:", err.message);
    return { handled: false };
  }
}