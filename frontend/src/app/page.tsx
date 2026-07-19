"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/store/auth";

export default function Home() {
  const router = useRouter();
  const hydrate = useAuth((s) => s.hydrate);
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);

  useEffect(() => { void hydrate(); }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    router.replace(user ? "/chats" : "/login");
  }, [hydrated, user, router]);

  return null;
}
