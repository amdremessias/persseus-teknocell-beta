/**
 * SimuladorMaquininha.jsx
 * ------------------------------------------------------------
 * Botão + modal de "Simulação de Parcelamento" pro CRM da Teknos.
 *
 * O QUE FAZ:
 *  - Busca a tabela de taxas (1x a 18x) do BACKEND (endpoint
 *    /api/config/taxas-maquininha), compartilhada entre todos os
 *    atendentes. Só usuário admin (nivel === "admin") vê e usa a aba
 *    "Configurar taxas"; os demais só veem "Simular".
 *  - Você digita o valor da venda, ele calcula o valor com REPASSE
 *    da taxa (fórmula: valor / (1 - taxa%)) parcela por parcela.
 *  - Cada linha tem botão "Copiar" e um botão "Copiar tudo" que monta
 *    um texto prontinho pra colar no WhatsApp do cliente (com aviso em
 *    negrito sobre Visa/Mastercard e disponibilidade em 18x).
 *
 * PROPS:
 *  - currentUserNivel (string): nivel do usuário logado ("admin",
 *    "supervisor" ou "atendente"). Passe o valor real vindo do seu
 *    contexto/hook de autenticação, ex:
 *      <SimuladorMaquininha currentUserNivel={user?.nivel} />
 *    Se não vier "admin", a aba de configurar taxas não aparece.
 *
 * BACKEND NECESSÁRIO:
 *  - GET  /api/config/taxas-maquininha   → qualquer usuário logado lê
 *  - PATCH /api/config/taxas-maquininha  → só nivel === "admin" grava
 *  Body/response: { taxas: { "1": "1.62", ..., "18": "14.92" } }
 *
 * FÓRMULA (repasse total ao cliente):
 *   valorComRepasse = valorOriginal / (1 - taxa/100)
 *   valorDaParcela  = valorComRepasse / numeroDeParcelas
 *   (assim você recebe o valor cheio, o cliente absorve o custo da maquininha)
 *
 * Fallback: se a API falhar (rede fora, endpoint ainda não existe etc.),
 * usa os valores padrão abaixo só localmente, pra não travar o botão.
 */

import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

const API_URL = "/config/taxas-maquininha";
const MAX_PARCELAS = 18;

// Taxas padrão de fallback (%) — usadas só se a API não responder.
const TAXAS_PADRAO = {
  1: "1.62",
  2: "2.25",
  3: "2.25",
  4: "2.25",
  5: "2.25",
  6: "2.25",
  7: "2.25",
  8: "2.25",
  9: "2.25",
  10: "2.25",
  11: "2.25",
  12: "2.25",
  13: "11.99",
  14: "12.58",
  15: "13.16",
  16: "13.75",
  17: "14.34",
  18: "14.92",
};

function formatBRL(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function SimuladorMaquininha({ currentUserNivel }) {
  const isAdmin = currentUserNivel === "admin";

  const [aberto, setAberto] = useState(false);
  const [abaConfig, setAbaConfig] = useState(false);
  const [taxas, setTaxas] = useState(TAXAS_PADRAO);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [valor, setValor] = useState("");
  const [copiadoLinha, setCopiadoLinha] = useState(null);
  const [copiadoTudo, setCopiadoTudo] = useState(false);

  const buscarTaxas = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const { data } = await api.get(API_URL);
      setTaxas({ ...TAXAS_PADRAO, ...(data.taxas || {}) });
    } catch (e) {
      console.warn("Não foi possível buscar taxas da API, usando padrão local.", e);
      setErro("Não foi possível carregar as taxas do servidor. Usando valores padrão.");
      setTaxas(TAXAS_PADRAO);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (aberto) buscarTaxas();
  }, [aberto, buscarTaxas]);

  const atualizarTaxaLocal = (parcela, novoValor) => {
    setTaxas((prev) => ({ ...prev, [parcela]: novoValor }));
  };

  const salvarTaxas = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const { data } = await api.patch(API_URL, { taxas });
      setTaxas({ ...TAXAS_PADRAO, ...(data.taxas || taxas) });
    } catch (e) {
      if (e?.response?.status === 403) {
        setErro("Só administradores podem editar as taxas.");
      } else {
        setErro("Falha ao salvar taxas.");
      }
    } finally {
      setSalvando(false);
    }
  };

  const valorNumerico = parseFloat((valor || "0").replace(",", "."));
  const valido = !isNaN(valorNumerico) && valorNumerico > 0;

  const calcularItem = (n) => {
    const taxaPct = parseFloat(String(taxas[n]).replace(",", ".")) || 0;
    const fator = 1 - taxaPct / 100;
    const valorComRepasse = fator > 0 ? valorNumerico / fator : valorNumerico;
    const valorParcela = valorComRepasse / n;
    return { n, taxaPct, valorComRepasse, valorParcela };
  };

  const simulacao = valido
    ? Array.from({ length: MAX_PARCELAS }, (_, i) => calcularItem(i + 1))
    : [];

  // Aviso fixo (negrito no padrão do WhatsApp, com *asteriscos*).
  const AVISO_SIMULACAO =
    "*Simulação válida apenas para cartão Visa/Mastercard.*\n" +
    "*Para 18x, consulte a disponibilidade com a operadora do seu cartão.*";

  const textoLinha = (item) =>
    item.n === 1
      ? `1x (crédito): ${formatBRL(item.valorComRepasse)}`
      : `${item.n}x de ${formatBRL(item.valorParcela)}`;

  const copiarLinha = async (item) => {
    await navigator.clipboard.writeText(textoLinha(item));
    setCopiadoLinha(item.n);
    setTimeout(() => setCopiadoLinha(null), 1500);
  };

  const copiarTudo = async () => {
    const linhas = simulacao.map(textoLinha).join("\n");
    const texto = `${AVISO_SIMULACAO}\n\nSimulação para ${formatBRL(valorNumerico)}:\n\n${linhas}`;
    await navigator.clipboard.writeText(texto);
    setCopiadoTudo(true);
    setTimeout(() => setCopiadoTudo(false), 1500);
  };

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
      >
        💳 Parcelamento
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Simulador de Parcelamento
              </h2>
              <button
                onClick={() => setAberto(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {erro && (
              <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {erro}
              </div>
            )}

            {isAdmin && (
              <div className="mb-3 flex gap-2 text-sm">
                <button
                  onClick={() => setAbaConfig(false)}
                  className={`rounded-md px-3 py-1 ${!abaConfig ? "bg-blue-100 text-blue-700" : "text-gray-500"}`}
                >
                  Simular
                </button>
                <button
                  onClick={() => setAbaConfig(true)}
                  className={`rounded-md px-3 py-1 ${abaConfig ? "bg-blue-100 text-blue-700" : "text-gray-500"}`}
                >
                  Configurar taxas
                </button>
              </div>
            )}

            {!abaConfig || !isAdmin ? (
              <div>
                <p className="mb-3 text-xs font-bold text-gray-800">
                  Simulação válida apenas para cartão Visa/Mastercard. Para
                  18x, consulte a disponibilidade com a operadora do seu
                  cartão.
                </p>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Valor total da venda (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="Ex: 1500"
                  className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />

                {carregando && (
                  <p className="mb-2 text-xs text-gray-400">Carregando taxas atualizadas...</p>
                )}

                {valido && (
                  <>
                    <div className="mb-2 flex justify-end">
                      <button
                        onClick={copiarTudo}
                        className="rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-white hover:bg-gray-900"
                      >
                        {copiadoTudo ? "Copiado! ✅" : "Copiar tudo"}
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto rounded-md border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                          <tr>
                            <th className="px-2 py-1 text-left">Parc.</th>
                            <th className="px-2 py-1 text-left">Taxa</th>
                            <th className="px-2 py-1 text-left">Valor parcela</th>
                            <th className="px-2 py-1 text-left">Total</th>
                            <th className="px-2 py-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {simulacao.map((item) => (
                            <tr key={item.n} className="border-t border-gray-100">
                              <td className="px-2 py-1">{item.n}x</td>
                              <td className="px-2 py-1 text-gray-500">{item.taxaPct}%</td>
                              <td className="px-2 py-1 font-medium">
                                {formatBRL(item.valorParcela)}
                              </td>
                              <td className="px-2 py-1 text-gray-500">
                                {formatBRL(item.valorComRepasse)}
                              </td>
                              <td className="px-2 py-1 text-right">
                                <button
                                  onClick={() => copiarLinha(item)}
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  {copiadoLinha === item.n ? "✅" : "Copiar"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div>
                <p className="mb-3 text-xs text-gray-500">
                  Taxa (%) de repasse por número de parcelas. Só administradores
                  editam. Ao salvar, vale pra todos os atendentes.
                </p>
                <div className="max-h-80 overflow-y-auto rounded-md border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-2 py-1 text-left">Parcelas</th>
                        <th className="px-2 py-1 text-left">Taxa (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: MAX_PARCELAS }, (_, i) => i + 1).map(
                        (n) => (
                          <tr key={n} className="border-t border-gray-100">
                            <td className="px-2 py-1">{n}x</td>
                            <td className="px-2 py-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={taxas[n] ?? ""}
                                onChange={(e) => atualizarTaxaLocal(n, e.target.value)}
                                className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                              />
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={salvarTaxas}
                    disabled={salvando}
                    className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {salvando ? "Salvando..." : "Salvar taxas"}
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
