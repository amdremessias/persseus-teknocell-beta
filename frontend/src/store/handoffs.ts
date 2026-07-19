import { create } from "zustand";

export interface HandoffEntry {
  leadId: string;
  leadNome: string;
  agenteNome: string;
  timestamp: number;
}

interface HandoffStore {
  pending: HandoffEntry[];
  add: (entry: HandoffEntry) => void;
  clear: (leadId: string) => void;
}

export const useHandoffStore = create<HandoffStore>((set) => ({
  pending: [],
  add: (entry) =>
    set((s) => ({
      pending: s.pending.some((e) => e.leadId === entry.leadId)
        ? s.pending
        : [entry, ...s.pending].slice(0, 20),
    })),
  clear: (leadId) =>
    set((s) => ({ pending: s.pending.filter((e) => e.leadId !== leadId) })),
}));
