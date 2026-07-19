const INVESTMENT_SCORES = {
  "acima de 100k": 100,
  "80k-100k": 85,
  "60k-80k": 70,
  "40k-60k": 55,
  "20k-40k": 35,
  "ate 20k": 15,
};

export function calcScore(lead) {
  const inv = INVESTMENT_SCORES[lead.faixaInvestimento?.toLowerCase()] ?? 30;
  const troca = lead.vaiTrocar ? 20 : 0;
  const msgs = Math.min((lead._count?.messages ?? 0) * 5, 30);
  return Math.round(inv * 0.4 + (troca * 0.3 + msgs * 0.3));
}

export function scoreLabel(score) {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}
