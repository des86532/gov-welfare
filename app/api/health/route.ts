export function GET() {
  return Response.json({ ok: true, service: "taiwan-welfare-navigator" }, { headers: { "Cache-Control": "no-store" } });
}
