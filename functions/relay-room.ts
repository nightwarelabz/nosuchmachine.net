// @ts-nocheck
// SPIKE (feat/relay-memory): proves a Durable Object class can ship in
// this Pages project and be bound from wrangler.toml. The probe route
// below is the only surface; the room itself arrives with the build.

export class RelayRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.searchParams.has("bump")) {
      const n = ((await this.state.storage.get("n")) || 0) + 1;
      await this.state.storage.put("n", n);
      return new Response(JSON.stringify({ ok: true, n }), { headers: { "content-type": "application/json" } });
    }
    const n = (await this.state.storage.get("n")) || 0;
    return new Response(JSON.stringify({ ok: true, id: this.state.id.toString(), n }), { headers: { "content-type": "application/json" } });
  }
}

export async function onRequestGet(context) {
  const stub = context.env.RELAY_ROOM.get(context.env.RELAY_ROOM.idFromName("spike"));
  const res = await stub.fetch(context.request.url);
  return new Response(await res.text(), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
