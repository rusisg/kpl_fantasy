import { NextRequest } from "next/server";
import { handlers } from "../../../../auth";

function withRequestHost(req: NextRequest): NextRequest {
  const pathname = req.nextUrl.pathname;
  // Keep Google OAuth on the canonical redirect URI registered in Google Cloud Console
  if (
    pathname.endsWith("/signin/google") ||
    pathname.endsWith("/callback/google")
  ) {
    return req;
  }

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host || host === req.nextUrl.host) {
    return req;
  }

  const proto =
    req.headers.get("x-forwarded-proto") ??
    req.nextUrl.protocol.replace(":", "") ??
    "http";
  const rewrittenUrl = new URL(
    `${req.nextUrl.pathname}${req.nextUrl.search}`,
    `${proto}://${host}`
  );
  return new NextRequest(rewrittenUrl, req);
}

export async function GET(req: NextRequest) {
  return handlers.GET(withRequestHost(req));
}

export async function POST(req: NextRequest) {
  return handlers.POST(withRequestHost(req));
}
