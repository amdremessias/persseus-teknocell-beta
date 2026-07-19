"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function HoursPage() {
  const [inicio, setInicio] = useState("08:00");
  const [fim, setFim] = useState("18:00");
  const [dias, setDias] = useState([1, 2, 3, 4, 5]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get("/settings").then(({ data }) => {
      if (data.horario_comercial) {
        const h = JSON.parse(data.horario_comercial);
        setInicio(h.inicio);
        setFim(h.fim);
        setDias(h.dias);
      }
    });
  }, []);

  async function save() {
    await api.put("/settings", {
      horario_comercial: JSON.stringify({ inicio, fim, dias }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleDay(d: number) {
    setDias((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  return (
    <div className="p-6 max-w-md">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Horário Comercial</h1>
      <div className="bg-white rounded-card shadow-card p-5 space-y-5">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Início</label>
            <input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fim</label>
            <input type="time" value={fim} onChange={(e) => setFim(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Dias de atendimento</label>
          <div className="flex gap-2">
            {DAYS.map((d, i) => (
              <button key={i} onClick={() => toggleDay(i)}
                className={`w-9 h-9 rounded-full text-xs font-semibold transition ${dias.includes(i) ? "bg-green-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <button onClick={save} className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition">
          {saved ? "Salvo!" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
