#!/usr/bin/env node
/**
 * Fetch The Orange Book from the public orange repository and regenerate the
 * hosted reader. The default ref is main; set ORANGE_BOOK_REF or pass --ref.
 *
 *   npm run sync:book                                     # fetch and write
 *   npm run sync:book:offline                             # committed snapshot, no network
 *   node scripts/sync-orange-book.mjs --check             # compare, no network, no writes
 *
 * Nothing in `npm run build` fetches the Book. Call `sync:book` first.
 *
 * A failed fetch exits non-zero. There is no silent fallback to the previous
 * text. --offline is refused when CI is set, so a continuous-integration build
 * cannot publish the committed snapshot after a missed fetch.
 *
 * Chapter rows in src/content/book/manifest.json use slug, title, status
 * ("drafted" or "planned"), and source. Curriculum rows also set part.
 * The orange commit is stored once at the top level (commit, ref) and again
 * on each chapter so a checker can read it from the row. Orange "draft" is
 * stored as "drafted" and "planned" as "planned". "original" is the
 * manuscript rollup: it does not mark the preface and it does not add a row.
 * Curriculum part and status come from docs/book/manifest.json when orange
 * ships one, and otherwise from the curriculum map (a CURRICULUM_MAP file,
 * or docs/book/README.md). Part is exactly Novice, Journeyman, or Master,
 * in that order. Titles keep orange's labels (N7, J2, and the rest).
 * Planned rows with no chapter file are listed and do not get a page or a
 * link. The 24 manuscript rows do not get part; the site falls back to the
 * hosted chapter's part. A curriculum file missing from the manifest or map,
 * or a curriculum part other than those three names, fails the sync before
 * any chapter file is written. This script does not claim the Book is complete.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import GithubSlugger from "github-slugger";

const root = fileURLToPath(new URL("../", import.meta.url));
const repositoryUrl = "https://github.com/chasebryan/orange";
const manuscriptPath = "docs/THE_ORANGE_BOOK.md";
const vendorPath = "vendor/orange/THE_ORANGE_BOOK.md";
const downloadPath = "public/book/orange-book.md";
const metadataPath = "src/data/book.json";
const chapterDirectory = "src/content/book";
const manifestOutput = "src/content/book/manifest.json";
const snapshotDirectory = "src/content/book/source";
const snapshotBookDirectory = "src/content/book/source/book";
const provenancePath = "src/content/book/source/provenance.json";
const descriptions = [
  "The book's audience, the current state of Orange, and the boundary between aspiration and evidence.",
  "Why high-assurance cryptography depends on the connections between specifications, implementations, proofs, and binaries.",
  "How Orange describes assurance through precise claims, evidence, assumptions, and independent outcomes.",
  "One language with distinct semantic roles for specifications, implementations, proofs, and foreign interfaces.",
  "The path from source bytes through syntax and meaning to the Typed Reference Core.",
  "The distinction between finding a proof and checking one, and the proposed trust boundary around automation.",
  "Secrecy, leakage policies, constant-time claims, and the gap between source code and native execution.",
  "Why Orange builds its permanent compiler through small slices instead of a disposable prototype.",
  "The current Orange 2026 grammar, semantic slices, executable examples, and explicit capability limits.",
  "The evidence and design decisions needed to connect the reference semantics to native code.",
  "Foreign interfaces, contracts, imported assumptions, and secrets crossing language boundaries.",
  "How standards, clauses, test vectors, provenance, and rights become versioned inputs.",
  "Why real cryptographic algorithms and their known answers belong in the acceptance process from the beginning.",
  "The boundaries between primitive correctness, protocol interoperability, and independent validation.",
  "The records and identities needed to keep a build's evidence useful after the build ends.",
  "Offline replay, dependency closure, and making a claim's trust budget visible.",
  "Solo development through bounded stages, explicit decisions, acceptance gates, and durable records.",
  "Release claims, updates, vulnerability response, stop-ship conditions, and support boundaries.",
  "A reference for the current grammar, types, operators, commands, and diagnostic families.",
  "A summary of the project's decision register and the status of its controlling decisions.",
  "Definitions of the claim and evidence vocabulary used throughout the book.",
  "The principal repository sources behind each chapter and appendix.",
  "The manuscript's chapter plan and intended reading structure.",
  "The source documents, manuscript revision history, authorship, and drafting disclosures.",
];
const expectedSlugs = [
  "preface",
  ...Array.from({ length: 17 }, (_, index) => `chapter-${index + 1}`),
  ..."abcd".split("").map((letter) => `appendix-${letter}`),
  "manuscript-map",
  "sources-and-drafting-disclosure",
];
const partDivider = /^(?:Part \d+,.*|Novice continuation)$/;

function options(args) {
  const result = {
    check: false,
    offline: false,
    selfTest: false,
    ref: process.env.ORANGE_BOOK_REF?.trim() || "main",
    repo: undefined,
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--check") result.check = true;
    else if (arg === "--offline") result.offline = true;
    else if (arg === "--self-test") result.selfTest = true;
    else if ((arg === "--ref" || arg === "--repo") && args[index + 1] && !args[index + 1].startsWith("--")) {
      result[arg === "--ref" ? "ref" : "repo"] = arg === "--repo" ? path.resolve(args[++index]) : args[++index];
    } else if (arg === "--help") {
      console.log(`Usage: node scripts/sync-orange-book.mjs [--ref <ref>] [--offline] [--check] [--repo <checkout>]

ORANGE_BOOK_REF       git ref to fetch (default main). --ref overrides it.
ORANGE_BOOK_OFFLINE=1 same as --offline.`);
      process.exit(0);
    } else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  if (process.env.ORANGE_BOOK_OFFLINE === "1" || process.env.ORANGE_BOOK_OFFLINE === "true") result.offline = true;
  if (result.offline && result.repo) throw new Error("Use either --offline or --repo, not both.");
  if (result.offline && !result.check && (process.env.CI === "true" || process.env.CI === "1")) {
    throw new Error("Refusing --offline while CI is set. Fetch the Book, or unset CI for a local snapshot build. A failed fetch must not publish the committed copy.");
  }
  return result;
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      ...(cwd ? { cwd } : {}),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  } catch (error) {
    const detail = `${error.stderr ?? ""}`.trim() || error.message;
    throw new Error(detail);
  }
}

function fetchOrange(ref) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "orange-book-"));
  try {
    git(["init", "-q"], dir);
    git(["remote", "add", "origin", `${repositoryUrl}.git`], dir);
    git(["sparse-checkout", "init", "--cone"], dir);
    git(["sparse-checkout", "set", "docs"], dir);
    git(["fetch", "--depth", "1", "origin", ref], dir);
    const sha = git(["rev-parse", "FETCH_HEAD"], dir).trim();
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`Unexpected commit id: ${sha}`);
    git(["checkout", "--detach", "--quiet", "FETCH_HEAD"], dir);
    return { dir, sha };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`Could not fetch ${repositoryUrl} ref ${JSON.stringify(ref)}. ${error.message}`);
  }
}

async function readBookFiles(directory) {
  const files = new Map();
  async function walk(current, prefix) {
    const entries = await readdir(current, { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile() && /\.(?:md|json|ya?ml|txt)$/i.test(entry.name)) {
        files.set(`docs/book/${relative}`, await readFile(absolute, "utf8"));
      } else if (entry.isFile()) {
        throw new Error(`docs/book contains ${relative}, which the sync does not copy. Extend the sync before relying on it.`);
      }
    }
  }
  await walk(directory, "");
  return files;
}

function findManifest(bookFiles) {
  const matches = [...bookFiles.keys()].filter((file) =>
    /(?:^|\/)[^/]*manifest[^/]*\.(?:json|ya?ml)$/i.test(file)
  ).sort();
  if (matches.length > 1) {
    throw new Error(`Found more than one chapter manifest under docs/book/: ${matches.join(", ")}. Keep a single manifest so chapter status is unambiguous.`);
  }
  return matches[0] ?? null;
}

// Record which lines are ordinary Markdown. A fence closes only with the same
// marker and at least the opening marker's length; code examples stay untouched.
function manuscriptLines(source) {
  let fence;
  return source.split(/(?<=\n)/).map((text) => {
    const marker = text.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)/);
    let prose = !fence;
    if (marker && !fence) {
      fence = { marker: marker[1][0], length: marker[1].length };
      prose = false;
    } else if (marker && fence && marker[1][0] === fence.marker && marker[1].length >= fence.length && /^\s*$/.test(marker[2])) {
      fence = undefined;
      prose = false;
    }
    if (/^(?: {4}|\t)/.test(text)) prose = false;
    const heading = prose ? text.trimEnd().match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/) : null;
    return { text, prose, heading: heading && { level: heading[1].length, title: heading[2].trim() } };
  });
}

function chapterSlug(title) {
  if (title === "Preface") return "preface";
  const chapter = title.match(/^Chapter (\d+): /);
  if (chapter) return `chapter-${chapter[1]}`;
  const appendix = title.match(/^Appendix ([A-D]): /);
  if (appendix) return `appendix-${appendix[1].toLowerCase()}`;
  if (title === "Manuscript map") return "manuscript-map";
  if (title === "Sources and drafting disclosure") return "sources-and-drafting-disclosure";
  throw new Error(`Unrecognized top-level book section: ${title}`);
}

function chapterPart(slug) {
  const chapter = Number(slug.match(/^chapter-(\d+)$/)?.[1]);
  if (chapter <= 3) return "Part I: Why Orange";
  if (chapter <= 6) return "Part II: Meaning and Trust";
  if (chapter <= 10) return "Part III: Building the Language";
  if (chapter <= 13) return "Part IV: Cryptography in Practice";
  if (chapter <= 17) return "Part V: Operating Orange";
  if (slug.startsWith("appendix-")) return "Appendices";
  return slug === "preface" ? "Front matter" : "Back matter";
}

function splitHash(destination) {
  const match = destination.split(/#(.*)/s);
  return [match[0], match[1]];
}

function linkedFile(fromFile, destination) {
  if (!destination || /^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith("//") || destination.startsWith("/")) return null;
  const [relativePath, fragment] = splitHash(destination);
  if (!relativePath) return { file: fromFile, fragment: fragment ? decodeURIComponent(fragment) : undefined };
  const file = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), relativePath));
  return { file, fragment: fragment ? decodeURIComponent(fragment) : undefined, directory: relativePath.endsWith("/") };
}

function canonicalPart(value) {
  if (typeof value !== "string") return undefined;
  const novice = /\bnovice\b/i.test(value);
  const journeyman = /\bjourneyman\b/i.test(value);
  const master = /\bmaster\b/i.test(value);
  if ([novice, journeyman, master].filter(Boolean).length !== 1) return undefined;
  return novice ? "Novice" : journeyman ? "Journeyman" : "Master";
}

function knownOriginal(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "original";
}

function canonicalStatus(value) {
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase();
  if (text === "draft" || text === "drafted") return "drafted";
  if (text === "planned") return "planned";
  return undefined;
}

// A small indented-YAML subset is enough for a chapter manifest. JSON is
// preferred. Anchors, tags, and block scalars fail loudly instead of being
// misread as chapter status.
function parseYaml(source) {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const tokens = [];
  for (let number = 0; number < lines.length; number++) {
    const raw = lines[number];
    if (/^\s*(#|$)/.test(raw)) continue;
    if (raw.includes("\t")) throw new Error(`YAML manifest uses a tab (line ${number + 1}).`);
    const indent = raw.match(/^ */)?.[0].length ?? 0;
    const text = raw.slice(indent).replace(/\s+$/, "").replace(/\s+#.*$/, "");
    if (/^(?:<<|!|&|\*)/.test(text) || /:\s*[|>]/.test(text)) {
      throw new Error(`YAML manifest uses an unsupported construct on line ${number + 1}. Use JSON, or plain indented keys and lists.`);
    }
    tokens.push({ indent, text, line: number + 1 });
  }
  let index = 0;
  const peek = () => tokens[index];
  function scalar(text) {
    if (text === "null" || text === "~" || text === "") return null;
    if (text === "true") return true;
    if (text === "false") return false;
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
    if (/^-?\d+$/.test(text)) return Number(text);
    return text;
  }
  function keyValue(text) {
    const separator = text.indexOf(":");
    if (separator <= 0 || text.startsWith('"') || text.startsWith("'")) return null;
    return [text.slice(0, separator).trim(), text.slice(separator + 1).trim()];
  }
  function absorbMap(map, indent) {
    while (peek() && peek().indent === indent && !peek().text.startsWith("- ")) {
      const token = tokens[index++];
      const pair = keyValue(token.text);
      if (!pair) throw new Error(`Expected a YAML key on line ${token.line}.`);
      map[pair[0]] = pair[1] === "" ? parseBlock(indent + 1) : scalar(pair[1]);
    }
    return map;
  }
  function parseBlock(minIndent) {
    const first = peek();
    if (!first || first.indent < minIndent) return null;
    if (first.text.startsWith("- ")) return parseList(first.indent);
    return absorbMap({}, first.indent);
  }
  function parseList(indent) {
    const list = [];
    while (peek() && peek().indent === indent && peek().text.startsWith("- ")) {
      const token = tokens[index++];
      const rest = token.text.slice(2).trim();
      if (rest === "") list.push(parseBlock(indent + 1));
      else {
        const pair = keyValue(rest);
        if (!pair) list.push(scalar(rest));
        else {
          const item = { [pair[0]]: pair[1] === "" ? parseBlock(indent + 2) : scalar(pair[1]) };
          absorbMap(item, indent + 2);
          list.push(item);
        }
      }
    }
    return list;
  }
  const value = parseBlock(0);
  if (peek()) throw new Error(`Unparsed YAML manifest content at line ${peek().line}.`);
  return value;
}

export function parseChapterManifest(text, file) {
  try {
    return /\.json$/i.test(file) ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    throw new Error(`Could not parse orange chapter manifest ${file}. ${error.message}`);
  }
}

function manifestEntries(document) {
  const source = Array.isArray(document) ? document : document?.chapters;
  if (Array.isArray(source)) {
    return source.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Orange manifest chapter ${index + 1} must be an object.`);
      }
      return entry;
    });
  }
  if (source && typeof source === "object") {
    return Object.entries(source).map(([key, value]) => {
      if (typeof value === "string") return { slug: key, status: value };
      if (value && typeof value === "object" && !Array.isArray(value)) return { slug: key, ...value };
      throw new Error(`Orange manifest chapter ${key} must be a status or an object.`);
    });
  }
  throw new Error("Orange chapter manifest must be a list, or an object with a chapters list or map.");
}

function entryIdentity(entry) {
  const slug = typeof entry.slug === "string" ? entry.slug : typeof entry.id === "string" ? entry.id : null;
  const title = typeof entry.title === "string" ? entry.title : typeof entry.name === "string" ? entry.name : null;
  const rawSource = entry.source ?? entry.path ?? entry.sourcePath ?? entry.file;
  let source = typeof rawSource === "string" ? rawSource.trim().replace(/^\.\//, "").split("#")[0] : null;
  if (source?.startsWith("book/")) source = `docs/${source}`;
  if (source === "THE_ORANGE_BOOK.md") source = manuscriptPath;
  const rawAnchor = entry.anchor ?? entry.fragment;
  const anchor = typeof rawAnchor === "string" && rawAnchor.trim() ? rawAnchor.trim().replace(/^#/, "") : null;
  return { slug, title, source, anchor };
}

function destinationAt(text, start) {
  if (text[start] === "<") {
    const end = text.indexOf(">", start + 1);
    return end < 0 ? null : { start: start + 1, end };
  }
  let depth = 0;
  let end = start;
  for (; end < text.length; end++) {
    if (text[end] === "\\") { end++; continue; }
    if (/\s/.test(text[end])) break;
    if (text[end] === "(") depth++;
    if (text[end] === ")") { if (depth === 0) break; depth--; }
  }
  return end > start ? { start, end } : null;
}

function rewriteProse(text, resolve) {
  const edits = [];
  const protectedSpans = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== "`") continue;
    const start = index;
    while (text[index + 1] === "`") index++;
    const delimiter = text.slice(start, index + 1);
    let close = text.indexOf(delimiter, index + 1);
    while (close >= 0 && (text[close - 1] === "`" || text[close + delimiter.length] === "`")) {
      close = text.indexOf(delimiter, close + delimiter.length);
    }
    if (close >= 0) { protectedSpans.push([start, close + delimiter.length]); index = close + delimiter.length - 1; }
  }
  const isCode = (index) => protectedSpans.some(([start, end]) => start <= index && index < end);
  const addDestination = (range) => {
    if (!range || isCode(range.start) || edits.some((edit) => edit.start === range.start)) return;
    const original = text.slice(range.start, range.end);
    const replacement = resolve(original);
    if (replacement !== original) edits.push({ ...range, replacement });
  };
  for (let index = 0; index < text.length - 1; index++) {
    if (text[index] !== "]" || text[index + 1] !== "(" || isCode(index) || text[index - 1] === "\\") continue;
    let start = index + 2;
    while (/\s/.test(text[start] ?? "") && start < text.length) start++;
    addDestination(destinationAt(text, start));
  }
  for (const match of text.matchAll(/^ {0,3}\[[^\]\n]+\]:[ \t]*/gm)) {
    addDestination(destinationAt(text, match.index + match[0].length));
  }
  for (const tag of text.matchAll(/<(?:a|img|source)\b[^>]*>/gi)) {
    if (isCode(tag.index)) continue;
    for (const attribute of tag[0].matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
      const start = tag.index + attribute.index + attribute[0].indexOf(attribute[1]) + 1;
      addDestination({ start, end: start + attribute[2].length });
    }
  }
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
  }
  return text;
}

function rewriteLines(lines, resolve, promote) {
  let output = "";
  let prose = "";
  const flush = () => { output += rewriteProse(prose, resolve); prose = ""; };
  for (const line of lines) {
    if (line.prose) prose += line.heading && promote ? line.text.replace(/^( {0,3})#/, "$1") : line.text;
    else { flush(); output += line.text; }
  }
  flush();
  return output.endsWith("\n") ? output : `${output}\n`;
}

function firstParagraph(markdown) {
  const blocks = markdown
    .replace(/```[\s\S]*?```/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block && !/^(?:#|>|\||[-*]\s|<)/.test(block))
    .map((block) => block
      .replace(/!\[[^\]]*]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/[*_]+/g, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean);
  const plain = blocks.find((block) => block.length >= 80) ?? blocks[0];
  if (!plain) return null;
  if (plain.length <= 240) return plain;
  const cut = plain.slice(0, 240);
  const space = cut.lastIndexOf(" ");
  return `${(space > 160 ? cut.slice(0, space) : cut).trim()}...`;
}

function pageHeading(file, heading, index, pageIndexes) {
  if (!heading || heading.level !== 2 || partDivider.test(heading.title)) return false;
  if (file === manuscriptPath) return heading.title !== "Contents";
  if (pageIndexes) return pageIndexes.has(index);
  return false;
}

function bodyLines(doc, page, pages) {
  if (page.kind === "curriculum") {
    const same = pages
      .filter((candidate) => candidate.file === doc.file && candidate.kind === "curriculum")
      .sort((left, right) => left.headingIndex - right.headingIndex);
    const position = same.indexOf(page);
    const next = same[position + 1];
    const region = doc.lines.slice(page.headingIndex, next?.headingIndex ?? doc.lines.length);
    if (position === 0) {
      const lead = doc.lines.slice(0, page.headingIndex).filter((line) =>
        !(line.heading && (line.heading.level === 1 || partDivider.test(line.heading.title)))
      );
      region.unshift(...lead);
    }
    return region.filter((line) => !(line.heading && partDivider.test(line.heading.title)));
  }
  if (doc.file === manuscriptPath) {
    const next = pages.find((candidate) => candidate.file === doc.file && candidate.headingIndex > page.headingIndex);
    return doc.lines.slice(page.headingIndex + 1, next?.headingIndex ?? doc.lines.length);
  }
  const same = pages.filter((candidate) => candidate.file === doc.file);
  const position = same.indexOf(page);
  const next = same[position + 1];
  const region = doc.lines.slice(page.headingIndex + 1, next?.headingIndex ?? doc.lines.length);
  if (position === 0) {
    const lead = doc.lines.slice(0, page.headingIndex).filter((line) =>
      !(line.heading && (line.heading.level === 1 || partDivider.test(line.heading.title)))
    );
    region.unshift(...lead);
  }
  return region.filter((line) => !(line.heading && partDivider.test(line.heading.title)));
}

function mapAnchors(doc, pages) {
  const anchors = new Map();
  const sourceSlugger = new GithubSlugger();
  let page = null;
  let local = null;
  const pendingDividers = [];
  let titleAnchor = null;
  const routeOf = (candidate) => `/book/${candidate.slug}/`;
  for (const [index, line] of doc.lines.entries()) {
    if (!line.heading) continue;
    const sourceAnchor = sourceSlugger.slug(line.heading.title);
    const key = `${doc.file}#${sourceAnchor}`;
    if (doc.file === manuscriptPath && (line.heading.level === 1 || line.heading.title === "Contents")) {
      anchors.set(key, "/book/");
      continue;
    }
    if (line.heading.level === 1) {
      titleAnchor = key;
      continue;
    }
    if (partDivider.test(line.heading.title)) {
      pendingDividers.push(key);
      continue;
    }
    if (pageHeading(doc.file, line.heading, index, doc.pageHeadingIndexes)) {
      page = pages.find((candidate) => candidate.file === doc.file && candidate.headingIndex === index);
      local = new GithubSlugger();
      page.sourceAnchor = sourceAnchor;
      anchors.set(key, routeOf(page));
      for (const divider of pendingDividers) anchors.set(divider, routeOf(page));
      pendingDividers.length = 0;
      if (titleAnchor) { anchors.set(titleAnchor, routeOf(page)); titleAnchor = null; }
    } else if (page) {
      anchors.set(key, `${routeOf(page)}#${local.slug(line.heading.title)}`);
    }
  }
  if (doc.file === "docs/book/README.md") {
    const readme = pages.find((candidate) => candidate.file === doc.file);
    if (!readme) return anchors;
    const localSlugger = new GithubSlugger();
    const source = new GithubSlugger();
    for (const line of doc.lines) {
      if (!line.heading) continue;
      const sourceAnchor = source.slug(line.heading.title);
      if (line.heading.level === 1) {
        readme.sourceAnchor = sourceAnchor;
        anchors.set(`${doc.file}#${sourceAnchor}`, routeOf(readme));
      } else anchors.set(`${doc.file}#${sourceAnchor}`, `${routeOf(readme)}#${localSlugger.slug(line.heading.title)}`);
    }
  }
  return anchors;
}

const curriculumPartOrder = ["Novice", "Journeyman", "Master"];

function curriculumLabel(identity) {
  return identity.slug ?? identity.title ?? identity.source ?? "an unnamed chapter";
}

function isManuscriptTarget(identity) {
  if (identity.source === manuscriptPath) return true;
  if (identity.source?.startsWith("docs/book/")) return false;
  return Boolean(identity.slug && expectedSlugs.includes(identity.slug));
}

function isCurriculumChapterFile(file) {
  if (!file.startsWith("docs/book/") || !/\.md$/i.test(file)) return false;
  const base = path.posix.basename(file);
  if (/^readme\.md$/i.test(base)) return false;
  if (/curriculum.?map/i.test(base)) return false;
  return true;
}

function findCurriculumMap(bookFiles) {
  const maps = [...bookFiles.keys()].filter((file) => /curriculum.?map/i.test(path.posix.basename(file))).sort();
  if (maps.length > 1) {
    throw new Error(`Found more than one curriculum map under docs/book/: ${maps.join(", ")}. Keep a single map so chapter parts are unambiguous.`);
  }
  return maps[0] ?? (bookFiles.has("docs/book/README.md") ? "docs/book/README.md" : null);
}

function orderCurriculum(entries) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const rank = (part) => {
        const found = curriculumPartOrder.indexOf(part);
        if (found < 0) {
          throw new Error(`Curriculum part ${JSON.stringify(part ?? "")} is not Novice, Journeyman, or Master. Refusing to leave part blank.`);
        }
        return found;
      };
      return rank(left.entry.part) - rank(right.entry.part) || left.index - right.index;
    })
    .map(({ entry }) => entry);
}

function entriesFromManifest(document, warnings) {
  const entries = [];
  const seen = new Set();
  for (const entry of manifestEntries(document)) {
    const identity = entryIdentity(entry);
    const label = curriculumLabel(identity);
    const rawStatus = entry.status ?? entry.state;
    if (knownOriginal(rawStatus) || knownOriginal(entry.part)) continue;
    if (isManuscriptTarget(identity)) {
      if (rawStatus != null && rawStatus !== "" && !canonicalStatus(rawStatus)) {
        warnings.push(`Manifest status ${JSON.stringify(rawStatus)} for ${label} is not "drafted" or "planned"; that token was not stored.`);
      }
      continue;
    }
    const part = canonicalPart(entry.part);
    const status = canonicalStatus(rawStatus);
    if (!part) {
      throw new Error(`Curriculum entry ${label} has part ${JSON.stringify(entry.part ?? "")}, which is not Novice, Journeyman, or Master. Refusing to leave part blank.`);
    }
    if (!status) {
      throw new Error(`Curriculum entry ${label} has status ${JSON.stringify(rawStatus ?? "")}, which is not drafted or planned.`);
    }
    const title = identity.title?.trim();
    if (!title) throw new Error(`Curriculum entry ${label} has no title.`);
    const slug = (identity.slug?.trim() || identity.anchor || new GithubSlugger().slug(title)).toLowerCase();
    if (seen.has(slug)) throw new Error(`Duplicate curriculum slug ${slug} (${title}).`);
    seen.add(slug);
    entries.push({ slug, title, part, status, source: identity.source, anchor: identity.anchor });
  }
  return orderCurriculum(entries);
}

function entriesFromMap(text, file) {
  const entries = [];
  const seen = new Set();
  let part = null;
  let headers = null;
  const push = (entry) => {
    if (seen.has(entry.slug)) return;
    seen.add(entry.slug);
    entries.push(entry);
  };
  for (const line of manuscriptLines(text)) {
    if (line.heading?.level === 2) {
      part = canonicalPart(line.heading.title);
      headers = null;
      continue;
    }
    if (!line.prose) continue;
    const trimmed = line.text.trim();
    if (trimmed.startsWith("|")) {
      const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
      if (!headers) {
        headers = cells.map((cell) => cell.toLowerCase());
        continue;
      }
      const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
      const rowPart = canonicalPart(row.part ?? "");
      const planned = row["only planned"] ?? "";
      if (!rowPart || !planned || /^none$/i.test(planned) || /no further/i.test(planned)) continue;
      const codes = [...planned.matchAll(/\b([NJM]\d+)\b/g)];
      if (codes.length) {
        for (const match of codes) {
          push({ slug: match[1].toLowerCase(), title: match[1], part: rowPart, status: "planned", source: null, anchor: null });
        }
      } else {
        const title = planned.replace(/\s+/g, " ").trim();
        push({ slug: new GithubSlugger().slug(title), title, part: rowPart, status: "planned", source: null, anchor: null });
      }
      continue;
    }
    if (!part) continue;
    for (const labeled of trimmed.matchAll(/(?:\*\*([NJM]\d+)\.\*\*\s+)?\[([^\]]+)\]\(([^)\s]+)\)/g)) {
      const target = linkedFile(file, labeled[3]);
      if (!target?.file.endsWith(".md") || target.file === manuscriptPath || !target.file.startsWith("docs/book/")) continue;
      const linkTitle = labeled[2].replace(/\s+/g, " ").trim();
      const title = labeled[1] ? `${labeled[1]}. ${linkTitle}` : linkTitle;
      const slug = (target.fragment || new GithubSlugger().slug(title)).toLowerCase();
      push({ slug, title, part, status: "drafted", source: target.file, anchor: target.fragment ?? null });
    }
  }
  return orderCurriculum(entries);
}

function curriculumCatalog(source, warnings) {
  if (source.bookFiles.size === 0) return [];
  const entries = source.manifestText != null
    ? entriesFromManifest(parseChapterManifest(source.manifestText, source.manifestPath), warnings)
    : entriesFromMapFile(source);
  const covered = new Set(entries.map((entry) => entry.source).filter(Boolean));
  const missing = [...source.bookFiles.keys()].filter((file) => isCurriculumChapterFile(file) && !covered.has(file)).sort();
  if (missing.length) {
    const noun = missing.length === 1 ? "file" : "files";
    const verb = missing.length === 1 ? "is" : "are";
    throw new Error(`Curriculum chapter ${noun} ${missing.join(", ")} ${verb} not in orange's curriculum manifest or map. Refusing to leave part blank.`);
  }
  return entries;
}

function entriesFromMapFile(source) {
  const mapFile = findCurriculumMap(source.bookFiles);
  if (!mapFile) {
    throw new Error("docs/book/ is present but has no manifest.json and no curriculum map, so curriculum parts cannot be assigned.");
  }
  return entriesFromMap(source.bookFiles.get(mapFile), mapFile);
}

function headingIndex(doc) {
  const slugger = new GithubSlugger();
  const headings = [];
  doc.lines.forEach((line, index) => {
    if (!line.heading) return;
    headings.push({ index, level: line.heading.level, title: line.heading.title, anchor: slugger.slug(line.heading.title) });
  });
  return headings;
}

function matchHeading(headings, entry) {
  return headings.find((heading) => {
    if (heading.level !== 2 || partDivider.test(heading.title)) return false;
    if (entry.anchor) return heading.anchor === entry.anchor;
    return heading.title === entry.title;
  });
}

function generate(source) {
  if (!/^[a-f0-9]{40}$/.test(source.commit)) throw new Error("Book revision must be a full Git commit SHA.");
  const title = source.manuscript.match(/^# (.+)$/m)?.[1];
  const author = source.manuscript.match(/^By (.+)$/m)?.[1];
  const version = source.manuscript.match(/^Manuscript version: (.+)$/m)?.[1];
  const snapshot = source.manuscript.match(/^Snapshot: (\d{4}-\d{2}-\d{2})$/m)?.[1];
  if (!title || !author || !version || !snapshot) throw new Error("Missing manuscript identity fields.");
  const warnings = [];
  const catalog = curriculumCatalog(source, warnings);
  const documents = [{ file: manuscriptPath, text: source.manuscript }];
  for (const [file, text] of [...source.bookFiles].sort(([left], [right]) => left.localeCompare(right))) {
    if (isCurriculumChapterFile(file)) documents.push({ file, text });
  }
  for (const doc of documents) doc.lines = manuscriptLines(doc.text);
  const manuscriptPages = [];
  for (const doc of documents) {
    if (doc.file !== manuscriptPath) continue;
    doc.lines.forEach((line, index) => {
      if (!pageHeading(doc.file, line.heading)) return;
      const slug = chapterSlug(line.heading.title);
      manuscriptPages.push({
        file: doc.file, headingIndex: index, slug, title: line.heading.title,
        sidebarPart: chapterPart(slug), status: null, promote: true, kind: "manuscript",
      });
    });
  }
  if (manuscriptPages.map((page) => page.slug).join() !== expectedSlugs.join()) {
    throw new Error(`The manuscript structure changed (${manuscriptPages.map((page) => page.slug).join(", ")}). Update the importer before syncing.`);
  }
  const slugs = new Set(manuscriptPages.map((page) => page.slug));
  for (const entry of catalog) {
    if (slugs.has(entry.slug)) {
      throw new Error(`Curriculum slug ${entry.slug} (${entry.title}) collides with another chapter. Refusing to leave its part blank.`);
    }
    slugs.add(entry.slug);
  }
  const curriculumPages = [];
  for (const doc of documents) {
    if (doc.file === manuscriptPath) continue;
    const headings = headingIndex(doc);
    const indexes = new Set();
    for (const entry of catalog.filter((item) => item.source === doc.file && source.bookFiles.has(doc.file))) {
      const heading = matchHeading(headings, entry);
      if (!heading) {
        throw new Error(`Curriculum chapter ${entry.title} (${entry.slug}) in ${doc.file} has no heading for ${entry.anchor ?? entry.title}. Refusing to leave its part blank.`);
      }
      if (indexes.has(heading.index)) {
        throw new Error(`Curriculum chapter ${entry.title} (${entry.slug}) shares a heading in ${doc.file} with another entry.`);
      }
      indexes.add(heading.index);
      curriculumPages.push({
        file: doc.file, headingIndex: heading.index, slug: entry.slug, title: entry.title,
        sidebarPart: entry.part, status: entry.status, promote: false, kind: "curriculum", sourceAnchor: heading.anchor,
      });
    }
    doc.pageHeadingIndexes = indexes;
  }
  for (const entry of catalog) {
    if (entry.status !== "drafted") continue;
    if (!entry.source || !source.bookFiles.has(entry.source)) {
      throw new Error(`Curriculum chapter ${entry.title} (${entry.slug}) is drafted but ${entry.source ?? "no source file"} is not in docs/book/.`);
    }
    if (!curriculumPages.some((page) => page.slug === entry.slug)) {
      throw new Error(`Curriculum chapter ${entry.title} (${entry.slug}) was not hosted. Refusing to leave its part blank.`);
    }
  }
  curriculumPages.sort((left, right) => catalog.findIndex((entry) => entry.slug === left.slug) - catalog.findIndex((entry) => entry.slug === right.slug));
  manuscriptPages.forEach((page, order) => { page.order = order; });
  curriculumPages.forEach((page, order) => { page.order = manuscriptPages.length + order; });
  const pages = [...manuscriptPages, ...curriculumPages];
  const anchors = new Map();
  for (const doc of documents) for (const [key, route] of mapAnchors(doc, pages)) anchors.set(key, route);
  const firstPage = new Map();
  for (const page of pages) if (!firstPage.has(page.file)) firstPage.set(page.file, `/book/${page.slug}/`);
  let hostedLinks = 0;
  let repositoryLinks = 0;
  const broken = [];
  function resolveDestination(fromFile, destination) {
    if (!destination || /^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith("//") || destination.startsWith("/")) return destination;
    const target = linkedFile(fromFile, destination);
    if (!target) return destination;
    if (target.file === "assets/identity/orange-book-cover.svg") return "/projects/orange/book-cover.svg";
    const hostedChapter = target.file === manuscriptPath || firstPage.has(target.file);
    if (hostedChapter && target.file.endsWith(".md")) {
      const route = target.fragment ? anchors.get(`${target.file}#${target.fragment}`) : firstPage.get(target.file);
      if (route) { hostedLinks++; return route; }
      if (target.file === manuscriptPath) throw new Error(`Unknown manuscript anchor: ${destination}`);
      broken.push({ source: fromFile, destination, reason: "no hosted heading for this anchor" });
    } else if (target.file.startsWith("../")) {
      throw new Error(`Repository link escapes its root: ${destination}`);
    }
    repositoryLinks++;
    const kind = target.directory ? "tree" : "blob";
    const suffix = target.directory && !target.file.endsWith("/") ? "/" : "";
    const rawFragment = destination.includes("#") ? `#${destination.split("#").slice(1).join("#")}` : "";
    return `${repositoryUrl}/${kind}/${source.commit}/${target.file}${suffix}${rawFragment}`;
  }
  const files = new Map([[vendorPath, source.manuscript], [downloadPath, source.manuscript]]);
  for (const page of pages) {
    const doc = documents.find((candidate) => candidate.file === page.file);
    const lines = bodyLines(doc, page, pages);
    const description = page.kind === "manuscript"
      ? descriptions[manuscriptPages.indexOf(page)]
      : firstParagraph(lines.map((line) => line.text).join("")) ?? page.title;
    page.description = description;
    const data = { title: page.title, part: page.sidebarPart, order: page.order, description };
    const frontmatter = Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
    const body = rewriteLines(lines, (destination) => resolveDestination(page.file, destination), page.promote);
    files.set(`${chapterDirectory}/${page.slug}.md`, `---\n${frontmatter}\n---\n${body}`);
  }
  const manifest = {
    schemaVersion: 1,
    repository: repositoryUrl,
    ref: source.ref,
    commit: source.commit,
    title,
    author,
    version,
    snapshot,
    manuscript: manuscriptPath,
    docsBook: source.bookFiles.size > 0,
    orangeManifest: source.manifestPath,
    chapters: [
      ...catalog.map((entry) => ({
        part: entry.part,
        slug: entry.slug,
        title: entry.title,
        status: entry.status,
        source: entry.source,
        commit: source.commit,
      })),
      ...manuscriptPages.map((page) => ({
        slug: page.slug,
        title: page.title,
        status: "drafted",
        source: page.file,
        commit: source.commit,
      })),
    ],
  };
  files.set(manifestOutput, `${JSON.stringify(manifest, null, 2)}\n`);
  const metadata = {
    title, author, version, snapshot, revision: source.commit, ref: source.ref,
    sourceUrl: `${repositoryUrl}/blob/${source.commit}/${manuscriptPath}`,
    chapters: manuscriptPages.map((page) => ({
      slug: page.slug, title: page.title, part: page.sidebarPart, order: page.order, description: page.description,
    })),
  };
  files.set(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return { files, ordered: manuscriptPages, curriculum: catalog, broken, warnings, hostedLinks, repositoryLinks, manifest };
}

async function loadSnapshot() {
  const provenance = JSON.parse(await readFile(path.join(root, provenancePath), "utf8").catch((error) => {
    if (error.code === "ENOENT") throw new Error(`Missing ${provenancePath}. Run npm run sync:book once with network access before --offline or --check.`);
    throw error;
  }));
  if (!/^[a-f0-9]{40}$/.test(provenance.commit ?? "")) throw new Error(`${provenancePath} has no full commit SHA.`);
  const manuscript = await readFile(path.join(root, vendorPath), "utf8");
  const bookFiles = await readBookFiles(path.join(root, snapshotBookDirectory));
  const manifestPath = provenance.orangeManifest ?? null;
  return {
    ref: provenance.ref,
    commit: provenance.commit,
    manuscript,
    bookFiles,
    manifestPath,
    manifestText: manifestPath ? bookFiles.get(manifestPath) ?? null : null,
  };
}

async function loadCheckout(directory, ref, commit) {
  const manuscriptFile = path.join(directory, manuscriptPath);
  const manuscript = await readFile(manuscriptFile, "utf8").catch((error) => {
    if (error.code === "ENOENT") throw new Error(`${ref} (${commit}) has no ${manuscriptPath}.`);
    throw error;
  });
  const bookFiles = await readBookFiles(path.join(directory, "docs/book"));
  const manifestPath = findManifest(bookFiles);
  return { ref, commit, manuscript, bookFiles, manifestPath, manifestText: manifestPath ? bookFiles.get(manifestPath) : null };
}

async function writeSnapshot(source) {
  await mkdir(path.join(root, snapshotDirectory), { recursive: true });
  await writeFile(path.join(root, provenancePath), `${JSON.stringify({
    schemaVersion: 1,
    ref: source.ref,
    commit: source.commit,
    orangeManifest: source.manifestPath,
  }, null, 2)}\n`);
  await rm(path.join(root, snapshotBookDirectory), { recursive: true, force: true });
  for (const [file, text] of source.bookFiles) {
    const destination = path.join(root, snapshotBookDirectory, file.slice("docs/book/".length));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, text);
  }
}

async function commitSource(args) {
  if (args.offline || args.check) return loadSnapshot();
  if (args.repo) {
    const dirty = git(["-C", args.repo, "status", "--porcelain", "--", "docs/THE_ORANGE_BOOK.md", "docs/book"], undefined);
    if (dirty.trim()) throw new Error("Commit the Orange Book files before importing them so the hosted source has an immutable revision.");
    const commit = git(["-C", args.repo, "rev-parse", "HEAD"], undefined).trim();
    return loadCheckout(args.repo, args.ref, commit);
  }
  const fetched = fetchOrange(args.ref);
  try {
    return await loadCheckout(fetched.dir, args.ref, fetched.sha);
  } finally {
    rmSync(fetched.dir, { recursive: true, force: true });
  }
}

function selfTest() {
  const manifest = parseChapterManifest(`chapters:\n  - slug: n7\n    title: "N7: Name"\n    part: Novice\n    status: drafted\n    source: docs/book/N7.md\n  - slug: rings\n    title: Rings\n    part: Journeyman\n    status: planned\n`, "docs/book/manifest.yaml");
  if (manifest.chapters[0].status !== "drafted" || manifest.chapters[1].part !== "Journeyman") {
    throw new Error("YAML manifest parser failed.");
  }
  const json = parseChapterManifest('{"chapters":{"preface":"planned"}}', "manifest.json");
  if (json.chapters.preface !== "planned") throw new Error("JSON manifest parser failed.");
  let rejected = false;
  try { parseYaml("value: |\n  no\n"); } catch { rejected = true; }
  if (!rejected) throw new Error("Block scalars must be rejected.");
  if (canonicalStatus("Drafted") !== "drafted" || canonicalStatus("draft") !== "drafted" || canonicalStatus("planned") !== "planned" || canonicalStatus("original") !== undefined) {
    throw new Error("Status normalization drifted.");
  }
  if (canonicalPart("Part 2, The Journeyman") !== "Journeyman" || canonicalPart("Part I") !== undefined) {
    throw new Error("Part normalization drifted.");
  }
  const manuscript = readFileSync(path.join(root, vendorPath), "utf8");
  const manifestText = JSON.stringify({
    chapters: [
      {
        id: "n1",
        title: "N1. Before You Hide Anything",
        part: "novice",
        status: "draft",
        path: "docs/book/NOVICE_OPENING.md",
        anchor: "chapter-1-before-you-hide-anything",
      },
      {
        id: "original-manuscript",
        title: "Existing seventeen chapters and four appendices",
        part: "original",
        status: "original",
        path: "docs/THE_ORANGE_BOOK.md",
        anchor: "preface",
      },
      { slug: "rings", title: "Rings and Fields", part: "Journeyman", status: "planned", source: "docs/book/RINGS.md" },
      { slug: "preface", status: "complete" },
    ],
  });
  const result = generate({
    ref: "self-test",
    commit: "a".repeat(40),
    manuscript,
    bookFiles: new Map([
      ["docs/book/README.md", "## Part 1, The Novice\n\n- [Before](NOVICE_OPENING.md#chapter-1-before-you-hide-anything)\n\n## Part 3, The Master\n\n- [Seams](../THE_ORANGE_BOOK.md#chapter-1-the-seams-are-the-system)\n"],
      ["docs/book/NOVICE_OPENING.md", "# The Orange Book\n\n## Chapter 1: Before You Hide Anything\n\nA message can be read by someone it was not meant for.\n\nSee [the book](../book/).\n\nSee [the index](README.md).\n"],
      ["docs/book/manifest.json", manifestText],
    ]),
    manifestPath: "docs/book/manifest.json",
    manifestText,
  });
  const chapters = result.manifest.chapters;
  const novice = chapters.find((chapter) => chapter.slug === "n1");
  const preface = chapters.find((chapter) => chapter.slug === "preface");
  const seams = chapters.find((chapter) => chapter.slug === "chapter-1");
  const rings = chapters.find((chapter) => chapter.slug === "rings");
  const commit = "a".repeat(40);
  if (novice?.status !== "drafted" || novice.part !== "Novice" || novice.title !== "N1. Before You Hide Anything" || novice.commit !== commit || novice.source !== "docs/book/NOVICE_OPENING.md") {
    throw new Error(`Novice chapter was not marked from the manifest: ${JSON.stringify(novice)}`);
  }
  if (chapters[0]?.slug !== "n1" || chapters[1]?.slug !== "rings" || chapters.slice(2).map((chapter) => chapter.slug).join() !== expectedSlugs.join()) {
    throw new Error(`Curriculum parts were not ordered Novice, Journeyman, Master ahead of the manuscript: ${chapters.map((chapter) => chapter.slug).join(", ")}`);
  }
  if (preface?.status !== "drafted" || preface.commit !== commit || Object.hasOwn(preface, "part")) {
    throw new Error(`Preface row must stay drafted without a curriculum part: ${JSON.stringify(preface)}`);
  }
  if (expectedSlugs.some((slug) => {
    const row = chapters.find((chapter) => chapter.slug === slug);
    return !row || Object.hasOwn(row, "part") || row.status !== "drafted" || row.commit !== commit;
  })) {
    throw new Error("A manuscript row was given a part or lost its drafted status.");
  }
  if (seams?.status !== "drafted" || Object.hasOwn(seams, "part")) throw new Error(`Manuscript part was overwritten from the curriculum map: ${JSON.stringify(seams)}`);
  if (rings?.status !== "planned" || rings.part !== "Journeyman" || rings.title !== "Rings and Fields" || rings.commit !== commit) {
    throw new Error(`Planned chapter was not kept: ${JSON.stringify(rings)}`);
  }
  if (result.files.has(`${chapterDirectory}/rings.md`)) throw new Error("A planned chapter with no source file was given a page.");
  const hosted = result.files.get(`${chapterDirectory}/n1.md`) ?? "";
  const tree = `https://github.com/chasebryan/orange/tree/${commit}/docs/book/`;
  const index = `https://github.com/chasebryan/orange/blob/${commit}/docs/book/README.md`;
  if (!hosted.includes(tree) || !hosted.includes(index) || !hosted.includes("## Chapter 1: Before You Hide Anything") || !hosted.includes('title: "N1. Before You Hide Anything"')) {
    throw new Error(`Hosted novice page did not keep its heading and pinned links: ${hosted.slice(0, 700)}`);
  }
  const metadata = JSON.parse(result.files.get(metadataPath));
  if (metadata.chapters.length !== expectedSlugs.length || metadata.chapters.some((chapter) => chapter.part === "Novice" || chapter.part === "Journeyman" || chapter.part === "Master")) {
    throw new Error("book.json must stay the earlier manuscript, without curriculum parts.");
  }
  if (result.manifest.docsBook !== true || result.manifest.commit !== commit) throw new Error("docsBook or commit was not recorded.");
  if (chapters.some((chapter) => chapter.slug === "original-manuscript" || chapter.status === "draft" || chapter.status === "original" || chapter.status == null || !chapter.slug || !chapter.title || !/^[a-f0-9]{40}$/.test(chapter.commit))) {
    throw new Error(`Rollup or orange vocabulary leaked into the site manifest: ${JSON.stringify(chapters.map((chapter) => `${chapter.slug}:${chapter.status}`))}`);
  }
  if (!result.warnings.some((warning) => warning.includes("complete"))) throw new Error("Unrecognized status was not reported.");
  if (result.warnings.some((warning) => /original/i.test(warning))) throw new Error(`Original rollup was warned: ${result.warnings.join(" | ")}`);
  const mapped = generate({
    ref: "self-test",
    commit: "b".repeat(40),
    manuscript,
    bookFiles: new Map([
      ["docs/book/README.md", "## Part 1, The Novice\n\n- **N1.** [Before You Hide Anything](NOVICE_OPENING.md#chapter-1-before-you-hide-anything)\n\n| Part | Drafted in this tree | Only planned |\n| --- | --- | --- |\n| Part 2, The Journeyman | None | J2 |\n"],
      ["docs/book/NOVICE_OPENING.md", "# The Orange Book\n\n## Chapter 1: Before You Hide Anything\n\nA message can be read by someone it was not meant for.\n"],
    ]),
    manifestPath: null,
    manifestText: null,
  });
  const mappedNovice = mapped.manifest.chapters.find((chapter) => chapter.title === "N1. Before You Hide Anything");
  const mappedPlan = mapped.manifest.chapters.find((chapter) => chapter.slug === "j2");
  if (mappedNovice?.part !== "Novice" || mappedNovice.status !== "drafted" || mappedPlan?.part !== "Journeyman" || mappedPlan.status !== "planned" || mappedPlan.title !== "J2" || mapped.files.has(`${chapterDirectory}/j2.md`)) {
    throw new Error(`Curriculum map fallback failed: ${JSON.stringify({ mappedNovice, mappedPlan })}`);
  }
  const refuse = (bookFiles, text, pattern) => {
    let failed = false;
    try {
      generate({ ref: "self-test", commit, manuscript, bookFiles, manifestPath: "docs/book/manifest.json", manifestText: text });
    } catch (error) {
      failed = pattern.test(error.message);
    }
    if (!failed) throw new Error(`Sync should have failed matching ${pattern}`);
  };
  const badPart = JSON.parse(manifestText);
  badPart.chapters[0].part = "Wizard";
  refuse(resultBookFiles(manifestText), JSON.stringify(badPart), /Wizard/);
  const extra = resultBookFiles(manifestText);
  extra.set("docs/book/EXTRA.md", "# Extra\n\n## Extra chapter\n\nNot in the map.\n");
  refuse(extra, manifestText, /EXTRA\.md/);
  console.log("Orange Book sync self-test passed.");
}

function resultBookFiles(manifestText) {
  return new Map([
    ["docs/book/README.md", "## Part 1, The Novice\n\n- [Before](NOVICE_OPENING.md#chapter-1-before-you-hide-anything)\n"],
    ["docs/book/NOVICE_OPENING.md", "# The Orange Book\n\n## Chapter 1: Before You Hide Anything\n\nA message can be read by someone it was not meant for.\n"],
    ["docs/book/manifest.json", manifestText],
  ]);
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.selfTest) { selfTest(); return; }
  const source = await commitSource(args);
  if (source.manifestPath && source.manifestText == null) {
    throw new Error(`Orange manifest ${source.manifestPath} was recorded but not found in the snapshot.`);
  }
  // Throws from generate() happen before any write, so a failed sync leaves src/content/book unchanged.
  const result = generate(source);
  const existing = await readdir(path.join(root, chapterDirectory)).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const stale = existing.filter((name) => name.endsWith(".md") && !result.files.has(`${chapterDirectory}/${name}`));
  const mismatches = [];
  for (const [relativePath, expected] of result.files) {
    const absolutePath = path.join(root, relativePath);
    const current = await readFile(absolutePath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (current === expected) continue;
    if (args.check) mismatches.push(relativePath);
    else { await mkdir(path.dirname(absolutePath), { recursive: true }); await writeFile(absolutePath, expected); }
  }
  if (!args.check) await writeSnapshot(source);
  if (args.check) {
    mismatches.push(...stale.map((name) => `${chapterDirectory}/${name} (stale)`));
    if (mismatches.length) {
      throw new Error(`Book outputs are out of date:\n${mismatches.map((file) => `  ${file}`).join("\n")}\nRun npm run sync:book to fetch the Book, or npm run sync:book -- --offline to rebuild the committed snapshot.`);
    }
  } else {
    for (const name of stale) await unlink(path.join(root, chapterDirectory, name));
  }
  const mode = args.check ? "Verified" : "Synced";
  const book = source.bookFiles.size ? `${source.bookFiles.size} docs/book files` : "docs/book absent";
  const listed = source.manifestPath ? `manifest ${source.manifestPath}` : "no orange manifest; curriculum parts from the curriculum map";
  const curriculum = result.curriculum ?? [];
  const summary = curriculumPartOrder.map((part) => {
    const rows = curriculum.filter((entry) => entry.part === part);
    const drafted = rows.filter((entry) => entry.status === "drafted").length;
    const planned = rows.filter((entry) => entry.status === "planned").length;
    return `${part} ${rows.length} (${drafted} drafted, ${planned} planned)`;
  }).join("; ");
  console.log(`${mode} ${result.ordered.length} manuscript pages and ${curriculum.length} curriculum entries from ${source.ref} at ${source.commit}. docsBook ${result.manifest.docsBook}. ${book}; ${listed}.`);
  console.log(`Curriculum: ${summary || "none"}.`);
  console.log(`${result.hostedLinks} hosted cross-references, ${result.repositoryLinks} repository links, manuscript ${result.manifest.version} (${result.manifest.snapshot}).`);
  for (const warning of result.warnings) console.log(`Warning: ${warning}`);
  if (result.broken.length) {
    console.log("In-book links that do not resolve to a hosted heading (rewritten to the orange commit):");
    for (const item of result.broken) console.log(`  ${item.source}: ${item.destination} (${item.reason})`);
  } else console.log("Every in-book link resolved to a hosted page or a repository file.");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
