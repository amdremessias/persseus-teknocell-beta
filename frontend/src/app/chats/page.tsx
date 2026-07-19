"use client";

import { Suspense, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import ConversationList from "@/components/chat/ConversationList";
import ChatPanel from "@/components/chat/ChatPanel";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

export default function ChatsPage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-400">Carregando...</div>}>
      <ChatsPageInner />
    </Suspense>
  );
}

function ChatsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = searchParams.get("selected");

  const handleSelect = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("selected", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const handleBack = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("selected");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  return (
    // Mobile: single column (one panel at a time).  Desktop: unchanged 2-column grid.
    <div className="h-full overflow-hidden md:grid md:grid-cols-[320px_1fr]">
      {/* Conversation list — visible on mobile only when no conversation is open */}
      <div className={cn(
        "h-full flex flex-col overflow-hidden",
        selected ? "hidden md:flex" : "flex"
      )}>
        <ConversationList selectedId={selected} onSelect={handleSelect} />
      </div>

      {/* Chat panel — visible on mobile only when a conversation is selected */}
      <section className={cn(
        "h-full bg-white overflow-hidden border-l border-gray-100 flex flex-col",
        !selected ? "hidden md:flex" : "flex"
      )}>
        {selected ? (
          <ChatPanel leadId={selected} onBack={handleBack} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <MessageSquare size={48} className="text-gray-300" />
            <p className="text-sm">Selecione uma conversa para começar</p>
          </div>
        )}
      </section>
    </div>
  );
}
