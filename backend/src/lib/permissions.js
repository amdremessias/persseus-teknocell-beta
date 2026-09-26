// Catálogo de permissões granulares do Teknos CRM.
// Cada perfil (nivel) tem um conjunto padrão; o admin pode sobrescrever
// por usuário através do campo `permissions` (JSON array, ex: ["chats.assign"]).
// Admin com nível 'admin' tem todas as permissões (não lista explicitamente).

export const PERMISSIONS = [
  { key: "users.manage",     label: "Gerenciar usuários" },
  { key: "teams.manage",     label: "Gerenciar grupos/equipes" },
  { key: "queues.manage",    label: "Gerenciar filas de atendimento" },
  { key: "chats.assign",     label: "Assumir/repassar conversas" },
  { key: "chats.view_all",   label: "Ver conversas de outros atendentes" },
  { key: "followup.manage",  label: "Gerenciar follow-up" },
  { key: "vendas.manage",    label: "Editar vendas" },
  { key: "funil.manage",     label: "Editar funil/pipeline" },
  { key: "tags.manage",      label: "Gerenciar tags" },
  { key: "reports.export",   label: "Exportar relatórios (CSV/PDF)" },
  { key: "settings.manage",  label: "Gerenciar configurações" },
];

export const ROLE_DEFAULT_PERMISSIONS = {
  admin: ["*"],
  supervisor: ["users.manage", "teams.manage", "queues.manage", "chats.assign", "chats.view_all", "followup.manage", "vendas.manage", "funil.manage", "tags.manage", "reports.export", "settings.manage"],
  atendente: ["chats.assign"],
};

export function isAdmin(user) {
  return !!user && user.nivel === "admin";
}

export function roleDefaults(nivel) {
  return ROLE_DEFAULT_PERMISSIONS[nivel] ?? ROLE_DEFAULT_PERMISSIONS.atendente;
}

// Permissões efetivas do usuário: defaults do perfil + sobrescritas explícitas.
export function effectivePermissions(user) {
  if (!user) return [];
  if (isAdmin(user)) return ["*"];
  const base = new Set(roleDefaults(user.nivel));
  const stored = Array.isArray(user.permissions) ? user.permissions : [];
  for (const p of stored) {
    if (p === "*") return ["*"];
    if (p.startsWith("-")) base.delete(p.slice(1));
    else base.add(p);
  }
  return [...base];
}

export function hasPermission(user, perm) {
  const perms = effectivePermissions(user);
  return perms.includes("*") || perms.includes(perm);
}