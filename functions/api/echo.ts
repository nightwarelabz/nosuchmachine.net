// @ts-nocheck
// GET /api/echo — show the visitor exactly what their browser just told us.
// The "look in the mirror" probe: request headers, edge-observed TLS facts,
// and network identity, reflected for the visitor's own self-audit.
import { json } from "../_lib/guard";

export async function onRequestGet(context: any) {
  const req: Request = context.request;
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  const cf: any = (req as any).cf || {};
  // Never reflect credential-shaped headers back in full.
  for (const k of Object.keys(headers)) {
    if (/^(cookie|authorization)/i.test(k)) headers[k] = headers[k] ? `(${headers[k].length} chars — value withheld from the mirror on purpose)` : headers[k];
  }
  return json({
    ok: true,
    seenAt: new Date().toISOString(),
    method: req.method,
    httpVersion: cf.httpProtocol || null,
    tls: { version: cf.tlsVersion || null, cipher: cf.tlsCipher || null },
    network: {
      connectingIp: req.headers.get("cf-connecting-ip") || null,
      country: cf.country || req.headers.get("cf-ipcountry") || null,
      city: cf.city || null, region: cf.region || null,
      asn: cf.asn || null, asOrganization: cf.asOrganization || null,
      colo: cf.colo || null,
    },
    client: {
      userAgent: req.headers.get("user-agent") || null,
      acceptLanguage: req.headers.get("accept-language") || null,
      acceptEncoding: req.headers.get("accept-encoding") || null,
    },
    headers,
    note: "This is the request your browser just made, as the edge received it. Anything listed here is visible to every site you visit.",
  });
}
