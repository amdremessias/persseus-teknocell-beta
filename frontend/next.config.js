/** @type {import('next').NextConfig} */
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");
const WS_RAW = (process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001").replace(/\/+$/, "");
const WS_BASE = WS_RAW.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async rewrites() {
    return [
      // Proxy HTTP API calls (=> nginx/backend), sem origem hardcoded
      {
        source: "/api/:path*",
        destination: `${API_BASE}/:path*`,
      },
      // Proxy Socket.IO (HTTP polling + WebSocket upgrade)
      {
        source: "/socket.io/:path*",
        destination: `${WS_BASE}/socket.io/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;