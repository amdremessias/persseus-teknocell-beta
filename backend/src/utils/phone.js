export function normalizePhone(raw) {
  if (!raw) return null;
  return String(raw).replace(/\D/g, '');
}
