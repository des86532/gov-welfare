import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return process.env.NODE_ENV === "production"
      ? new NextResponse("ADMIN_PASSWORD is required", { status: 503 })
      : NextResponse.next();
  }
  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const [, suppliedPassword] = atob(header.slice(6)).split(":");
      if (suppliedPassword === password) return NextResponse.next();
    } catch {}
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Welfare Review"' } });
}

export const config = { matcher: "/admin/:path*" };
