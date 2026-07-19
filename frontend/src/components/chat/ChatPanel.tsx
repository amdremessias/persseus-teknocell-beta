"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useLeadSocket } from "@/hooks/useSocket";
import { getSocket } from "@/lib/socket";
import MessageBubble, { type Message } from "@/components/chat/MessageBubble";
import SuggestedReplies from "@/components/chat/SuggestedReplies";
import TabInfo from "@/components/chat/TabInfo";
import TabNotas from "@/components/chat/TabNotas";
import TagModal from "@/components/chat/TagModal";
import QuickRepliesDropdown from "@/components/chat/QuickRepliesDropdown";
import { ORDEM_MODELOS } from "@/components/AvaliacaoIphone";
import { Send, Paperclip, X, FileText, UserCheck, UserMinus, Pin, Tag as TagIcon, CheckCircle, BadgeCheck, Zap, Trash2, AlertTriangle, ChevronDown, Mic, Square, ArrowLeft, ArrowRightLeft } from "lucide-react";
import { cn, CHANNEL_META } from "@/lib/utils";

type Tab = "conversa" | "notas" | "info";

interface Props {
  leadId: string;
  onBack?: () => void;
}

interface TemplateItem {
  id: string;
  nome: string;
  texto: string;
  variaveis: string[];
  canal: string;
  aprovadoMeta: boolean;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  aguardando:           { label: "Aguardando",      color: "text-yellow-700" },
  bia_atendendo:        { label: "Bia atendendo",   color: "text-purple-700" },
  atendente_atendendo:  { label: "Em atendimento",  color: "text-blue-700" },
  finalizado:           { label: "Finalizado",      color: "text-gray-500" },
  novo:                 { label: "Novo",            color: "text-green-700" },
};

const VENDA_PRODUTOS: { v: string; l: string }[] = [
  { v: "iphone", l: "iPhone" },
  { v: "macbook", l: "MacBook" },
  { v: "apple_watch", l: "Apple Watch" },
  { v: "ipad", l: "iPad" },
  { v: "airpods", l: "AirPods" },
  { v: "acessorio", l: "Acessório" },
  { v: "conserto", l: "Conserto" },
  { v: "outro", l: "Outro" },
];
const VENDA_ARMAZENAMENTOS = ["64GB", "128GB", "256GB", "512GB", "1TB"];

function computeStatusLabel(lead: any) {
  if (!lead) return STATUS_LABEL.aguardando;
  if (["convertido", "perdido", "arquivado"].includes(lead.statusPipeline)) return STATUS_LABEL.finalizado;
  if (lead.biaAtiva) return STATUS_LABEL.bia_atendendo;
  if (lead.atendenteId) return STATUS_LABEL.atendente_atendendo;
  if (lead.statusPipeline === "novo") return STATUS_LABEL.aguardando;
  return STATUS_LABEL.aguardando;
}

export default function ChatPanel({ leadId, onBack }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [lead, setLead] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  // Modal de finalização: "choose" = escolher / "venda" = mini-form da venda
  const [finalizeStep, setFinalizeStep] = useState<"choose" | "venda">("choose");
  const [vendaProduto, setVendaProduto] = useState("iphone");
  const [vendaModelo, setVendaModelo] = useState("");
  const [vendaArmazenamento, setVendaArmazenamento] = useState("");
  const [vendaValor, setVendaValor] = useState("");
  const [vendaSeminovo, setVendaSeminovo] = useState(false);
  const [vendaSaving, setVendaSaving] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [actioning, setActioning] = useState(false);
  const [tab, setTab] = useState<Tab>("conversa");
  const [pinned, setPinned] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagPills, setTagPills] = useState<{ id: string; nome: string; cor: string }[]>([]);
  const [notesCount, setNotesCount] = useState(0);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [windowExpiredError, setWindowExpiredError] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLeadSocket(leadId);

  const fetchLead = useCallback(async () => {
    const { data } = await api.get(`/leads/${leadId}`);
    setLead(data);
    setMessages(data.messages || []);
    setPinned(!!data.pinned);
  }, [leadId]);

  const fetchTagsApplied = useCallback(async () => {
    try {
      const { data } = await api.get(`/leads/${leadId}/tags`);
      const list = Array.isArray(data) ? data : data?.tags || [];
      setTagPills(list);
    } catch {
      setTagPills([]);
    }
  }, [leadId]);

  useEffect(() => {
    setLead(null);
    setMessages([]);
    setTab("conversa");
    setShowDeleteModal(false);
    setDeleting(false);
    setShowFinalizeModal(false);
    fetchLead();
    fetchTagsApplied();
    api.post(`/chats/${leadId}/read`).catch(() => null);
    const socket = getSocket();

    const onNew = (msg: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    const onUpdated = (msg: Message) => {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
    };
    const onLeadUpdated = (updated: { id: string }) => {
      if (updated?.id === leadId) fetchLead();
    };

    socket.on("message:new", onNew);
    socket.on("message:updated", onUpdated);
    socket.on("lead:updated", onLeadUpdated);

    return () => {
      socket.off("message:new", onNew);
      socket.off("message:updated", onUpdated);
      socket.off("lead:updated", onLeadUpdated);
    };
  }, [leadId, fetchLead, fetchTagsApplied]);

  useEffect(() => {
    if (tab !== "conversa") return;
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, tab]);

  async function compressImage(file: File): Promise<File> {
    if (!file.type.startsWith("image/") || /svg|gif/.test(file.type)) return file;
    const MAX = 1280;
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            const name = file.name.replace(/\.[^.]+$/, ".jpg");
            resolve(new File([blob], name, { type: "image/jpeg", lastModified: Date.now() }));
          },
          "image/jpeg",
          0.7
        );
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    let file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      file = await compressImage(file);
      setAttachPreview(URL.createObjectURL(file));
    } else {
      setAttachPreview(null);
    }
    setAttachment(file);
  }

  function clearAttachment() {
    setAttachment(null);
    setAttachPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function startRecording() {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg;codecs=opus";
      const mr = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      alert("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }

  function cancelRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    setAudioBlob(null);
    setRecordingSeconds(0);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }

  async function sendAudio() {
    if (!audioBlob || sending) return;
    setSending(true);
    try {
      const ext = audioBlob.type.includes("webm") ? "webm" : "ogg";
      const file = new File([audioBlob], `audio.${ext}`, { type: audioBlob.type });
      const form = new FormData();
      form.append("file", file);
      await api.post(`/leads/${leadId}/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAudioBlob(null);
      setRecordingSeconds(0);
    } finally {
      setSending(false);
    }
  }

  async function sendMessage() {
    if (sending) return;
    if (!attachment && !text.trim()) return;
    setSending(true);
    try {
      if (attachment) {
        const form = new FormData();
        form.append("file", attachment);
        if (text.trim()) form.append("caption", text.trim());
        await api.post(`/leads/${leadId}/upload`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        clearAttachment();
        setText("");
      } else {
        const { data } = await api.post<{ deliveryStatus?: string }>(`/leads/${leadId}/messages`, { texto: text.trim() });
        setText("");
        if (data?.deliveryStatus === "failed") {
          setWindowExpiredError(true);
        }
      }
    } catch {
      // Network/server error — silently ignore
    } finally {
      setSending(false);
    }
  }

  async function handleAssume() {
    if (!user || actioning) return;
    setActioning(true);
    try {
      await api.post(`/leads/${leadId}/assign`, { atendenteId: user.id });
      await fetchLead();
    } finally {
      setActioning(false);
    }
  }

  async function handleUnassign() {
    if (actioning) return;
    setActioning(true);
    try {
      await api.post(`/leads/${leadId}/unassign`);
      await fetchLead();
    } finally {
      setActioning(false);
    }
  }

  const [transferOpen, setTransferOpen] = useState(false);
  const [atendentes, setAtendentes] = useState<{ id: string; nome: string }[]>([]);
  const transferRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!transferOpen) return;
    api.get("/users")
      .then(r => setAtendentes(
        (r.data as { id: string; nome: string; nivel: string; ativo: boolean }[])
          .filter(u => u.nivel === "atendente" && u.ativo && u.id !== lead?.atendenteId)
      ))
      .catch(() => {});
  }, [transferOpen, lead?.atendenteId]);

  useEffect(() => {
    if (!transferOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (transferRef.current && !transferRef.current.contains(e.target as Node)) {
        setTransferOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [transferOpen]);

  async function handleTransfer(novoAtendenteId: string) {
    setTransferOpen(false);
    setActioning(true);
    try {
      await api.post(`/leads/${leadId}/transferir`, { atendenteId: novoAtendenteId });
      await fetchLead();
    } finally {
      setActioning(false);
    }
  }

  async function handleFinalizeWith(status: "arquivado" | "convertido") {
    setShowFinalizeModal(false);
    await api.post(`/leads/${leadId}/status`, { status }).catch(() => null);
    await fetchLead();
  }

  function closeFinalize() {
    setShowFinalizeModal(false);
    setFinalizeStep("choose");
  }

  // Aceita vírgula decimal e separador de milhar: "1.234,56" → 1234.56
  function parseValor(raw: string): number | null {
    const s = raw.trim();
    if (!s) return null;
    let n = s.replace(/\s/g, "");
    if (n.includes(",")) n = n.replace(/\./g, "").replace(",", ".");
    const v = parseFloat(n);
    return Number.isFinite(v) && v >= 0 ? v : null;
  }

  async function handleRegisterVenda() {
    if (vendaSaving || !vendaProduto) return;
    setVendaSaving(true);
    try {
      const payload: any = { produto: vendaProduto, seminovo: vendaSeminovo };
      if (vendaModelo.trim()) payload.modelo = vendaModelo.trim();
      if (vendaProduto === "iphone" && vendaArmazenamento) payload.armazenamento = vendaArmazenamento;
      const valorNum = parseValor(vendaValor);
      if (valorNum != null) payload.valor = valorNum;

      await api.post(`/leads/${leadId}/venda`, payload);
      closeFinalize();
      setVendaProduto("iphone");
      setVendaModelo("");
      setVendaArmazenamento("");
      setVendaValor("");
      setVendaSeminovo(false);
      await fetchLead();
    } catch {
      alert("Não foi possível registrar a venda. Tente novamente.");
    } finally {
      setVendaSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/leads/${leadId}`);
      setShowDeleteModal(false);
      router.replace("/chats", { scroll: false });
    } catch (err) {
      setDeleting(false);
      alert("Não foi possível apagar a conversa. Tente novamente.");
    }
  }

  async function togglePin() {
    if (pinned) {
      await api.delete(`/chats/${leadId}/pin`).catch(() => null);
      setPinned(false);
    } else {
      await api.post(`/chats/${leadId}/pin`).catch(() => null);
      setPinned(true);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showQuickReplies) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    setShowQuickReplies(v.startsWith("/"));
  }

  function applyQuickReply(replacement: string) {
    setText(replacement);
    setShowQuickReplies(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const statusLabel = useMemo(() => computeStatusLabel(lead), [lead]);
  const canalLabel = lead?.canal ? (CHANNEL_META[lead.canal]?.label || lead.canal) : "";

  const within24h = useMemo(() => {
    if (lead?.canal !== "whatsapp") return true;
    const clientMsgs = messages.filter((m) => m.tipo === "cliente");
    if (clientMsgs.length > 0) {
      const last = clientMsgs[clientMsgs.length - 1];
      return Date.now() - new Date(last.criadoEm).getTime() < 24 * 60 * 60 * 1000;
    }
    // No client messages yet — for pos_venda leads the initial message was a template/receipt
    // which opens the WhatsApp 24h window. Allow text if that template was sent recently.
    if (lead?.statusPipeline === "pos_venda") {
      const outboundMsgs = messages.filter((m) => m.tipo === "atendente");
      if (outboundMsgs.length > 0) {
        const last = outboundMsgs[outboundMsgs.length - 1];
        return Date.now() - new Date(last.criadoEm).getTime() < 24 * 60 * 60 * 1000;
      }
    }
    return false;
  }, [lead?.canal, lead?.statusPipeline, messages]);

  useEffect(() => {
    if (within24h) setWindowExpiredError(false);
  }, [within24h]);

  useEffect(() => {
    if (!within24h && lead?.canal === "whatsapp" && templates.length === 0) {
      api
        .get("/waba-templates")
        .then(({ data }) => setTemplates(data as TemplateItem[]))
        .catch(() => {});
    }
  }, [within24h, lead?.canal, templates.length]);

  async function sendTemplate() {
    if (!selectedTemplate || sendingTemplate) return;
    setSendingTemplate(true);
    try {
      // Envio real do template WABA aprovado (name + variáveis {{1}}, {{2}}…)
      await api.post(`/leads/${leadId}/waba-template`, {
        name: selectedTemplate.nome,
        variables: templateVars,
      });
      setSelectedTemplate(null);
      setTemplateVars({});
      setShowTemplateDropdown(false);
      setWindowExpiredError(false);
    } catch {
      alert("Não foi possível enviar o template.");
    } finally {
      setSendingTemplate(false);
    }
  }

  if (!lead) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  const hasAtendente = !!lead.atendenteId;
  const biaAtiva = !!lead.biaAtiva;
  const isFinalized = ["convertido", "perdido", "arquivado"].includes(lead.statusPipeline);
  // Spec dos botoes:
  // - biaAtiva && !hasAtendente -> Assumir
  // - hasAtendente             -> Devolver (humano atendendo)
  // - !biaAtiva && !hasAtendente -> Assumir + alerta "Bia desativada para este lead"
  const showAssumir = !hasAtendente;
  const showDevolver = hasAtendente;
  const biaDesativadaAlerta = !biaAtiva && !hasAtendente;

  const firstMessageAt = messages[0]?.criadoEm || null;
  const lastActivityAt = messages[messages.length - 1]?.criadoEm || lead.atualizadoEm || null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 md:px-4 pt-3 pb-0 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-start gap-2">
          {/* Back button — mobile only */}
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden shrink-0 p-2 -ml-1 text-gray-500 hover:text-gray-700 rounded-xl transition mt-0.5 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Voltar"
            >
              <ArrowLeft size={20} />
            </button>
          )}

          <div className="flex-1 min-w-0">
            <button
              onClick={() => setTab("info")}
              className="font-semibold text-gray-900 truncate hover:text-green-700 transition text-left w-full"
            >
              {lead.nome || "Lead sem nome"}
            </button>
            <p className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
              <span>{lead.telefone || "—"}</span>
              <span className="text-gray-300">·</span>
              <span>{canalLabel}</span>
              <span className="text-gray-300">·</span>
              <span className={statusLabel.color}>{statusLabel.label}</span>
              <span className="text-gray-300">·</span>
              {lead.atendenteId
                ? <span className="text-blue-600 font-medium">👤 {lead.atendente?.nome || "—"}</span>
                : <span>Sem atendente</span>
              }
            </p>
          </div>

          <div className="flex items-center gap-1 md:gap-1.5 shrink-0 flex-wrap justify-end">
            {/* Pin — desktop only (available via Info tab on mobile) */}
            <button
              onClick={togglePin}
              className={cn(
                "hidden md:flex p-1.5 rounded-lg transition",
                pinned ? "text-orange-500 bg-orange-50" : "text-gray-400 hover:text-orange-500 hover:bg-orange-50"
              )}
              title={pinned ? "Desafixar" : "Fixar no topo"}
            >
              <Pin size={16} fill={pinned ? "currentColor" : "none"} />
            </button>

            {/* Tag — desktop only */}
            <button
              onClick={() => setTagModalOpen(true)}
              className="hidden md:flex p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition"
              title="Gerenciar tags"
            >
              <TagIcon size={16} />
            </button>

            {showAssumir && user && (
              <button
                onClick={handleAssume}
                disabled={actioning}
                className="flex items-center gap-1 md:gap-1.5 text-xs bg-green-600 text-white px-2.5 md:px-3 py-1.5 rounded-xl hover:bg-green-700 disabled:opacity-50 transition min-h-[36px]"
                title={biaDesativadaAlerta ? "Bia desativada para este lead" : "Assumir conversa"}
              >
                <UserCheck size={14} />
                {actioning ? "..." : "Assumir"}
              </button>
            )}

            {showDevolver && (
              <button
                onClick={handleUnassign}
                disabled={actioning}
                className="flex items-center gap-1 md:gap-1.5 text-xs bg-gray-100 text-gray-600 px-2.5 md:px-3 py-1.5 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition min-h-[36px]"
              >
                <UserMinus size={14} />
                {actioning ? "..." : "Devolver"}
              </button>
            )}

            {showDevolver && (
              <div className="relative" ref={transferRef}>
                <button
                  onClick={() => setTransferOpen(o => !o)}
                  disabled={actioning}
                  className="flex items-center gap-1 md:gap-1.5 text-xs bg-blue-50 text-blue-700 px-2.5 md:px-3 py-1.5 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition min-h-[36px]"
                  title="Transferir para outro atendente"
                >
                  <ArrowRightLeft size={14} />
                  <span className="hidden sm:inline">Transferir</span>
                </button>
                {transferOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[160px] py-1">
                    {atendentes.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">Nenhum atendente disponível</p>
                    ) : atendentes.map(a => (
                      <button
                        key={a.id}
                        onClick={() => handleTransfer(a.id)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition"
                      >
                        {a.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!isFinalized && (
              <button
                onClick={() => setShowFinalizeModal(true)}
                className="flex items-center gap-1 md:gap-1.5 text-xs bg-gray-100 text-gray-600 px-2.5 md:px-3 py-1.5 rounded-xl hover:bg-red-50 hover:text-red-600 transition min-h-[36px]"
                title="Finalizar conversa"
              >
                <CheckCircle size={14} />
                <span className="hidden sm:inline">Finalizar</span>
              </button>
            )}

            {/* Delete — desktop only */}
            <button
              onClick={() => setShowDeleteModal(true)}
              className="hidden md:flex p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
              title="Apagar conversa"
            >
              <Trash2 size={16} />
            </button>

            {/* Bia badge — desktop only */}
            <span className={`hidden md:inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${lead.biaAtiva ? "bg-purple-50 text-purple-600" : "bg-gray-100 text-gray-500"}`}>
              {lead.biaAtiva ? "🤖 Bia" : "Humano"}
            </span>
          </div>
        </div>

        {biaDesativadaAlerta && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
            <AlertTriangle size={12} className="shrink-0" />
            <span>Bia desativada para este lead — assumir reabre o atendimento.</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-0 mt-3 -mb-px">
          {([
            ["conversa", "Conversa", null],
            ["notas",    "Notas internas", notesCount],
            ["info",     "Info", null],
          ] as [Tab, string, number | null][]).map(([key, label, count]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "px-3 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5",
                  active ? "text-green-700 border-green-600" : "text-gray-500 border-transparent hover:text-gray-700"
                )}
              >
                {label}
                {count !== null && count > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Conversa (preserva conteudo existente intocado) */}
      {tab === "conversa" && (
        <div data-tab="conversa" className="flex flex-col flex-1 overflow-hidden">
          <div ref={messagesRef} className="flex-1 overflow-y-auto p-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </div>

          <SuggestedReplies leadId={leadId} onSelect={(t) => setText(t)} />

          {/* 24h window banner */}
          {(!within24h || windowExpiredError) && (
            <div className="mx-3 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                <span className="text-xs text-amber-800">
                  {windowExpiredError
                    ? "Mensagem não entregue — janela 24h expirou. Use um template."
                    : "Fora da janela 24h — só é possível enviar templates aprovados pela Meta"}
                </span>
              </div>
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowTemplateDropdown((v) => !v)}
                  className="flex items-center gap-1 text-xs bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1.5 rounded-lg transition"
                >
                  Enviar template
                  <ChevronDown size={12} />
                </button>
                {showTemplateDropdown && (
                  <div className="absolute right-0 bottom-full mb-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                    {templates.length === 0 ? (
                      <p className="text-xs text-gray-400 px-3 py-3">
                        Nenhum template aprovado encontrado
                      </p>
                    ) : (
                      <ul className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                        {templates.map((t) => (
                          <li key={t.id}>
                            <button
                              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition text-xs"
                              onClick={() => {
                                setSelectedTemplate(t);
                                setTemplateVars({});
                                setShowTemplateDropdown(false);
                              }}
                            >
                              <p className="font-medium text-gray-800">{t.nome}</p>
                              <p className="text-gray-400 truncate mt-0.5">{t.texto.slice(0, 50)}</p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Template variable form */}
          {selectedTemplate && (
            <div className="mx-3 mb-2 p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700">{selectedTemplate.nome}</p>
                <button
                  onClick={() => { setSelectedTemplate(null); setTemplateVars({}); }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs text-gray-500 bg-white border border-gray-100 rounded-lg p-2 whitespace-pre-wrap">
                {selectedTemplate.texto}
              </p>
              {selectedTemplate.variaveis.map((v) => (
                <div key={v}>
                  <label className="text-[11px] font-medium text-gray-600 block mb-0.5">{`{${v}}`}</label>
                  <input
                    type="text"
                    value={templateVars[v] || ""}
                    onChange={(e) =>
                      setTemplateVars((prev) => ({ ...prev, [v]: e.target.value }))
                    }
                    placeholder={`Valor para {${v}}`}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              ))}
              <button
                onClick={sendTemplate}
                disabled={sendingTemplate}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium py-1.5 rounded-lg transition"
              >
                {sendingTemplate ? "Enviando..." : "Enviar template"}
              </button>
            </div>
          )}

          {attachment && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
              {attachPreview ? (
                <img src={attachPreview} alt="preview" className="h-14 w-14 rounded-lg object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-gray-200 flex items-center justify-center">
                  <FileText size={22} className="text-gray-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{attachment.name}</p>
                <p className="text-xs text-gray-400">{(attachment.size / 1024).toFixed(0)} KB</p>
              </div>
              <button onClick={clearAttachment} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
          )}

          <div className="px-3 md:px-4 py-3 bg-white border-t border-gray-100 flex items-end gap-2 shrink-0 relative">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Recording UI — replaces normal composer when recording or audio ready */}
            {(recording || audioBlob) ? (
              <>
                {recording ? (
                  <>
                    <span className="flex items-center gap-1.5 flex-1 text-sm text-red-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      Gravando… {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}
                    </span>
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-500 rounded-xl transition"
                      title="Cancelar gravação"
                    >
                      <X size={20} />
                    </button>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-2xl transition"
                      title="Parar gravação"
                    >
                      <Square size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <audio
                      src={URL.createObjectURL(audioBlob!)}
                      controls
                      className="flex-1 h-9 rounded-lg min-w-0"
                      style={{ colorScheme: "light" }}
                    />
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-500 rounded-xl transition shrink-0"
                      title="Descartar áudio"
                    >
                      <X size={20} />
                    </button>
                    <button
                      onClick={sendAudio}
                      disabled={sending}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-2xl transition shrink-0"
                      title="Enviar áudio"
                    >
                      <Send size={18} />
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-xl transition"
                  title="Anexar arquivo"
                >
                  <Paperclip size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setText((t) => (t.startsWith("/") ? t : "/"));
                    setShowQuickReplies(true);
                    setTimeout(() => textareaRef.current?.focus(), 0);
                  }}
                  className="shrink-0 min-w-[44px] min-h-[44px] hidden md:flex items-center justify-center text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-xl transition"
                  title="Atalhos rápidos (/)"
                >
                  <Zap size={20} />
                </button>

                {showQuickReplies && (
                  <QuickRepliesDropdown
                    query={text}
                    onPick={applyQuickReply}
                    onClose={() => setShowQuickReplies(false)}
                  />
                )}

                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={onTextChange}
                  onKeyDown={handleKey}
                  disabled={!within24h || windowExpiredError}
                  placeholder={
                    (!within24h || windowExpiredError)
                      ? "Janela 24h expirada — use um template"
                      : attachment
                      ? "Legenda (opcional)..."
                      : "Mensagem..."
                  }
                  rows={1}
                  className="flex-1 border border-gray-200 rounded-2xl px-3 md:px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400 max-h-32 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed min-w-0"
                />

                {/* Mic button when empty; send button when there's content */}
                {!text.trim() && !attachment ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={!within24h || windowExpiredError}
                    className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-green-600 hover:bg-green-50 disabled:opacity-40 rounded-2xl transition"
                    title="Gravar áudio"
                  >
                    <Mic size={20} />
                  </button>
                ) : (
                  <button
                    onClick={sendMessage}
                    disabled={(!text.trim() && !attachment) || sending || !within24h || windowExpiredError}
                    className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-2xl transition"
                  >
                    <Send size={18} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === "notas" && (
        <TabNotas leadId={leadId} onCountChange={setNotesCount} />
      )}

      {tab === "info" && (
        <TabInfo
          lead={lead}
          messageCount={messages.length}
          firstMessageAt={firstMessageAt}
          lastActivityAt={lastActivityAt}
          tagPills={tagPills}
        />
      )}

      {tagModalOpen && (
        <TagModal
          leadId={leadId}
          onClose={() => setTagModalOpen(false)}
          onChange={fetchTagsApplied}
        />
      )}

      {showFinalizeModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={closeFinalize}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-[380px] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {finalizeStep === "choose" ? (
              <>
                <h3 className="font-semibold text-gray-900 mb-1">Finalizar conversa</h3>
                <p className="text-sm text-gray-500 mb-4">Como deseja encerrar esta conversa?</p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setFinalizeStep("venda")}
                    className="flex items-center gap-3 p-3 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 text-green-800 transition text-left"
                  >
                    <BadgeCheck size={22} className="shrink-0 text-green-600" />
                    <div>
                      <p className="font-semibold text-sm">Convertido — virou venda</p>
                      <p className="text-xs text-green-700 mt-0.5">A venda foi fechada com sucesso</p>
                    </div>
                  </button>
                  <button
                    onClick={() => handleFinalizeWith("arquivado")}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 transition text-left"
                  >
                    <CheckCircle size={22} className="shrink-0 text-gray-400" />
                    <div>
                      <p className="font-semibold text-sm">Arquivar</p>
                      <p className="text-xs text-gray-500 mt-0.5">Encerrar sem registrar como venda</p>
                    </div>
                  </button>
                </div>
                <button
                  onClick={closeFinalize}
                  className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 py-1.5 transition"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-gray-900 mb-1">Registrar venda</h3>
                <p className="text-sm text-gray-500 mb-4">O que foi vendido nesta conversa?</p>
                <div className="flex flex-col gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Produto *</span>
                    <select
                      value={vendaProduto}
                      onChange={(e) => {
                        setVendaProduto(e.target.value);
                        setVendaModelo("");
                        setVendaArmazenamento("");
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                    >
                      {VENDA_PRODUTOS.map((p) => (
                        <option key={p.v} value={p.v}>{p.l}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Modelo</span>
                    {vendaProduto === "iphone" ? (
                      <select
                        value={vendaModelo}
                        onChange={(e) => setVendaModelo(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                      >
                        <option value="">Selecione…</option>
                        {ORDEM_MODELOS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={vendaModelo}
                        onChange={(e) => setVendaModelo(e.target.value)}
                        placeholder="ex: MacBook Air M2"
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                      />
                    )}
                  </label>

                  {vendaProduto === "iphone" && (
                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">Armazenamento</span>
                      <select
                        value={vendaArmazenamento}
                        onChange={(e) => setVendaArmazenamento(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                      >
                        <option value="">Selecione…</option>
                        {VENDA_ARMAZENAMENTOS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Valor (R$)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={vendaValor}
                      onChange={(e) => setVendaValor(e.target.value)}
                      placeholder="ex: 4.500,00"
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                    />
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vendaSeminovo}
                      onChange={(e) => setVendaSeminovo(e.target.checked)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-200"
                    />
                    <span className="text-sm text-gray-700">Seminovo</span>
                  </label>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setFinalizeStep("choose")}
                    disabled={vendaSaving}
                    className="flex-1 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium py-2.5 transition disabled:opacity-50"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleRegisterVenda}
                    disabled={vendaSaving || !vendaProduto}
                    className="flex-1 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 text-green-800 text-sm font-semibold py-2.5 transition disabled:opacity-50"
                  >
                    {vendaSaving ? "Registrando…" : "Registrar venda"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-[420px] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">Apagar conversa</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Apagar conversa de <strong>{lead.nome || "Lead sem nome"}</strong>?
                  Todas as mensagens serão removidas. Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-600 rounded-xl hover:bg-gray-100 disabled:opacity-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition flex items-center gap-2"
              >
                <Trash2 size={14} />
                {deleting ? "Apagando..." : "Apagar conversa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
