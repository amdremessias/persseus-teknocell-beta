/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async rewrites() {
    return [
      // Proxy HTTP API calls
      {
        source: "/api/:path*",
        destination: "https://crm.teknoscel.shop/api/:path*",
      },
      // Proxy Socket.io (HTTP polling + WebSocket upgrade)
      {
        source: "/socket.io/:path*",
        destination: "https://crm.teknoscel.shop/socket.io/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
