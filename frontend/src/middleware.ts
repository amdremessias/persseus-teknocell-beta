import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/leads" || pathname === "/leads/") {
    const url = req.nextUrl.clone();
    url.pathname = "/chats";
    return NextResponse.redirect(url, 301);
  }

  if (pathname === "/settings/channels" || pathname === "/settings/channels/") {
    const url = req.nextUrl.clone();
    url.pathname = "/settings/integracoes";
    return NextResponse.redirect(url, 301);
  }

  const chatIdMatch = pathname.match(/^\/chats\/([^/]+)\/?$/);
  if (chatIdMatch) {
    const id = chatIdMatch[1];
    const url = req.nextUrl.clone();
    url.pathname = "/chats";
    url.searchParams.set("selected", id);
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/leads", "/leads/", "/settings/channels", "/settings/channels/", "/chats/:id*"],
};
