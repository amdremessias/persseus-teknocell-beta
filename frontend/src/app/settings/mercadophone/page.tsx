"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { AlertTriangle, CheckCircle, Eye, EyeOff, Key, Loader2, RefreshCw, Smartphone, XCircle } from "lucide-react";

interface JwtStatus {
  configured: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
}

function decodeJwtExp(token: string): { exp: number | null; valid: boolean } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { exp: null, valid: false };
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return { exp: payload.exp ?? null, valid: true };
  } catch {
    return { exp: null, valid: false };
  }
}

function formatExpiry(exp: number): string {
  const date = new Date(exp * 1000);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysUntil(exp: number): number {
  return Math.ceil((exp * 1000 - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function MercadophonePage() {
  const [status, setStatus] = useState<JwtStatus | null>(null);
  const [jwt, setJwt] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [password, setPassword] = useState("");
  const [pwStep, setPwStep] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get<JwtStatus>("/integrations/mercadophone-jwt-status");
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const jwtPreview = (() => {
    if (!jwt.trim()) return null;
    const { exp, valid } = decodeJwtExp(jwt.trim());
    if (!valid) return { error: "JWT inválido — formato incorreto" };
    if (!exp) return { error: "JWT não tem campo 'exp'" };
    const days = daysUntil(exp);
    return { exp, days, expiry: formatExpiry(exp) };
  })();

  async function handleSave() {
    if (!jwt.trim() || !password) return;
    setSaving(true);
    setSaveResult(null);
    try {
      await api.put("/integrations/settings", {
        password,
        updates: { MERCADOPHONE_JWT: jwt.trim() },
      });
      setJwt("");
      setPassword("");
      setPwStep(false);
      setSaveResult({ ok: true, msg: "JWT salvo com sucesso!" });
      await loadStatus();
    } catch (err: any) {
      setSaveResult({ ok: false, msg: err.response?.data?.error || "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post("/integrations/test/mercadophone-jwt");
      setTestResult({ ok: true, msg: `Conectado! Status HTTP ${data.status}` });
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Falha na conexão";
      setTestResult({ ok: false, msg });
    } finally {
      setTesting(false);
    }
  }

  const expiryWarning = status !== null && status.daysLeft !== null && status.daysLeft <= 5 && status.daysLeft > 0;
  const expired = status !== null && status.daysLeft !== null && status.daysLeft <= 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Smartphone size={18} className="text-gray-500" />
            MercadoPhone API — JWT
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Gerenciamento do JWT para disparo proativo via template HSM (leads do quiz de iPhone).
            O JWT expira a cada 30 dias e precisa ser renovado manualmente.
          </p>
        </div>

        {/* Status atual */}
        <div className="bg-white rounded-card shadow-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Key size={15} className="text-gray-500" />
            Status atual
          </h2>

          {status === null ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : !status.configured ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <XCircle size={16} className="text-gray-400" />
              JWT não configurado
            </div>
          ) : expired ? (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <XCircle size={16} className="text-red-500 shrink-0" />
              <span>
                <strong>JWT expirado</strong>
                {status.expiresAt && ` em ${new Date(status.expiresAt).toLocaleDateString("pt-BR")}`}
                . Disparo proativo está bloqueado.
              </span>
            </div>
          ) : expiryWarning ? (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <span>
                <strong>JWT expira em {status.daysLeft} dia{status.daysLeft !== 1 ? "s" : ""}</strong>
                {status.expiresAt && ` (${new Date(status.expiresAt).toLocaleDateString("pt-BR")})`}.
                Renove antes que expire.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle size={16} className="text-green-500" />
              JWT configurado
              {status.daysLeft !== null && (
                <span className="text-gray-500">
                  — expira em <strong>{status.daysLeft} dias</strong>
                  {status.expiresAt && ` (${new Date(status.expiresAt).toLocaleDateString("pt-BR")})`}
                </span>
              )}
            </div>
          )}

          {status?.configured && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Testar conexão
            </button>
          )}

          {testResult && (
            <div className={`flex items-center gap-2 text-sm rounded-lg p-3 ${testResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {testResult.ok ? <CheckCircle size={15} /> : <XCircle size={15} />}
              {testResult.msg}
            </div>
          )}
        </div>

        {/* Como obter o JWT */}
        <div className="bg-blue-50 border border-blue-200 rounded-card p-4 text-sm text-blue-800 space-y-1">
          <p className="font-semibold">Como obter o JWT:</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
            <li>Faça login em <code className="bg-blue-100 px-1 rounded">exclusivo.mercadophone.tech</code></li>
            <li>Abra o DevTools (F12) &rarr; aba <strong>Network</strong></li>
            <li>Recarregue a página</li>
            <li>Clique em qualquer requisição para a API</li>
            <li>Copie o valor do header <code className="bg-blue-100 px-1 rounded">Authorization</code> <strong>sem</strong> o prefixo &ldquo;Bearer &rdquo;</li>
          </ol>
        </div>

        {/* Campo de entrada do JWT */}
        <div className="bg-white rounded-card shadow-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Colar novo JWT</h2>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Token JWT</label>
            <div className="relative">
              <textarea
                value={jwt}
                onChange={(e) => {
                  setJwt(e.target.value);
                  setSaveResult(null);
                }}
                placeholder="Cole aqui o JWT (começa com eyJ...)"
                rows={revealed ? 5 : 3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400 resize-none pr-10"
                style={{ wordBreak: "break-all" }}
              />
              <button
                type="button"
                onClick={() => setRevealed((r) => !r)}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 p-1"
              >
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {/* Preview da decodificação */}
            {jwt.trim() && jwtPreview && (
              <div className={`text-xs rounded-lg p-2 mt-1 ${
                "error" in jwtPreview
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : jwtPreview.days <= 0
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : jwtPreview.days <= 5
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-green-50 text-green-700 border border-green-200"
              }`}>
                {"error" in jwtPreview ? (
                  jwtPreview.error
                ) : (
                  <>
                    Expira em: <strong>{jwtPreview.expiry}</strong>
                    {" "}({jwtPreview.days > 0 ? `${jwtPreview.days} dias restantes` : "já expirado"})
                  </>
                )}
              </div>
            )}
          </div>

          {/* Senha admin para confirmar */}
          {!pwStep ? (
            <button
              onClick={() => setPwStep(true)}
              disabled={!jwt.trim() || ("error" in (jwtPreview ?? { error: "" }) && !!jwtPreview)}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5"
            >
              <Key size={14} />
              Salvar JWT
            </button>
          ) : (
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-500">
                Confirme a senha de admin para salvar.
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="Senha do admin"
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setPwStep(false); setPassword(""); }}
                  disabled={saving}
                  className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={!password || saving}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm transition flex items-center gap-1.5"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                  {saving ? "Salvando..." : "Confirmar e salvar"}
                </button>
              </div>
            </div>
          )}

          {saveResult && (
            <div className={`flex items-center gap-2 text-sm rounded-lg p-3 ${saveResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {saveResult.ok ? <CheckCircle size={15} /> : <XCircle size={15} />}
              {saveResult.msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
