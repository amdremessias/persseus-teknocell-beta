"use client";

import { useEffect, useRef } from "react";
import { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";

export function useSocket(event: string, handler: (...args: unknown[]) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket: Socket = getSocket();
    const fn = (...args: unknown[]) => handlerRef.current(...args);
    socket.on(event, fn);
    return () => { socket.off(event, fn); };
  }, [event]);
}

export function useLeadSocket(leadId: string) {
  useEffect(() => {
    const socket = getSocket();
    socket.emit("join:lead", leadId);
    return () => { socket.emit("leave:lead", leadId); };
  }, [leadId]);
}
