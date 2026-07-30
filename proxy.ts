import { NextResponse, type NextRequest } from "next/server";
import { isAdminAuthorization } from "@/lib/admin-auth";

export function proxy(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new NextResponse("ADMIN_PASSWORD is required", { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
  if (isAdminAuthorization(request.headers.get("authorization"), password)) {
    return NextResponse.next({ headers: { "Cache-Control": "private, no-store" } });
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "Cache-Control": "private, no-store", "WWW-Authenticate": 'Basic realm="Welfare Review"' } });
}

export const config = { matcher: "/admin/:path*" };
