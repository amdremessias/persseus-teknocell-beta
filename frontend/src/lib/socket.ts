import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001", {
      auth: (cb: (data: { token: string | null }) => void) =>
        cb({ token: localStorage.getItem("token") }),
      transports: ["websocket"],
    });
  }
  return socket;
}

export function updateSocketAuth(newToken: string) {
  if (!socket) return;
  socket.auth = { token: newToken };
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
