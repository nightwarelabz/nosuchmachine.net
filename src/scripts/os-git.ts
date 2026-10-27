// BLACKSITE OS — git, plugged into the room. isomorphic-git runs over an
// fs adapter backed by the room's own VFS, so a clone lands in the tree
// where Files, the Editor, and every engine can reach it. The wire half
// goes through the site's own /api/git-proxy (guarded, https only) —
// no third-party CORS proxy ever sees the traffic. Push/pull auth: if
// /home/operator/git-token.txt exists it is offered as the password for
// user x-access-token (GitHub's token convention) and never printed.
import type { BlacksiteOS } from "./os-shell";

type CtxLike = any;

function fsError(code: string, message: string): Error {
  const e = new Error(message) as Error & { code?: string };
  e.code = code;
  return e;
}

/** Minimal callback-style fs over the room VFS — the shape isomorphic-git eats. */
export class VfsFs {
  constructor(private os: BlacksiteOS) {}
  private p(path: string): string { const n = this.os.norm(path); return n.length > 1 ? n.replace(/\/+$/, "") : n; }
  private exists(path: string): boolean {
    const p = this.p(path);
    return this.os.isDir(p) || this.os.readBytes(p) !== null;
  }
  private statObj(path: string) {
    const p = this.p(path);
    if (this.os.isDir(p)) return { type: "dir", size: 0, mode: 0o40755, mtimeMs: Date.now(), ctimeMs: Date.now(), isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false };
    const bytes = this.os.readBytes(p);
    if (bytes === null) throw fsError("ENOENT", `ENOENT: no such file ${p}`);
    return { type: "file", size: bytes.length, mode: 0o100644, mtimeMs: Date.now(), ctimeMs: Date.now(), isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
  }
  readFile(path: string, options: unknown, callback?: (err: any, data?: any) => void) {
    const cb = typeof options === "function" ? (options as any) : callback!;
    try {
      const bytes = this.os.readBytes(this.p(path));
      if (bytes === null) return cb(fsError("ENOENT", `ENOENT: ${path}`));
      const enc = typeof options === "string" ? options : (options as any)?.encoding;
      cb(null, enc ? new TextDecoder().decode(bytes) : bytes);
    } catch (e) { cb(e); }
  }
  writeFile(path: string, data: unknown, options: unknown, callback?: (err: any) => void) {
    const cb = typeof options === "function" ? (options as any) : callback!;
    try {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
      this.os.ownSync(() => this.os.writeBytes(this.p(path), bytes));
      cb(null);
    } catch (e) { cb(e); }
  }
  unlink(path: string, callback: (err: any) => void) {
    try { this.os.ownSync(() => this.os.remove(this.p(path))); callback(null); } catch (e: any) { callback(/no such/.test(String(e?.message)) ? fsError("ENOENT", `ENOENT: ${path}`) : e); }
  }
  readdir(path: string, callback: (err: any, names?: string[]) => void) {
    try {
      const p = this.p(path);
      if (!this.os.isDir(p)) return callback(fsError("ENOTDIR", `ENOTDIR: ${path}`));
      callback(null, this.os.list(p));
    } catch (e) { callback(e); }
  }
  mkdir(path: string, callback: (err: any) => void) {
    // mkdirp semantics with coded errors — isomorphic-git's FileSystem
    // keys its own parent-creation off ENOENT/EEXIST codes, so the
    // adapter speaks them fluently.
    try {
      const p = this.p(path);
      if (this.os.isDir(p)) return callback(fsError("EEXIST", `EEXIST: ${p}`));
      const segments = p.split("/").filter(Boolean);
      let cur = "";
      for (const seg of segments) {
        cur += "/" + seg;
        if (this.os.isDir(cur)) continue;
        if (this.os.readBytes(cur) !== null) return callback(fsError("ENOTDIR", `ENOTDIR: ${cur}`));
        this.os.ownSync(() => this.os.mkdir(cur));
      }
      callback(null);
    } catch (e) { callback(e); }
  }
  rmdir(path: string, callback: (err: any) => void) {
    try { this.os.ownSync(() => this.os.remove(this.p(path), true)); callback(null); } catch (e: any) { callback(/no such/.test(String(e?.message)) ? fsError("ENOENT", `ENOENT: ${path}`) : e); }
  }
  stat(path: string, callback: (err: any, st?: any) => void) {
    try { callback(null, this.statObj(path)); } catch (e) { callback(e); }
  }
  lstat(path: string, callback: (err: any, st?: any) => void) { this.stat(path, callback); }
  rename(from: string, to: string, callback: (err: any) => void) {
    try {
      const bytes = this.os.readBytes(this.p(from));
      if (bytes === null) return callback(fsError("ENOENT", `ENOENT: ${from}`));
      this.os.ownSync(() => { this.os.writeBytes(this.p(to), bytes); this.os.remove(this.p(from)); });
      callback(null);
    } catch (e) { callback(e); }
  }
  symlink(target: string, path: string, callback: (err: any) => void) {
    try { this.os.ownSync(() => this.os.write(this.p(path), target)); callback(null); } catch (e) { callback(e); }
  }
  readlink(path: string, callback: (err: any, target?: string) => void) {
    const content = this.os.read(this.p(path));
    if (content === null) return callback(fsError("ENOENT", `ENOENT: ${path}`));
    callback(null, content);
  }
}

let gitMod: any = null;
let httpMod: any = null;
async function loadGit() {
  if (!gitMod) {
    gitMod = await import("isomorphic-git");
    httpMod = (await import("isomorphic-git/http/web")).default;
  }
  return { git: gitMod, http: httpMod };
}
function authorOf(os: BlacksiteOS): { name: string; email: string } {
  try {
    const raw = os.read("/home/operator/git-identity.json");
    if (raw) { const j = JSON.parse(raw); if (j.name && j.email) return j; }
  } catch { /* fall through to the house default */ }
  return { name: "operator", email: "operator@blacksite.local" };
}
export function authOf(os: BlacksiteOS) {
  const token = os.read("/home/operator/git-token.txt")?.trim();
  if (!token) return undefined;
  // The token is GitHub's and only GitHub's: it is offered solely
  // when the URL that issued the authentication challenge is
  // exactly github.com. Any other host — a clone pointed at a
  // stranger's server that answers with an auth challenge, hoping
  // to be handed whatever the room keeps — gets the library's
  // documented cancellation instead, and never sees the token.
  // (isomorphic-git hands this callback the remote's own URL, not
  // the proxied one; the challenge is judged on that URL's host.)
  return (url: string) => {
    let host = "";
    try { host = new URL(url).hostname; } catch { host = ""; }
    if (host === "github.com") return { username: "x-access-token", password: token };
    return { cancel: true };
  };
}
async function repoRoot(os: BlacksiteOS): Promise<string | null> {
  const { git } = await loadGit();
  try {
    const root = await git.findRoot({ fs: new VfsFs(os), filepath: os.cwd });
    return root;
  } catch { return null; }
}

export function registerGit(verb: (name: string, status: any, help: string, run: (ctx: CtxLike) => Promise<string | void>) => void) {
  const runGit = async (ctx: CtxLike) => {
    const os: BlacksiteOS = ctx.os;
    const sub = ctx.args[0];
    const rest = ctx.args.slice(1);
    const { git, http } = await loadGit();
    const fs = new VfsFs(os);
    const proxy = `${location.origin}/api/git-proxy`;
    const usage = [
      "git — real git over the room's tree (isomorphic-git; the wire runs through this site's guarded /api/git-proxy, https only):",
      "  git clone <https-url> [dir]    clone into the tree — then cd in and work",
      "  git init [dir]                 start a repo here",
      "  git status                     branch, staged, modified, untracked",
      "  git log [-n N]                 the recent line of history",
      "  git add <path...|.>            stage",
      "  git commit -m \"message\"        commit as your room identity",
      "  git branch [name]              list, or create at HEAD",
      "  git checkout <branch|sha>      move HEAD (files follow)",
      "  git remote [-v | add <n> <url>]",
      "  git pull · git push            via the proxy; auth from /home/operator/git-token.txt when present (never printed)",
      "  git config user.name <n> · git config user.email <e>",
    ].join("\n");
    if (!sub) return usage;

    if (sub === "config") {
      if (rest[0] === "user.name" && rest[1]) { const a = authorOf(os); a.name = rest.slice(1).join(" "); os.write("/home/operator/git-identity.json", JSON.stringify(a, null, 2)); return `user.name = ${a.name}`; }
      if (rest[0] === "user.email" && rest[1]) { const a = authorOf(os); a.email = rest[1]; os.write("/home/operator/git-identity.json", JSON.stringify(a, null, 2)); return `user.email = ${a.email}`; }
      const a = authorOf(os); return `user.name = ${a.name}\nuser.email = ${a.email}\n(set them with: git config user.name <name>)`;
    }
    if (sub === "clone") {
      const refusal = os.gate("active"); if (refusal) return refusal;
      const url = rest[0];
      if (!url || !url.startsWith("https://")) return "git clone <https-url> [dir] — the room clones over https only.";
      const name = rest[1] || url.split("/").filter(Boolean).pop()!.replace(/\.git$/, "");
      const dir = os.norm(`${os.cwd}/${name}`);
      if (os.isDir(dir) && os.list(dir).length) return `${dir} already exists and is not empty.`;
      const lines: string[] = [`cloning ${url} → ${dir} (through the guarded proxy — big repos take a while; the room is patient)`];
      await git.clone({ fs, http, dir, url, corsProxy: proxy, onAuth: authOf(os), onMessage: (m: string) => { if (lines.length < 40) lines.push(m.trim()); } });
      lines.push(`done. cd ${name} — the tree is yours; Files and the engines can all reach it.`);
      return lines.join("\n");
    }
    if (sub === "init") {
      const dir = rest[0] ? os.norm(`${os.cwd}/${rest[0]}`) : os.cwd;
      // bare `git init` starts the repo in the cwd itself — which
      // already exists, and os.mkdir refuses an existing path. Only a
      // named target needs making.
      if (!os.isDir(dir)) os.mkdir(dir);
      await git.init({ fs, dir });
      return `empty git repository in ${dir}/.git — the room keeps its history in the tree.`;
    }

    const dir = await repoRoot(os);
    if (!dir) return "not a git repository from here down — git init, or cd into a clone.";

    switch (sub) {
      case "status": {
        const branch = await git.currentBranch({ fs, dir, fullname: false }).catch(() => null);
        const matrix = await git.statusMatrix({ fs, dir });
        const staged: string[] = [], modified: string[] = [], untracked: string[] = [], clean: string[] = [];
        for (const [path, head, work, stage] of matrix) {
          if (head === 0 && work === 2 && stage === 0) untracked.push(path);
          else if (stage !== head && work === stage) staged.push(path);
          else if (work !== stage || head !== work) modified.push(path);
          else clean.push(path);
        }
        const out = [`on branch ${branch || "(detached HEAD)"}`, `  ${clean.length} clean · ${staged.length} staged · ${modified.length} modified · ${untracked.length} untracked`];
        const show = (label: string, arr: string[]) => { if (arr.length) out.push(`${label}:`, ...arr.slice(0, 30).map((f) => `  ${f}`)); };
        show("staged", staged); show("modified", modified); show("untracked", untracked);
        return out.join("\n");
      }
      case "log": {
        const nIdx = rest.indexOf("-n");
        const depth = nIdx >= 0 ? Math.max(1, Number(rest[nIdx + 1]) || 10) : 10;
        const entries = await git.log({ fs, dir, depth });
        if (!entries.length) return "no commits yet — the line starts with you.";
        return entries.map((e: any) => `${e.oid.slice(0, 8)}  ${e.commit.author.name}  ${new Date(e.commit.author.timestamp * 1000).toISOString().slice(0, 10)}  ${e.commit.message.split("\n")[0]}`).join("\n");
      }
      case "add": {
        if (!rest.length) return "git add <path...|.>";
        if (rest.includes(".")) {
          const matrix = await git.statusMatrix({ fs, dir });
          for (const [path, head, work] of matrix) { if (work !== head) { if (work === 0) await git.remove({ fs, dir, filepath: path }); else await git.add({ fs, dir, filepath: path }); } }
          return "staged everything that changed.";
        }
        for (const f of rest) await git.add({ fs, dir, filepath: f });
        return `staged: ${rest.join(", ")}`;
      }
      case "commit": {
        const mIdx = rest.indexOf("-m");
        const message = mIdx >= 0 ? rest.slice(mIdx + 1).join(" ") : "";
        if (!message) return "git commit -m \"message\" — the room commits nothing unsaid.";
        const oid = await git.commit({ fs, dir, author: authorOf(os), message });
        return `committed ${oid.slice(0, 8)} — ${message}`;
      }
      case "branch": {
        if (rest[0]) { await git.branch({ fs, dir, ref: rest[0] }); return `branch ${rest[0]} created at HEAD.`; }
        const branches = await git.listBranches({ fs, dir });
        const current = await git.currentBranch({ fs, dir, fullname: false });
        return branches.map((b: string) => `${b === current ? "* " : "  "}${b}`).join("\n") || "no branches yet.";
      }
      case "checkout": {
        if (!rest[0]) return "git checkout <branch|sha>";
        await git.checkout({ fs, dir, ref: rest[0] });
        return `HEAD is now at ${rest[0]} — the files in ${dir} follow.`;
      }
      case "remote": {
        if (rest[0] === "add" && rest[1] && rest[2]) { await git.addRemote({ fs, dir, remote: rest[1], url: rest[2] }); return `remote ${rest[1]} → ${rest[2]}`; }
        const remotes = await git.listRemotes({ fs, dir });
        return remotes.length ? remotes.map((r: any) => `${r.remote}\t${r.url}`).join("\n") : "no remotes.";
      }
      case "pull": {
        const refusal = os.gate("active"); if (refusal) return refusal;
        await git.pull({ fs, http, dir, corsProxy: proxy, onAuth: authOf(os), author: authorOf(os) });
        return "pulled. the tree is current with the remote.";
      }
      case "push": {
        const refusal = os.gate("active"); if (refusal) return refusal;
        const result = await git.push({ fs, http, dir, corsProxy: proxy, onAuth: authOf(os), onAuthFailure: () => { throw new Error("the remote refused the credentials — git-token.txt is offered as x-access-token's password when present; without it, public pushes have no name to give."); } });
        return result?.ok === false ? `push refused: ${JSON.stringify(result)}` : "pushed. the remote carries the room's line now.";
      }
      default: return usage;
    }
  };
  // AEGIS meets git at the adapter, not at the operation: each
  // synchronous VfsFs mutation runs under os.ownSync, whose span is
  // the call itself — the ransom signatures, the decoy canaries and
  // the entropy watch stay armed for git's writes exactly as for
  // anyone's, and while git waits on the wire the room's cadence
  // counts every other writer at full strength. The one documented
  // tradeoff stands: an adapter mutation skips the generic volume
  // count, so a git operation can write or delete many files
  // without tripping that single heuristic.
  verb("git", "EDGE", "git <clone|init|status|log|add|commit|branch|checkout|remote|pull|push|config> — real git, in the room's own tree", async (ctx) => runGit(ctx));
}
