"use client";

import { useEffect, useState } from "react";

interface Props {
  criadoEm: string;
  slaMinutes?: number;
}

export default function SlaTimer({ criadoEm, slaMinutes = 2 }: Props) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    function update() {
      const deadline = new Date(criadoEm).getTime() + slaMinutes * 60 * 1000;
      const diff = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setRemaining(diff);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [criadoEm, slaMinutes]);

  const expired = remaining === 0;
  const urgent = remaining <= 30 && !expired;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  if (expired) return <span className="text-xs font-bold text-red-500">EXPIRADO</span>;

  return (
    <span
      className={`text-xs font-mono font-bold ${urgent ? "text-red-500 animate-pulse" : "text-gray-400"}`}
    >
      {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
    </span>
  );
}
