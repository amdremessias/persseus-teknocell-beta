"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChats, type ChatItem, type ChatTag } from "@/hooks/useChats";
import { useChatStats } from "@/hooks/useChatStats";
import { useSocket } from "@/hooks/useSocket";
import { useAuth } from "@/store/auth";
import { useMobileNav } from "@/components/layout/AppShell";
import { useHandoffStore } from "@/store/handoffs";
import SimuladorMaquininha from "@/components/SimuladorMaquininha";
import AvaliacaoIphone from "@/components/AvaliacaoIphone";
import api from "@/lib/api";
import { cn, channelBadge, timeAgo, CHANNEL_META } from "@/lib/utils";
import { Bell, Menu, MessageSquarePlus, Pin, Search, SlidersHorizontal, UserCheck, X } from "lucide-react";

interface Atendente {
  id: string;
  nome: string;
}

interface ContactResult {
  id: string;
  nome: string;
  telefone?: string;
  canal?: string;
}

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function isLikelyPhone(v: string) {
  return v.replace(/\D/g, "").length >= 8;
}

function formatPhoneDisplay(v: string) {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}

const STATUS_LABEL: Record<ChatItem["status"], { label: string; color: string }> = {
  aguardando:           { label: "Aguardando",      color: "bg-yellow-100 text-yellow-700" },
  bia_atendendo:        { label: "Bia atendendo",   color: "bg-purple-100 text-purple-700" },
  atendente_atendendo:  { label: "Atendendo",       color: "bg-blue-100 text-blue-700" },
  finalizado:           { label: "Finalizado",      color: "bg-gray-200 text-gray-600" },
};

export default function ConversationList({ selectedId, onSelect }: Props) {
  const { user } = useAuth();
  const mobileNav = useMobileNav();
  const handoffPending = useHandoffStore((s) => s.pending);
  const clearHandoff = useHandoffStore((s) => s.clear);
  const handoffIdSet = useMemo(() => new Set(handoffPending.map((e) => e.leadId)), [handoffPending]);
  const handoffCount = handoffPending.length;
  const [q, setQ] = useState("");
  const [canal, setCanal] = useState("");
  const [atendenteIdSelect, setAtendenteIdSelect] = useState("");
  const [tagId, setTagId] = useState("");
  const [meusFiltro, setMeusFiltro] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("chats:meusFiltro") === "1";
  });
  const atendenteId = meusFiltro ? (user?.id ?? "") : atendenteIdSelect;
  const [atendentes, setAtendentes] = useState<Atendente[]>([]);
  const [tags, setTags] = useState<ChatTag[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (q) p.search = q;
    if (canal) p.canal = canal;
    if (atendenteId) p.atendenteId = atendenteId;
    if (tagId) p.tagId = tagId;
    return p;
  }, [q, canal, atendenteId, tagId]);

  const { items, total, loading, refetch } = useChats(params);
  const meuId = user?.id;
  const { total: meuCount, refetch: refetchMeu } = useChats(
    meuId ? { atendenteId: meuId } : {},
    !meuId
  );
  const refetchAll = useCallback(() => { refetch(); refetchMeu(); }, [refetch, refetchMeu]);
  const stats = useChatStats();

  useSocket("lead:new", refetchAll);
  useSocket("lead:updated", refetchAll);
  useSocket("lead:deleted", refetchAll);
  useSocket("message:incoming", refetchAll);
  useSocket("message:new", refetchAll);

  useEffect(() => {
    api.get("/users").then((r) => {
      const list = Array.isArray(r.data) ? r.data : r.data?.users || [];
      setAtendentes(list);
    }).catch(() => setAtendentes([]));
    api.get("/tags").then((r) => {
      const list = Array.isArray(r.data) ? r.data : r.data?.tags || [];
      setTags(list);
    }).catch(() => setTags([]));
  }, []);

  function toggleMeusFiltro() {
    const next = !meusFiltro;
    setMeusFiltro(next);
    localStorage.setItem("chats:meusFiltro", next ? "1" : "0");
  }

  function handleSelectChat(id: string) {
    clearHandoff(id);
    onSelect(id);
  }

  async function handleAssumirInline(e: React.MouseEvent, leadId: string) {
    e.stopPropagation();
    if (!user) return;
    await api.post(`/leads/${leadId}/assign`, { atendenteId: user.id }).catch(() => null);
    onSelect(leadId);
    refetch();
  }

  function openNewChat() {
    setContactSearch("");
    setContactResults([]);
    setNewChatOpen(true);
  }

  function onContactSearchChange(v: string) {
    setContactSearch(v);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!v.trim()) { setContactResults([]); return; }
    setContactLoading(true);
    searchRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/contacts", { params: { q: v, limit: 10 } });
        setContactResults(data.contacts || []);
      } catch {
        setContactResults([]);
      } finally {
        setContactLoading(false);
      }
    }, 300);
  }

  async function startConversation(contact: ContactResult) {
    setCreating(true);
    try {
      const { data } = await api.post("/conversations/from-contact", { contactId: contact.id });
      setNewChatOpen(false);
      refetch();
      onSelect(data.leadId);
    } catch {
      alert("Erro ao iniciar conversa");
    } finally {
      setCreating(false);
    }
  }

  async function startConversationFromPhone(telefone: string) {
    setCreating(true);
    try {
      const { data } = await api.post("/conversations/from-phone", { telefone });
      setNewChatOpen(false);
      refetch();
      onSelect(data.leadId);
    } catch (err: any) {
      alert(err?.response?.data?.error || "Erro ao iniciar conversa");
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="flex flex-col h-full bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => mobileNav?.open()}
            className="md:hidden p-2 -ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition shrink-0"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>

          <h2 className="text-base font-bold text-gray-900 flex-1">Chats</h2>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">{total}</span>
            {handoffCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold"
                title={`${handoffCount} handoff${handoffCount > 1 ? "s" : ""} pendente${handoffCount > 1 ? "s" : ""}`}
              >
                <Bell size={9} />
                {handoffCount}
              </span>
            )}
            {/* Filters toggle — mobile only */}
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className={cn(
                "md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition",
                (canal || atendenteIdSelect || tagId || meusFiltro)
                  ? "text-green-600 bg-green-50"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              )}
              aria-label="Filtros"
              title="Filtros"
            >
              <SlidersHorizontal size={16} />
            </button>
            <button
              onClick={openNewChat}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition"
              title="Nova conversa"
            >
              <MessageSquarePlus size={18} />
            </button>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <SimuladorMaquininha currentUserNivel={user?.nivel} />
          <AvaliacaoIphone currentUserNivel={user?.nivel} />
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-3 py-2.5 md:py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>

        {/* Meus atendimentos toggle */}
        {meuId && (
          <button
            onClick={toggleMeusFiltro}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition border",
              meusFiltro
                ? "bg-green-600 text-white border-green-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-green-400 hover:text-green-600"
            )}
          >
            <span className="flex items-center gap-1.5">
              <UserCheck size={13} />
              Meus atendimentos
            </span>
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
              meusFiltro ? "bg-white/25 text-white" : "bg-gray-100 text-gray-600"
            )}>
              {meusFiltro ? total : meuCount}
            </span>
          </button>
        )}

        {/* Filters — always visible on desktop, toggle on mobile */}
        <div className={cn("grid grid-cols-3 gap-1.5", !filtersOpen && "hidden md:grid")}>
          <select
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
            className="border border-gray-200 rounded-lg px-1.5 py-2 md:py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            <option value="">Canal</option>
            {Object.keys(CHANNEL_META).map((c) => (
              <option key={c} value={c}>{CHANNEL_META[c].label}</option>
            ))}
          </select>
          <select
            value={atendenteIdSelect}
            onChange={(e) => setAtendenteIdSelect(e.target.value)}
            disabled={meusFiltro}
            className={cn(
              "border border-gray-200 rounded-lg px-1.5 py-2 md:py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-green-400",
              meusFiltro && "opacity-40 cursor-not-allowed"
            )}
          >
            <option value="">Atendente</option>
            {atendentes.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
          <select
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            className="border border-gray-200 rounded-lg px-1.5 py-2 md:py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            <option value="">Tag</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-gray-400 text-sm p-4">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-gray-400 text-sm p-4">Nenhuma conversa encontrada</p>
        ) : (
          <ul>
            {items.map((item) => (
              <ConversationCard
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={() => handleSelectChat(item.id)}
                onAssume={(e) => handleAssumirInline(e, item.id)}
                canAssume={item.status === "aguardando"}
                isHandoffPending={handoffIdSet.has(item.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {newChatOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20 px-4"
          onClick={() => !creating && setNewChatOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Nova conversa</h3>
              <button
                onClick={() => setNewChatOpen(false)}
                disabled={creating}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-4 py-3 space-y-2">
              <input
                autoFocus
                type="text"
                value={contactSearch}
                onChange={(e) => onContactSearchChange(e.target.value)}
                placeholder="Buscar por nome, telefone ou e-mail..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              {contactLoading && (
                <p className="text-xs text-gray-400 px-1">Buscando...</p>
              )}
              {!contactLoading && contactSearch && contactResults.length === 0 && !isLikelyPhone(contactSearch) && (
                <p className="text-xs text-gray-400 px-1">Nenhum contato encontrado</p>
              )}
              {!contactLoading && isLikelyPhone(contactSearch) && (
                <button
                  onClick={() => startConversationFromPhone(contactSearch)}
                  disabled={creating}
                  className="w-full text-left px-3 py-2.5 rounded-xl border border-dashed border-green-300 text-green-700 text-sm hover:bg-green-50 transition disabled:opacity-50"
                >
                  ➕ Iniciar conversa com {formatPhoneDisplay(contactSearch)}
                </button>
              )}
              {contactResults.length > 0 && (
                <ul className="divide-y divide-gray-50 max-h-52 overflow-y-auto rounded-xl border border-gray-100">
                  {contactResults.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => startConversation(c)}
                        disabled={creating}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition flex items-center justify-between gap-2 disabled:opacity-50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.nome}</p>
                          {c.telefone && (
                            <p className="text-xs text-gray-400 truncate">{c.telefone}</p>
                          )}
                        </div>
                        {c.canal && (
                          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">
                            {c.canal}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 shrink-0 flex items-center justify-between"
        title={
          stats
            ? `Total hoje: ${stats.hoje.total_conversas}\nAguardando: ${stats.hoje.aguardando}\nBia atendendo: ${stats.hoje.bia_atendendo}\nEm atendimento: ${stats.hoje.em_atendimento}\nFinalizadas: ${stats.hoje.finalizadas}\nSeu atendimento hoje: ${stats.meu_atendimento_hoje}`
            : "carregando stats..."
        }
      >
        <span>
          Hoje:{" "}
          <strong className="text-gray-600">{stats?.hoje.total_conversas ?? "—"}</strong>
        </span>
        <span>
          TMR:{" "}
          <strong className="text-gray-600">
            {stats?.tempo_medio_resposta_minutos != null ? `${stats.tempo_medio_resposta_minutos}min` : "—"}
          </strong>
        </span>
        <span>
          Você:{" "}
          <strong className="text-gray-600">{stats?.meu_atendimento_hoje ?? "—"}</strong>
        </span>
      </div>
    </aside>
  );
}

interface CardProps {
  item: ChatItem;
  selected: boolean;
  onSelect: () => void;
  onAssume: (e: React.MouseEvent) => void;
  canAssume: boolean;
  isHandoffPending: boolean;
}

function ConversationCard({ item, selected, onSelect, onAssume, canAssume, isHandoffPending }: CardProps) {
  const badge = channelBadge(item.canal);
  const time = item.lastMessage ? timeAgo(item.lastMessage.criadoEm) : "";
  const preview = item.lastMessage?.texto || "—";

  const tagObjects: ChatTag[] = item.tags
    .map((t) => (typeof t === "string" ? null : t))
    .filter((t): t is ChatTag => t !== null);
  const visibleTags = tagObjects.slice(0, 3);
  const extraTagCount = tagObjects.length - visibleTags.length;

  const status = STATUS_LABEL[item.status];

  return (
    <li>
      <button
        onClick={onSelect}
        className={cn(
          "w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition flex flex-col gap-1",
          selected
            ? "bg-green-50 border-l-[3px] border-l-green-600"
            : isHandoffPending
              ? "bg-amber-50 border-l-[3px] border-l-amber-500"
              : ""
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {item.unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-green-600 text-white text-[10px] font-bold shrink-0">
                {item.unreadCount > 99 ? "99+" : item.unreadCount}
              </span>
            )}
            {item.pinned && <Pin size={12} className="text-orange-500 shrink-0" fill="currentColor" />}
            <span className={cn("text-sm font-semibold text-gray-900 truncate", item.unreadCount > 0 && "font-bold")}>
              {item.nome || "Lead sem nome"}
            </span>
            <span className={cn("inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] font-bold shrink-0", badge.bg, badge.fg)}>
              {badge.letter}
            </span>
          </div>
          <span className="text-[11px] text-gray-400 shrink-0">{time}</span>
        </div>

        {item.telefone && (
          <p className="text-[11px] text-gray-500 truncate">{item.telefone}</p>
        )}

        <p className={cn("text-xs text-gray-500 truncate", item.unreadCount > 0 && "text-gray-700 font-medium")}>
          {item.lastMessage?.fromMe ? "→ " : ""}{preview}
        </p>

        {visibleTags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {visibleTags.map((t) => (
              <span
                key={t.id}
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white"
                style={{ backgroundColor: t.cor }}
              >
                {t.nome}
              </span>
            ))}
            {extraTagCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-200 text-gray-600">
                +{extraTagCount}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-0.5">
          <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium", status.color)}>
            {status.label}
          </span>
          {canAssume ? (
            <span
              onClick={onAssume}
              role="button"
              className="flex items-center gap-1 text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full hover:bg-green-700 transition cursor-pointer"
            >
              <UserCheck size={10} />
              Assumir
            </span>
          ) : item.atendenteAtual ? (
            <span
              title={item.atendenteAtual.nome}
              className="inline-flex items-center gap-0.5 text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full max-w-[90px] truncate"
            >
              👤 {item.atendenteAtual.nome.split(" ")[0]}
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}
