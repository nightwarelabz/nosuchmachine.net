// @ts-nocheck
// POST /api/exchange  { host, port, sendBase64?, sendText?, readBytes?, timeoutMs? }
// ONE TCP connection from the edge: connect, optionally speak first with a
// single bounded payload, read what the door says, close. This is the
// primitive the whole protocol-probe family stands on — exactly one knock,
// read, grade. No second connection, no retries, no session.
import { connect } from "cloudflare:sockets";
import { err, guardTarget, json } from "../_lib/guard";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function onRequestPost(context: any) {
  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return err("POST a JSON body: { host, port, sendText or sendBase64, readBytes }.");
  }
  const port = Number(body?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return err("Port must be 1-65535.");
  let host: string;
  try {
    const g = await guardTarget(String(body?.host || ""));
    host = g.host;
  } catch (e: any) {
    return err(String(e?.message || e));
  }
  let send: Uint8Array | null = null;
  try {
    if (typeof body?.sendBase64 === "string" && body.sendBase64) send = fromBase64(body.sendBase64);
    else if (typeof body?.sendText === "string" && body.sendText) send = new TextEncoder().encode(body.sendText);
  } catch {
    return err("sendBase64 was not valid base64.");
  }
  if (send && send.length > 4096) return err("One knock means one small payload: sends are capped at 4096 bytes.");
  const readCap = Math.min(65536, Math.max(256, Number(body?.readBytes) || 8192));
  const timeoutMs = Math.min(10000, Math.max(500, Number(body?.timeoutMs) || 5000));
  const started = Date.now();
  let socket: any = null;
  try {
    socket = connect({ hostname: host, port }, { secureTransport: "off", allowHalfOpen: false });
    await Promise.race([
      socket.opened,
      new Promise((_, reject) => setTimeout(() => reject(new Error("connect timeout")), timeoutMs)),
    ]);
    const connectMs = Date.now() - started;
    if (send) {
      const writer = socket.writable.getWriter();
      await writer.write(send);
      try { writer.releaseLock(); } catch { /* noop */ }
    }
    const reader = socket.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    const deadline = Date.now() + timeoutMs;
    // ONE pending read at a time: racing read() calls and abandoning the
    // loser breaks the Workers socket stream (the port-22 banner case:
    // data arrived, the quiet race lost, the next read threw). Keep the
    // same pending promise across phases instead.
    let pending: Promise<any> = reader.read();
    const raceTimeout = (p: Promise<any>, ms: number) => Promise.race([p, new Promise<any>((resolve) => setTimeout(() => resolve({ timeout: true }), ms))]);
    while (total < readCap && Date.now() < deadline) {
      const read = await raceTimeout(pending, Math.max(1, deadline - Date.now()));
      if (read.timeout || read.done || !read.value) break;
      chunks.push(read.value);
      total += read.value.length;
      pending = reader.read();
      // Many banner doors speak once; a short quiet period ends the read.
      const quiet = await raceTimeout(pending, 350);
      if (quiet.timeout) break;
      if (quiet.done || !quiet.value) break;
      chunks.push(quiet.value);
      total += quiet.value.length;
      pending = reader.read();
    }
    try { reader.releaseLock(); } catch { /* noop */ }
    const received = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { received.set(c.slice(0, total - off), off); off += c.length; if (off >= total) break; }
    const exact = received.slice(0, total);
    return json({
      ok: true, host, port, connectMs, totalMs: Date.now() - started,
      sentBytes: send?.length || 0, receivedBytes: exact.length,
      receivedText: new TextDecoder("utf-8", { fatal: false }).decode(exact),
      receivedBase64: toBase64(exact),
      note: "One connection, from a Cloudflare edge location. What is above is everything the door said before it went quiet or the read window closed.",
    });
  } catch (e: any) {
    const timedOut = /timeout/i.test(String(e?.message || ""));
    return json({ ok: false, host, port, error: timedOut ? "No answer — connect timed out (filtered, down, or not that protocol's door)." : "Connection refused or failed — the door is closed from here.", ms: Date.now() - started }, 200);
  } finally {
    try { socket?.close(); } catch { /* noop */ }
  }
}

export async function onRequestGet() {
  return err("POST JSON to this endpoint: { host, port, sendText?, sendBase64?, readBytes?, timeoutMs? } — one connection, one knock.", 405);
}
