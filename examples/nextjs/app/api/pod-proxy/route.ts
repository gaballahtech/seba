// Server route pattern (illustrative). SEBA does NOT provide a server-held DPoP proxy.
// After a reviewed design, the server may proxy specific requests; never accept raw browser tokens/keys blindly.
export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("target");
  if (!target) return new Response("missing target", { status: 400 });
  // Placeholder: implement an explicit, reviewed proxy if needed. Do not forward Authorization/DPoP from arbitrary clients.
  return new Response(JSON.stringify({ ok: false, note: "proxy not implemented; see examples/nextjs/README.md" }), {
    status: 501,
    headers: { "content-type": "application/json" },
  });
}
