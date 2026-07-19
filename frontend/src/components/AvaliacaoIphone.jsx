/**
 * AvaliacaoIphone.jsx
 * ------------------------------------------------------------
 * Botão + modal de "Avaliação de iPhone (Quanto Vale?)" pro CRM da Teknos.
 * Replica a ferramenta do MercadoPhone: escolhe Modelo + Armazenamento e
 * mostra a FAIXA de preço de compra recomendada (quanto pagar ao comprar
 * o aparelho do cliente). É tabela de consulta (lookup), não fórmula.
 *
 * O QUE FAZ:
 *  - Busca a tabela de avaliação do BACKEND (endpoint
 *    /api/config/avaliacao-iphone), compartilhada entre todos os
 *    atendentes. Só admin (nivel === "admin") vê/usa a aba "Configurar".
 *  - Atendente escolhe modelo + GB → vê "R$ mín — R$ máx".
 *  - Botão "Copiar" monta um texto prontinho pro WhatsApp.
 *
 * PROPS:
 *  - currentUserNivel (string): nivel do usuário logado. Passe o valor
 *    real do seu contexto de auth: <AvaliacaoIphone currentUserNivel={user?.nivel} />
 *
 * BACKEND NECESSÁRIO:
 *  - GET  /api/config/avaliacao-iphone   → qualquer usuário logado lê
 *  - PATCH /api/config/avaliacao-iphone  → só nivel === "admin" grava
 *  Body/response: { tabela: { "<modelo>": { "<GB>": ["min","max"] } } }
 *
 * Fallback: se a API falhar, usa a tabela padrão abaixo só localmente.
 */

import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

const API_URL = "/config/avaliacao-iphone";

// Ordem de exibição dos modelos (do iPhone 11 em diante).
export const ORDEM_MODELOS = [
  "iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max",
  "iPhone 12", "iPhone 12 Mini", "iPhone 12 Pro", "iPhone 12 Pro Max",
  "iPhone 13", "iPhone 13 Mini", "iPhone 13 Pro", "iPhone 13 Pro Max",
  "iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max",
  "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max",
  "iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max",
  "iPhone 17", "iPhone 17 Pro", "iPhone 17 Pro Max",
];

// Tabela padrão de fallback (faixa de compra, [min, max] em R$).
// Do iPhone 11 em diante. 15 Pro Max 1TB e 16 Plus 256GB são anomalias do
// sistema de origem (mais baratos que a capacidade menor) — deixados fiéis,
// corrija na aba "Configurar" se quiser.
const TABELA_PADRAO = {
  "iPhone 11": { "64GB": ["550", "700"], "128GB": ["700", "900"], "256GB": ["650", "850"] },
  "iPhone 11 Pro": { "64GB": ["700", "900"], "128GB": ["550", "700"], "256GB": ["700", "950"], "512GB": ["700", "900"] },
  "iPhone 11 Pro Max": { "64GB": ["800", "1000"], "128GB": ["850", "1100"], "256GB": ["800", "1050"], "512GB": ["750", "1000"] },
  "iPhone 12": { "64GB": ["750", "950"], "128GB": ["950", "1250"], "256GB": ["1000", "1250"] },
  "iPhone 12 Mini": { "64GB": ["450", "600"] },
  "iPhone 12 Pro": { "128GB": ["1050", "1350"], "256GB": ["1200", "1550"], "512GB": ["1350", "1750"] },
  "iPhone 12 Pro Max": { "128GB": ["1300", "1700"], "256GB": ["1550", "2000"], "512GB": ["1900", "2450"] },
  "iPhone 13": { "128GB": ["1200", "1550"], "256GB": ["1300", "1700"], "512GB": ["1400", "1800"] },
  "iPhone 13 Mini": { "128GB": ["700", "900"], "256GB": ["700", "900"] },
  "iPhone 13 Pro": { "128GB": ["1500", "1950"], "256GB": ["1650", "2150"], "512GB": ["1850", "2350"] },
  "iPhone 13 Pro Max": { "128GB": ["1750", "2300"], "256GB": ["1850", "2400"], "512GB": ["1950", "2500"] },
  "iPhone 14": { "128GB": ["1400", "1800"], "256GB": ["1550", "2000"], "512GB": ["1450", "1900"] },
  "iPhone 14 Plus": { "128GB": ["1500", "1900"], "256GB": ["1400", "1800"] },
  "iPhone 14 Pro": { "128GB": ["1900", "2450"], "256GB": ["1950", "2500"], "512GB": ["2350", "3000"], "1TB": ["2550", "3250"] },
  "iPhone 14 Pro Max": { "128GB": ["2100", "2700"], "256GB": ["2200", "2800"], "512GB": ["2300", "2950"] },
  "iPhone 15": { "128GB": ["1850", "2350"], "256GB": ["1950", "2500"] },
  "iPhone 15 Plus": { "128GB": ["1950", "2500"], "256GB": ["2000", "2600"] },
  "iPhone 15 Pro": { "128GB": ["2250", "2900"], "256GB": ["2350", "3050"], "512GB": ["2550", "3300"] },
  "iPhone 15 Pro Max": { "256GB": ["2750", "3550"], "512GB": ["2950", "3750"], "1TB": ["2050", "2600"] },
  "iPhone 16": { "128GB": ["2250", "2900"], "256GB": ["2350", "3050"] },
  "iPhone 16 Plus": { "128GB": ["2500", "3200"], "256GB": ["2050", "2600"] },
  "iPhone 16 Pro": { "128GB": ["3050", "3900"], "256GB": ["3250", "4150"], "512GB": ["3450", "4450"] },
  "iPhone 16 Pro Max": { "256GB": ["3600", "4600"], "512GB": ["3850", "5000"], "1TB": ["4100", "5300"] },
  "iPhone 17": { "256GB": ["2900", "3700"] },
  "iPhone 17 Pro": { "256GB": ["4450", "5700"] },
  "iPhone 17 Pro Max": { "256GB": ["5150", "6600"], "512GB": ["5450", "7000"], "1TB": ["6650", "8550"] },
};

const ORDEM_GB = ["64GB", "128GB", "256GB", "512GB", "1TB"];

function formatBRL(n) {
  const v = parseFloat(String(n).replace(",", ".")) || 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function modelosOrdenados(tabela) {
  const chaves = Object.keys(tabela);
  const naOrdem = ORDEM_MODELOS.filter((m) => chaves.includes(m));
  const extras = chaves.filter((m) => !ORDEM_MODELOS.includes(m));
  return [...naOrdem, ...extras];
}

function gbsOrdenados(tabela, modelo) {
  if (!modelo || !tabela[modelo]) return [];
  const chaves = Object.keys(tabela[modelo]);
  const naOrdem = ORDEM_GB.filter((g) => chaves.includes(g));
  const extras = chaves.filter((g) => !ORDEM_GB.includes(g));
  return [...naOrdem, ...extras];
}

export default function AvaliacaoIphone({ currentUserNivel }) {
  const isAdmin = currentUserNivel === "admin";

  const [aberto, setAberto] = useState(false);
  const [abaConfig, setAbaConfig] = useState(false);
  const [tabela, setTabela] = useState(TABELA_PADRAO);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [modelo, setModelo] = useState("");
  const [gb, setGb] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [modeloConfig, setModeloConfig] = useState("");

  const buscarTabela = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const { data } = await api.get(API_URL);
      if (data.tabela && Object.keys(data.tabela).length) setTabela(data.tabela);
      else setTabela(TABELA_PADRAO);
    } catch (e) {
      console.warn("Não foi possível buscar a tabela da API, usando padrão local.", e);
      setErro("Não foi possível carregar do servidor. Usando valores padrão.");
      setTabela(TABELA_PADRAO);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (aberto) buscarTabela();
  }, [aberto, buscarTabela]);

  // reseta GB quando muda o modelo
  useEffect(() => {
    setGb("");
  }, [modelo]);

  const salvarTabela = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const { data } = await api.patch(API_URL, { tabela });
      if (data.tabela) setTabela(data.tabela);
    } catch (e) {
      if (e?.response?.status === 403) {
        setErro("Só administradores podem editar a tabela.");
      } else {
        setErro("Falha ao salvar.");
      }
    } finally {
      setSalvando(false);
    }
  };

  const atualizarValor = (mod, g, idx, novo) => {
    setTabela((prev) => {
      const faixa = [...(prev[mod]?.[g] || ["", ""])];
      faixa[idx] = novo;
      return { ...prev, [mod]: { ...prev[mod], [g]: faixa } };
    });
  };

  const faixa = modelo && gb ? tabela[modelo]?.[gb] : null;
  const temValor = faixa && faixa[0] !== "" && faixa[1] !== "";

  const textoCopiar = () => {
    if (!temValor) return "";
    return `*Avaliação — ${modelo} ${gb}*\nValor de compra: ${formatBRL(faixa[0])} a ${formatBRL(faixa[1])}`;
  };

  const copiar = async () => {
    await navigator.clipboard.writeText(textoCopiar());
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };

  const modelos = modelosOrdenados(tabela);
  const gbs = gbsOrdenados(tabela, modelo);
  const gbsConfig = gbsOrdenados(tabela, modeloConfig);

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
      >
        📱 Avaliação iPhone
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Avaliação de iPhone</h2>
              <button onClick={() => setAberto(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            {erro && (
              <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{erro}</div>
            )}

            {isAdmin && (
              <div className="mb-3 flex gap-2 text-sm">
                <button
                  onClick={() => setAbaConfig(false)}
                  className={`rounded-md px-3 py-1 ${!abaConfig ? "bg-emerald-100 text-emerald-700" : "text-gray-500"}`}
                >
                  Avaliar
                </button>
                <button
                  onClick={() => setAbaConfig(true)}
                  className={`rounded-md px-3 py-1 ${abaConfig ? "bg-emerald-100 text-emerald-700" : "text-gray-500"}`}
                >
                  Configurar valores
                </button>
              </div>
            )}

            {!abaConfig || !isAdmin ? (
              <div>
                <p className="mb-3 text-xs text-gray-500">
                  Faixa de valor recomendada para <b>comprar</b> o aparelho.
                  Baseado em vendas reais de seminovos.
                </p>

                {carregando && <p className="mb-2 text-xs text-gray-400">Carregando valores...</p>}

                <label className="mb-1 block text-sm font-medium text-gray-700">Modelo</label>
                <select
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecione o modelo</option>
                  {modelos.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                {modelo && (
                  <>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Armazenamento</label>
                    <select
                      value={gb}
                      onChange={(e) => setGb(e.target.value)}
                      className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Selecione o GB</option>
                      {gbs.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </>
                )}

                {modelo && gb && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                    {temValor ? (
                      <>
                        <p className="text-xs text-gray-500">Comprar por até</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatBRL(faixa[0])} — {formatBRL(faixa[1])}
                        </p>
                        <button
                          onClick={copiar}
                          className="mt-3 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                          {copiado ? "Copiado! ✅" : "Copiar"}
                        </button>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">
                        Valor ainda não cadastrado {isAdmin ? "(preencha na aba Configurar)" : ""}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="mb-3 text-xs text-gray-500">
                  Escolha o modelo e ajuste os valores mín/máx de cada
                  capacidade. Ao salvar, vale pra todos os atendentes.
                </p>

                <label className="mb-1 block text-sm font-medium text-gray-700">Modelo</label>
                <select
                  value={modeloConfig}
                  onChange={(e) => setModeloConfig(e.target.value)}
                  className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecione o modelo</option>
                  {modelos.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                {modeloConfig && (
                  <div className="overflow-hidden rounded-md border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-2 py-1 text-left">GB</th>
                          <th className="px-2 py-1 text-left">Mín (R$)</th>
                          <th className="px-2 py-1 text-left">Máx (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gbsConfig.map((g) => (
                          <tr key={g} className="border-t border-gray-100">
                            <td className="px-2 py-1">{g}</td>
                            <td className="px-2 py-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={tabela[modeloConfig][g][0] ?? ""}
                                onChange={(e) => atualizarValor(modeloConfig, g, 0, e.target.value)}
                                className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={tabela[modeloConfig][g][1] ?? ""}
                                onChange={(e) => atualizarValor(modeloConfig, g, 1, e.target.value)}
                                className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={salvarTabela}
                    disabled={salvando}
                    className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {salvando ? "Salvando..." : "Salvar valores"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
