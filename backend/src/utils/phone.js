export function normalizePhone(raw) {
  if (!raw) return null;
  return String(raw).replace(/\D/g, '');
}

// Strips country code (55) and leading trunk 0, returning just DDD+número.
function stripToLocal(digits) {
  let d = digits;
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return d;
}

// Canonical E.164 (55 + DDD + 9 dígitos), inserindo o 9º dígito quando ausente.
// Retorna null se não for um celular BR válido (DDD + 10 ou 11 dígitos).
export function toE164BrazilMobile(raw) {
  const digits = normalizePhone(raw);
  if (!digits) return null;
  let local = stripToLocal(digits);
  if (local.length === 10) local = local.slice(0, 2) + '9' + local.slice(2);
  if (local.length !== 11 || local[2] !== '9') return null;
  return '55' + local;
}

// Todas as variantes E.164 plausíveis (com e sem o 9º dígito) para dedup tolerante.
export function phoneVariants(raw) {
  const digits = normalizePhone(raw);
  if (!digits) return [];
  const local = stripToLocal(digits);
  const variants = new Set();
  if (local.length === 11 && local[2] === '9') {
    variants.add('55' + local);
    variants.add('55' + local.slice(0, 2) + local.slice(3));
  } else if (local.length === 10) {
    variants.add('55' + local);
    variants.add('55' + local.slice(0, 2) + '9' + local.slice(2));
  } else if (local.length === 11) {
    variants.add('55' + local);
  } else {
    return [];
  }
  return [...variants];
}

export function formatBrazilPhoneDisplay(raw) {
  const digits = normalizePhone(raw);
  if (!digits) return String(raw ?? '');
  const local = stripToLocal(digits);
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return String(raw ?? '');
}
