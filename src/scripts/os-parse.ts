// os-parse.ts — file identification + deep parsing for the Blacksite Web OS
// `file` / `parse` commands. Port of nightjar Blacksite's Wave-10 file bench.
// Pure functions only: no DOM, no imports, never throws on malformed input.

export interface FileVerdict {
  kind: string;
  summary: string;
  details: Record<string, unknown>;
}

/* byte helpers */

function u16le(b: Uint8Array, o: number): number { return o + 1 < b.length ? b[o] | (b[o + 1] << 8) : 0; }
function u16be(b: Uint8Array, o: number): number { return o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0; }
function u32le(b: Uint8Array, o: number): number { return o + 3 < b.length ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : 0; }
function u32be(b: Uint8Array, o: number): number { return o + 3 < b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : 0; }
function u32(b: Uint8Array, o: number, le: boolean): number { return le ? u32le(b, o) : u32be(b, o); }
function u16(b: Uint8Array, o: number, le: boolean): number { return le ? u16le(b, o) : u16be(b, o); }
function u64hex(b: Uint8Array, o: number, le: boolean): string {
  const lo = le ? u32le(b, o) : u32be(b, o + 4);
  const hi = le ? u32le(b, o + 4) : u32be(b, o);
  if (hi === 0) return "0x" + lo.toString(16);
  return "0x" + hi.toString(16) + lo.toString(16).padStart(8, "0");
}
function u64num(b: Uint8Array, o: number, le: boolean): number {
  const lo = le ? u32le(b, o) : u32be(b, o + 4);
  const hi = le ? u32le(b, o + 4) : u32be(b, o);
  return hi * 4294967296 + lo;
}
function ascii(b: Uint8Array, start: number, len: number): string {
  let s = "";
  const end = Math.min(b.length, start + len);
  for (let i = Math.max(0, start); i < end; i++) { if (b[i] === 0) break; s += String.fromCharCode(b[i]); }
  return s;
}
function asciiRaw(b: Uint8Array, start: number, len: number): string {
  let s = "";
  const end = Math.min(b.length, start + len);
  for (let i = Math.max(0, start); i < end; i++) s += String.fromCharCode(b[i]);
  return s;
}
function hasPrefix(b: Uint8Array, sig: readonly number[]): boolean { return b.length >= sig.length && sig.every((v, i) => b[i] === v); }
function hasAscii(b: Uint8Array, off: number, text: string): boolean {
  return b.length >= off + text.length && [...text].every((c, i) => b[off + i] === c.charCodeAt(0));
}
function latin1(b: Uint8Array, max: number): string { let s = ""; for (let i = 0, n = Math.min(b.length, max); i < n; i++) s += String.fromCharCode(b[i]); return s; }
function entropy(b: Uint8Array): number {
  if (b.length === 0) return 0;
  const counts = new Array<number>(256).fill(0);
  for (const x of b) counts[x]++;
  let e = 0;
  for (const c of counts) if (c > 0) { const p = c / b.length; e -= p * Math.log2(p); }
  return Math.round(e * 1000) / 1000;
}
function isoFromUnix(sec: number): string {
  if (sec === 0) return "0 (unset)";
  try { return new Date(sec * 1000).toISOString(); } catch { return String(sec); }
}

/* hexdump */

export function hexdump(bytes: Uint8Array, maxBytes = 4096): string {
  if (bytes.length === 0) return "";
  const limit = Math.max(0, Math.min(bytes.length, maxBytes));
  const lines: string[] = [];
  for (let off = 0; off < limit; off += 16) {
    const slice = bytes.subarray(off, Math.min(off + 16, limit));
    let hexPart = "";
    for (let i = 0; i < 16; i++) {
      hexPart += i < slice.length ? slice[i].toString(16).padStart(2, "0") + " " : "   ";
      if (i === 7) hexPart += " ";
    }
    let text = "";
    for (const c of slice) text += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ".";
    lines.push(`${off.toString(16).padStart(8, "0")}  ${hexPart} |${text}|`);
  }
  if (limit < bytes.length) lines.push(`… (truncated: showing ${limit} of ${bytes.length} bytes)`);
  return lines.join("\n");
}

/* ELF */

const ELF_OSABI: Record<number, string> = { 0: "System V", 1: "HP-UX", 2: "NetBSD", 3: "Linux", 6: "Solaris", 7: "AIX", 8: "IRIX", 9: "FreeBSD", 12: "OpenBSD", 53: "ARM", 255: "Standalone", };
const ELF_TYPE: Record<number, string> = { 0: "NONE", 1: "REL (relocatable)", 2: "EXEC (executable)", 3: "DYN (shared object / PIE)", 4: "CORE", 0xfe00: "LOOS", 0xffff: "LOPROC", };
const ELF_MACHINE: Record<number, string> = { 0: "None", 2: "SPARC", 3: "x86", 4: "MIPS", 8: "MIPS RS3 LE", 20: "PowerPC", 21: "PowerPC64", 22: "S390", 40: "ARM", 42: "SuperH", 43: "SPARCv9", 50: "IA-64", 62: "x86-64", 75: "VAX", 88: "TriCore", 164: "Qualcomm Hexagon", 165: "NXP ColdFire", 183: "AArch64", 188: "TilePro", 191: "NVIDIA CUDA", 243: "RISC-V", };

function parseELF(b: Uint8Array): FileVerdict {
  const cls = b[4];
  const is64 = cls === 2;
  const le = b[5] !== 2;
  const osabi = b[7];
  const eType = u16(b, 16, le);
  const machine = u16(b, 18, le);
  const entry = is64 ? u64hex(b, 24, le) : "0x" + u32(b, 24, le).toString(16);
  const details: Record<string, unknown> = {
    class: is64 ? "ELF64" : cls === 1 ? "ELF32" : `unknown (${cls})`,
    endianness: le ? "little-endian (LSB)" : "big-endian (MSB)",
    version: b[6],
    osAbi: `${ELF_OSABI[osabi] ?? "unknown"} (${osabi})`,
    type: `${ELF_TYPE[eType] ?? "0x" + eType.toString(16)} (${eType})`,
    machine: `${ELF_MACHINE[machine] ?? "unknown"} (${machine})`,
    entryPoint: entry,
    programHeaderCount: u16(b, is64 ? 56 : 44, le),
    sectionHeaderCount: u16(b, is64 ? 60 : 48, le),
  };
  return {
    kind: "ELF executable / object",
    summary: `${details.class} ${le ? "LE" : "BE"} ${ELF_MACHINE[machine] ?? "unknown machine"}, ${ELF_TYPE[eType] ?? "unknown type"}, entry ${entry}`,
    details,
  };
}

/* PE */

const PE_MACHINE: Record<number, string> = { 0x14c: "x86 (I386)", 0x8664: "x86-64 (AMD64)", 0x1c0: "ARM", 0x1c4: "ARMv7 Thumb-2", 0xaa64: "ARM64", 0x1f0: "PowerPC", 0x200: "IA-64", 0x5032: "RISC-V 32", 0x5064: "RISC-V 64", };
const PE_CHARS: Array<[number, string]> = [ [0x0001, "RELOCS_STRIPPED"], [0x0002, "EXECUTABLE_IMAGE"], [0x0004, "LINE_NUMS_STRIPPED"], [0x0008, "LOCAL_SYMS_STRIPPED"], [0x0020, "LARGE_ADDRESS_AWARE"], [0x0100, "32BIT_MACHINE"], [0x0200, "DEBUG_STRIPPED"], [0x1000, "UNIPROCESSOR_ONLY"], [0x2000, "DLL"], [0x4000, "SYSTEM"], [0x8000, "NET_RUN_FROM_SWAP"], ];
const PE_SUBSYSTEM: Record<number, string> = { 0: "unknown", 1: "native", 2: "Windows GUI", 3: "Windows CUI (console)", 5: "OS/2 CUI", 7: "POSIX CUI", 9: "Windows CE GUI", 10: "EFI application", 11: "EFI boot driver", 12: "EFI runtime driver", 14: "Xbox", 16: "Windows boot application", };

function parsePE(b: Uint8Array): FileVerdict {
  const peOff = u32le(b, 0x3c);
  if (peOff + 24 > b.length || !hasAscii(b, peOff, "PE\0\0")) {
    return {
      kind: "DOS executable (MZ)",
      summary: "MZ header present but no PE signature found — likely a DOS/16-bit executable or truncated file",
      details: { e_lfanew: "0x" + peOff.toString(16), note: "PE\\0\\0 signature missing at e_lfanew" },
    };
  }
  const coff = peOff + 4;
  const machine = u16le(b, coff);
  const numSections = u16le(b, coff + 2);
  const timestamp = u32le(b, coff + 4);
  const optSize = u16le(b, coff + 16);
  const chars = u16le(b, coff + 18);
  const flags: string[] = [];
  for (const [bit, flagName] of PE_CHARS) if (chars & bit) flags.push(flagName);
  const details: Record<string, unknown> = {
    machine: `${PE_MACHINE[machine] ?? "unknown"} (0x${machine.toString(16)})`,
    sections: numSections,
    timestamp: `${timestamp} (${isoFromUnix(timestamp)})`,
    characteristics: `0x${chars.toString(16).padStart(4, "0")}`,
    characteristicFlags: flags,
    optionalHeaderSize: optSize,
  };
  if (optSize > 0 && coff + 20 + 70 <= b.length) {
    const opt = coff + 20;
    const magic = u16le(b, opt);
    details.optionalHeaderFormat = magic === 0x20b ? "PE32+" : magic === 0x10b ? "PE32" : `unknown (0x${magic.toString(16)})`;
    details.entryPointRva = "0x" + u32le(b, opt + 16).toString(16);
    const subsystem = u16le(b, opt + 68);
    details.subsystem = `${PE_SUBSYSTEM[subsystem] ?? "unknown"} (${subsystem})`;
  }
  return {
    kind: flags.includes("DLL") ? "PE DLL (Windows)" : "PE executable (Windows)",
    summary: `${PE_MACHINE[machine] ?? "unknown machine"}, ${numSections} section(s), built ${isoFromUnix(timestamp)}`,
    details,
  };
}

/* Mach-O */

const MACHO_CPU: Record<number, string> = { 7: "x86", 0x01000007: "x86_64", 12: "ARM", 0x0100000c: "arm64", 0x0200000c: "arm64_32", 9: "ARMv7", 11: "ARMv7s", 18: "PowerPC", 0x01000012: "PowerPC64", };
const MACHO_FILETYPE: Record<number, string> = { 1: "OBJECT", 2: "EXECUTE", 3: "FVMLIB", 4: "CORE", 5: "PRELOAD", 6: "DYLIB", 7: "DYLINKER", 8: "BUNDLE", 9: "DYLIB_STUB", 10: "DSYM", 11: "KEXT_BUNDLE", };
function cpuName(v: number): string {
  return MACHO_CPU[v] ?? MACHO_CPU[v >>> 0] ?? `0x${(v >>> 0).toString(16)}`;
}
function parseMachOSingle(b: Uint8Array, off: number, le: boolean, is64: boolean): Record<string, unknown> {
  const cpu = u32(b, off + 4, le) | 0; // signed view; cpuName normalises
  const cpuU = u32(b, off + 4, le);
  const filetype = u32(b, off + 12, le);
  const d: Record<string, unknown> = {
    class: is64 ? "Mach-O 64-bit" : "Mach-O 32-bit",
    endianness: le ? "little-endian" : "big-endian",
    cpuType: `${cpuName(cpuU)} (${cpu})`,
    cpuSubtype: u32(b, off + 8, le),
    filetype: `${MACHO_FILETYPE[filetype] ?? "unknown"} (${filetype})`,
    loadCommandCount: u32(b, off + 16, le),
    loadCommandsSize: u32(b, off + 20, le),
    flags: "0x" + u32(b, off + 24, le).toString(16),
  };
  return d;
}
function parseMachO(b: Uint8Array): FileVerdict {
  // FAT: CA FE BA BE (big-endian fields) or CA FE BA BF (fat64).
  if (hasPrefix(b, [0xca, 0xfe, 0xba, 0xbe]) || hasPrefix(b, [0xca, 0xfe, 0xba, 0xbf])) {
    const fat64 = b[3] === 0xbf;
    const count = u32be(b, 4);
    const archs: Array<Record<string, unknown>> = [];
    const entrySize = fat64 ? 32 : 20;
    for (let i = 0; i < count && i < 32; i++) {
      const o = 8 + i * entrySize;
      if (o + entrySize > b.length) break;
      const cpu = u32be(b, o);
      const sliceOff = fat64 ? u64num(b, o + 8, false) : u32be(b, o + 8);
      const sliceSize = fat64 ? u64num(b, o + 16, false) : u32be(b, o + 12);
      const entry: Record<string, unknown> = {
        cpuType: `${cpuName(cpu)} (${cpu})`,
        cpuSubtype: u32be(b, o + 4),
        offset: sliceOff,
        size: sliceSize,
        align: u32be(b, o + (fat64 ? 24 : 16)),
      };
      if (sliceOff > 0 && sliceOff + 4 <= b.length) {
        const m = b.subarray(sliceOff, sliceOff + 4);
        const innerLe = m[0] === 0xcf || m[0] === 0xce;
        const innerIs64 = m[0] === 0xcf || m[3] === 0xcf;
        if (m[3] === 0xce || m[3] === 0xcf || m[0] === 0xce || m[0] === 0xcf) {
          entry.embedded = parseMachOSingle(b, sliceOff, innerLe, innerIs64);
        }
      }
      archs.push(entry);
    }
    return {
      kind: fat64 ? "Mach-O universal binary (FAT64)" : "Mach-O universal binary (FAT)",
      summary: `Universal binary with ${count} architecture slice(s): ${archs.map((a) => String(a.cpuType).split(" (")[0]).join(", ")}`,
      details: { architectures: count, slices: archs },
    };
  }
  const le = b[0] === 0xce || b[0] === 0xcf; // CE/CF first = little-endian file
  const is64 = b[0] === 0xcf || b[3] === 0xcf;
  const d = parseMachOSingle(b, 0, le, is64);
  return {
    kind: "Mach-O binary (macOS/iOS)",
    summary: `${String(d.class)}, ${String(d.cpuType)}, ${String(d.filetype)}`,
    details: d,
  };
}

/* ZIP */

function parseZIP(b: Uint8Array, name: string): FileVerdict {
  const lower = name.toLowerCase();
  const flavour = lower.endsWith(".apk")
    ? "Android APK"
    : lower.endsWith(".ipa")
      ? "iOS IPA"
      : lower.endsWith(".jar")
        ? "Java JAR"
        : lower.endsWith(".docx") || lower.endsWith(".xlsx") || lower.endsWith(".pptx")
          ? "Office Open XML document"
          : lower.endsWith(".epub")
            ? "EPUB e-book"
            : null;
  interface ZipEntry { name: string; method: number; compressedSize: number; uncompressedSize: number }
  const entries: ZipEntry[] = [];
  let off = 0;
  let truncated = false;
  while (off + 30 <= b.length && entries.length < 1000) {
    const sig = u32le(b, off);
    if (sig === 0x02014b50 || sig === 0x06054b50) break; // central dir / EOCD
    if (sig !== 0x04034b50) { truncated = entries.length > 0; break; }
    const flags = u16le(b, off + 6);
    const method = u16le(b, off + 8);
    const comp = u32le(b, off + 18);
    const uncomp = u32le(b, off + 22);
    const nameLen = u16le(b, off + 26);
    const extraLen = u16le(b, off + 28);
    const entryName = (() => {
      try {
        return new TextDecoder("utf-8").decode(b.subarray(off + 30, off + 30 + nameLen));
      } catch {
        return asciiRaw(b, off + 30, nameLen);
      }
    })();
    entries.push({ name: entryName, method, compressedSize: comp, uncompressedSize: uncomp });
    if (comp === 0 && (flags & 0x08) !== 0) { truncated = true; break; } // data-descriptor sizes unknown here
    off += 30 + nameLen + extraLen + comp;
  }
  const details: Record<string, unknown> = {
    entries: entries.length,
    entryList: entries,
    scanNote: truncated
      ? "Scan stopped early (data descriptor or unexpected signature); entry list may be partial."
      : "Entries enumerated from local file headers.",
  };
  if (flavour) details.containerFlavour = flavour;
  if (entries.some((e) => e.name === "AndroidManifest.xml")) details.note = "Contains AndroidManifest.xml — consistent with an APK.";
  if (entries.some((e) => e.name.startsWith("Payload/") && e.name.includes(".app/Info.plist"))) details.note = "Contains a Payload/*.app bundle — consistent with an IPA.";
  if (entries.some((e) => e.name === "META-INF/MANIFEST.MF")) details.jarManifest = true;
  return {
    kind: flavour ? `ZIP archive (${flavour})` : "ZIP archive",
    summary: `${entries.length} entr${entries.length === 1 ? "y" : "ies"}${flavour ? `, packaged as ${flavour}` : ""}${entries.length ? `: ${entries.slice(0, 4).map((e) => e.name).join(", ")}${entries.length > 4 ? ", …" : ""}` : ""}`,
    details,
  };
}

/* PDF */

function parsePDF(b: Uint8Array): FileVerdict {
  const text = latin1(b, Math.min(b.length, 2 * 1024 * 1024));
  const verMatch = /^%PDF-(\d+\.\d+)/.exec(text);
  let pages = 0;
  let idx = 0;
  while ((idx = text.indexOf("/Type", idx)) !== -1) {
    const rest = text.slice(idx, idx + 24).replace(/\s+/g, " ");
    if (/^\/Type ?\/Page(?!s\b)/.test(rest)) pages++;
    idx += 5;
  }
  const hasEncrypt = text.includes("/Encrypt");
  const details: Record<string, unknown> = {
    version: verMatch ? verMatch[1] : "unknown",
    approxPages: pages,
    pageCountMethod: 'count of "/Type /Page" objects (approximation — some generators omit it)',
    encrypted: hasEncrypt,
    linearized: text.slice(0, 4096).includes("/Linearized"),
    hasJavaScript: text.includes("/JavaScript") || text.includes("/JS"),
  };
  return {
    kind: "PDF document",
    summary: `PDF ${verMatch ? verMatch[1] : "?"}, ~${pages} page object(s)${hasEncrypt ? ", ENCRYPTED (/Encrypt present)" : ""}`,
    details,
  };
}

/* images */

const PNG_COLORTYPE: Record<number, string> = { 0: "grayscale", 2: "truecolor RGB", 3: "indexed", 4: "grayscale+alpha", 6: "truecolor RGBA", };
function parsePNG(b: Uint8Array): FileVerdict {
  const details: Record<string, unknown> = { ihdrPresent: false };
  if (b.length >= 29 && hasAscii(b, 12, "IHDR")) {
    details.ihdrPresent = true;
    details.width = u32be(b, 16);
    details.height = u32be(b, 20);
    details.bitDepth = b[24];
    details.colorType = `${PNG_COLORTYPE[b[25]] ?? "unknown"} (${b[25]})`;
    details.interlaced = b[28] === 1;
  }
  return {
    kind: "PNG image",
    summary: `PNG ${String(details.width ?? "?")}×${String(details.height ?? "?")}, bit depth ${String(details.bitDepth ?? "?")}, ${String(details.colorType ?? "unknown colour type")}`,
    details,
  };
}

function parseEXIF(b: Uint8Array, tiffStart: number): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (tiffStart + 8 > b.length) return out;
    const le = b[tiffStart] === 0x49 && b[tiffStart + 1] === 0x49; // "II"
    const be = b[tiffStart] === 0x4d && b[tiffStart + 1] === 0x4d; // "MM"
    if (!le && !be) return out;
    if (u16(b, tiffStart + 2, le) !== 42) return out;
    const ifd0 = tiffStart + u32(b, tiffStart + 4, le);
    if (ifd0 + 2 > b.length) return out;
    const count = Math.min(u16(b, ifd0, le), 64);
    const typeSize: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    for (let i = 0; i < count; i++) {
      const e = ifd0 + 2 + i * 12;
      if (e + 12 > b.length) break;
      const tag = u16(b, e, le);
      if (tag !== 0x010f && tag !== 0x0110) continue; // Make / Model only
      const type = u16(b, e + 2, le);
      const n = u32(b, e + 4, le);
      if (type !== 2) continue;
      const total = n * (typeSize[type] ?? 1);
      const valOff = total <= 4 ? e + 8 : tiffStart + u32(b, e + 8, le);
      if (valOff < 0 || valOff >= b.length) continue;
      const str = ascii(b, valOff, Math.min(n, 64)).trim();
      if (str) out[tag === 0x010f ? "exifMake" : "exifModel"] = str;
    }
  } catch {
    return out;
  }
  return out;
}

function parseJPEG(b: Uint8Array): FileVerdict {
  const details: Record<string, unknown> = { exifPresent: false };
  let off = 2;
  while (off + 4 <= b.length) {
    if (b[off] !== 0xff) { off++; continue; }
    const marker = b[off + 1];
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS: entropy data follows
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x00 || marker === 0xff) {
      off += 2;
      continue;
    }
    const segLen = u16be(b, off + 2);
    if (segLen < 2) break;
    const seg = off + 4;
    if (marker === 0xe1 && hasAscii(b, seg, "Exif\0\0")) {
      details.exifPresent = true;
      Object.assign(details, parseEXIF(b, seg + 6));
    }
    if (marker === 0xe1 && hasAscii(b, seg, "http://ns.adobe.com/xap/1.0/")) details.xmpPresent = true;
    if ((marker === 0xc0 || marker === 0xc2) && details.width === undefined) {
      details.sofMarker = marker === 0xc0 ? "SOF0 (baseline)" : "SOF2 (progressive)";
      details.precision = b[seg];
      details.height = u16be(b, seg + 1);
      details.width = u16be(b, seg + 3);
      details.components = b[seg + 5];
    }
    off += 2 + segLen;
  }
  const exifNote = details.exifPresent
    ? `, EXIF present${details.exifMake ? ` (${String(details.exifMake)}${details.exifModel ? " " + String(details.exifModel) : ""})` : ""}`
    : ", no EXIF";
  return {
    kind: "JPEG image",
    summary: `JPEG ${String(details.width ?? "?")}×${String(details.height ?? "?")}${exifNote}`,
    details,
  };
}

function parseGIF(b: Uint8Array): FileVerdict {
  const version = asciiRaw(b, 0, 6);
  const details: Record<string, unknown> = {
    version,
    width: u16le(b, 6),
    height: u16le(b, 8),
    globalColorTable: (b[10] & 0x80) !== 0,
    colorResolution: ((b[10] >> 4) & 0x07) + 1,
    backgroundColorIndex: b[11],
    animated: latin1(b, Math.min(b.length, 512 * 1024)).includes("NETSCAPE2.0"),
  };
  return {
    kind: "GIF image",
    summary: `${version} ${String(details.width)}×${String(details.height)}${details.animated ? ", animated (NETSCAPE2.0 loop block)" : ""}`,
    details,
  };
}

/* WebAssembly */

const WASM_SECTIONS: Record<number, string> = { 0: "custom", 1: "type", 2: "import", 3: "function", 4: "table", 5: "memory", 6: "global", 7: "export", 8: "start", 9: "element", 10: "code", 11: "data", 12: "data-count", };
function parseWasm(b: Uint8Array): FileVerdict {
  const version = u32le(b, 4);
  const sections: Array<{ id: number; name: string; size: number }> = [];
  let off = 8;
  while (off < b.length && sections.length < 64) {
    const id = b[off++];
    let size = 0;
    let shift = 0;
    let ok = false;
    for (let i = 0; i < 5 && off < b.length; i++) {
      const byte = b[off++];
      size += (byte & 0x7f) * Math.pow(2, shift);
      shift += 7;
      if ((byte & 0x80) === 0) { ok = true; break; }
    }
    if (!ok) break;
    sections.push({ id, name: WASM_SECTIONS[id] ?? `unknown-${id}`, size });
    off += size;
  }
  return {
    kind: "WebAssembly module",
    summary: `Wasm binary version ${version}, ${sections.length} section(s): ${sections.map((s) => s.name).join(", ")}`,
    details: { version, sections },
  };
}

/* SQLite */

function parseSQLite(b: Uint8Array): FileVerdict {
  const rawPageSize = u16be(b, 16);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  const details: Record<string, unknown> = {
    pageSize,
    fileFormatWriteVersion: b[18],
    fileFormatReadVersion: b[19],
    writeVersionMeaning: b[18] === 2 ? "WAL journal mode legacy value" : b[18] === 1 ? "rollback journal" : String(b[18]),
    databaseSizePages: u32be(b, 28),
    schemaFormat: u32be(b, 44),
    sqliteVersionNumber: u32be(b, 96),
  };
  const scanText = latin1(b, Math.min(b.length, 256 * 1024)); // bounded scan: schema strings live in early pages as plain text
  const tables: string[] = [];
  const re = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["'`\[]?([A-Za-z_][A-Za-z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scanText)) !== null && tables.length < 100) {
    if (!tables.includes(m[1])) tables.push(m[1]);
  }
  details.schemaTablesFromHeaderPageScan = tables;
  details.schemaScanNote = "Table names recovered by scanning the first 256 KiB for CREATE TABLE strings (header-page scan), not by walking the full B-tree.";
  return {
    kind: "SQLite database",
    summary: `SQLite database, page size ${pageSize}, ${tables.length} table name(s) visible in header-page scan${tables.length ? `: ${tables.slice(0, 6).join(", ")}${tables.length > 6 ? ", …" : ""}` : ""}`,
    details,
  };
}

/* gzip */

const GZIP_OS: Record<number, string> = { 0: "FAT filesystem (MS-DOS)", 1: "Amiga", 2: "VMS", 3: "Unix", 4: "VM/CMS", 5: "Atari TOS", 6: "HPFS (OS/2)", 7: "Macintosh", 8: "Z-System", 9: "CP/M", 10: "TOPS-20", 11: "NTFS (Windows)", 13: "Acorn RISCOS", 255: "unknown", };
function parseGzip(b: Uint8Array): FileVerdict {
  const flags = b[3];
  const mtime = u32le(b, 4);
  const details: Record<string, unknown> = {
    compressionMethod: b[2] === 8 ? "deflate (8)" : String(b[2]),
    flags: {
      ftext: (flags & 0x01) !== 0, fhcrc: (flags & 0x02) !== 0, fextra: (flags & 0x04) !== 0,
      fname: (flags & 0x08) !== 0, fcomment: (flags & 0x10) !== 0,
    },
    mtime: `${mtime} (${isoFromUnix(mtime)})`,
    extraFlags: b[8],
    os: `${GZIP_OS[b[9]] ?? "unknown"} (${b[9]})`,
  };
  let off = 10;
  if (flags & 0x04) {
    const xlen = u16le(b, off);
    off += 2 + xlen;
    details.extraFieldBytes = xlen;
  }
  if (flags & 0x08) {
    let end = off;
    while (end < b.length && b[end] !== 0) end++;
    details.originalFilename = asciiRaw(b, off, end - off);
    off = end + 1;
  }
  if (flags & 0x10) {
    let end = off;
    while (end < b.length && b[end] !== 0) end++;
    details.comment = asciiRaw(b, off, end - off);
    off = end + 1;
  }
  if (flags & 0x02) off += 2;
  details.headerSizeBytes = off;
  if (b.length >= 8) {
    details.crc32 = "0x" + u32le(b, b.length - 8).toString(16).padStart(8, "0");
    details.isizeUncompressedModulo2_32 = u32le(b, b.length - 4);
  }
  return {
    kind: "gzip archive",
    summary: `gzip${details.originalFilename ? ` of "${String(details.originalFilename)}"` : ""}, modified ${isoFromUnix(mtime)}, uncompressed size (mod 2^32) ${String(details.isizeUncompressedModulo2_32 ?? "?")}`,
    details,
  };
}

/* TAR */

function parseTAR(b: Uint8Array): FileVerdict {
  const entries: Array<{ name: string; size: number; type: string }> = [];
  let off = 0;
  let stopNote = "";
  while (off + 512 <= b.length && entries.length < 100) {
    let allZero = true;
    for (let i = off; i < off + 512; i++) if (b[i] !== 0) { allZero = false; break; }
    if (allZero) break;
    const name = ascii(b, off, 100);
    const prefix = hasAscii(b, off + 257, "ustar") ? ascii(b, off + 345, 155) : "";
    const sizeStr = asciiRaw(b, off + 124, 12).trim();
    const size = parseInt(sizeStr.replace(/\0.*$/, "").trim() || "0", 8);
    if (!name && !hasAscii(b, off + 257, "ustar")) { stopNote = "Stopped: block does not look like a tar header."; break; }
    const typeFlag = String.fromCharCode(b[off + 156]);
    entries.push({ name: prefix ? `${prefix}/${name}` : name, size: Number.isFinite(size) ? size : 0, type: typeFlag === "0" || typeFlag === "\0" ? "file" : typeFlag });
    if (!Number.isFinite(size)) { stopNote = "Stopped: unparseable entry size."; break; }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  const details: Record<string, unknown> = {
    entries: entries.length,
    entryList: entries,
    ustar: hasAscii(b, 257, "ustar"),
  };
  if (stopNote) details.note = stopNote;
  return {
    kind: "TAR archive",
    summary: `TAR with ${entries.length} entr${entries.length === 1 ? "y" : "ies"} (first 100 walked)${entries.length ? `: ${entries.slice(0, 4).map((e) => e.name).join(", ")}${entries.length > 4 ? ", …" : ""}` : ""}`,
    details,
  };
}

/* text / JSON / plist */

function parseBinaryPlist(b: Uint8Array): FileVerdict {
  const details: Record<string, unknown> = { header: "bplist00" };
  if (b.length >= 32) {
    const t = b.length - 32;
    details.offsetIntSize = b[t + 6];
    details.objectRefSize = b[t + 7];
    const readBE = (o: number, n: number): number => { let v = 0; for (let i = 0; i < n && o + i < b.length; i++) v = v * 256 + b[o + i]; return v; };
    details.objectCount = readBE(t + 8, 8);
    details.topObjectIndex = readBE(t + 16, 8);
    details.offsetTableOffset = readBE(t + 24, 8);
  }
  return {
    kind: "Binary property list (bplist00)",
    summary: `Apple binary plist, ${String(details.objectCount ?? "?")} object(s), offset table at ${String(details.offsetTableOffset ?? "?")}`,
    details,
  };
}

function looksTextual(b: Uint8Array): boolean {
  if (b.length === 0) return false;
  const sample = Math.min(b.length, 8192);
  let bad = 0;
  for (let i = 0; i < sample; i++) { const c = b[i]; if (c === 0) return false; if (c < 0x09 || (c > 0x0d && c < 0x20)) bad++; }
  return bad / sample < 0.02;
}

function parseText(b: Uint8Array): FileVerdict | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return null;
  }
  if (!looksTextual(b)) return null;
  const trimmed = text.trim();
  const lineCount = text.length === 0 ? 0 : text.split("\n").length;
  if (trimmed.includes("<plist") && (trimmed.startsWith("<?xml") || trimmed.startsWith("<plist"))) {
    return {
      kind: "XML property list",
      summary: `Apple XML plist, ${lineCount} line(s)`,
      details: { lines: lineCount, hasDoctype: trimmed.includes("<!DOCTYPE plist"), firstLine: trimmed.split("\n")[0].slice(0, 120) },
    };
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const value: unknown = JSON.parse(trimmed);
      const isArr = Array.isArray(value);
      const keys = !isArr && typeof value === "object" && value !== null ? Object.keys(value as Record<string, unknown>) : [];
      return {
        kind: "JSON",
        summary: isArr
          ? `Valid JSON array with ${(value as unknown[]).length} element(s)`
          : `Valid JSON object with ${keys.length} top-level key(s)${keys.length ? `: ${keys.slice(0, 8).join(", ")}` : ""}`,
        details: { valid: true, topLevelType: isArr ? "array" : typeof value, topLevelKeys: keys.slice(0, 32), lines: lineCount, chars: text.length },
      };
    } catch (err) {
      return {
        kind: "Text (JSON-like, invalid)",
        summary: `Looks like JSON but does not parse: ${err instanceof Error ? err.message : String(err)}`,
        details: { valid: false, lines: lineCount, chars: text.length },
      };
    }
  }
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<svg")) {
    return {
      kind: trimmed.startsWith("<svg") ? "SVG image (XML text)" : "XML document",
      summary: `${trimmed.startsWith("<svg") ? "SVG" : "XML"} text document, ${lineCount} line(s)`,
      details: { lines: lineCount, chars: text.length },
    };
  }
  if (trimmed.startsWith("#!")) {
    return {
      kind: "Script (shebang)",
      summary: `Script starting ${trimmed.split("\n")[0].slice(0, 80)}, ${lineCount} line(s)`,
      details: { lines: lineCount, chars: text.length, interpreter: trimmed.split("\n")[0] },
    };
  }
  return {
    kind: "Plain text",
    summary: `Plain text, ${lineCount} line(s), ${text.length} character(s)`,
    details: { lines: lineCount, chars: text.length, entropyBitsPerByte: entropy(b) },
  };
}

/* dispatcher */

export function identifyFile(bytes: Uint8Array, name: string): FileVerdict {
  try {
    if (bytes.length === 0) {
      return { kind: "Empty file", summary: "0 bytes — nothing to identify", details: { size: 0 } };
    }
    if (hasAscii(bytes, 0, "bplist00")) return parseBinaryPlist(bytes);
    if (hasPrefix(bytes, [0x7f, 0x45, 0x4c, 0x46])) return parseELF(bytes);
    if (hasPrefix(bytes, [0x4d, 0x5a])) return parsePE(bytes);
    if (
      hasPrefix(bytes, [0xfe, 0xed, 0xfa, 0xce]) || hasPrefix(bytes, [0xfe, 0xed, 0xfa, 0xcf]) ||
      hasPrefix(bytes, [0xce, 0xfa, 0xed, 0xfe]) || hasPrefix(bytes, [0xcf, 0xfa, 0xed, 0xfe]) ||
      hasPrefix(bytes, [0xca, 0xfe, 0xba, 0xbe]) || hasPrefix(bytes, [0xca, 0xfe, 0xba, 0xbf]) ||
      hasPrefix(bytes, [0xbe, 0xba, 0xfe, 0xca])
    ) return parseMachO(bytes);
    if (hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) || hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06]) || hasPrefix(bytes, [0x50, 0x4b, 0x07, 0x08])) {
      return parseZIP(bytes, name);
    }
    if (hasAscii(bytes, 0, "%PDF-")) return parsePDF(bytes);
    if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return parsePNG(bytes);
    if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return parseJPEG(bytes);
    if (hasAscii(bytes, 0, "GIF87a") || hasAscii(bytes, 0, "GIF89a")) return parseGIF(bytes);
    if (hasPrefix(bytes, [0x00, 0x61, 0x73, 0x6d])) return parseWasm(bytes);
    if (hasAscii(bytes, 0, "SQLite format 3\0")) return parseSQLite(bytes);
    if (hasPrefix(bytes, [0x1f, 0x8b])) return parseGzip(bytes);
    if (bytes.length > 512 && hasAscii(bytes, 257, "ustar")) return parseTAR(bytes);
    const textVerdict = parseText(bytes);
    if (textVerdict) return textVerdict;
    // Last resort for extension-less ustar-less tars with plausible first header.
    if (bytes.length >= 512 && parseInt(asciiRaw(bytes, 124, 12).trim() || "x", 8) >= 0 && ascii(bytes, 0, 100).length >= 1 && bytes[156] >= 0x30 && bytes[156] <= 0x37) {
      const tar = parseTAR(bytes);
      if (tar.details.entries as number > 0) return tar;
    }
    const e = entropy(bytes);
    const first16 = Array.from(bytes.subarray(0, 16)).map((x) => x.toString(16).padStart(2, "0")).join(" ");
    return {
      kind: "Unknown binary data",
      summary: `No recognised signature. ${bytes.length} byte(s), entropy ${e} bits/byte${e > 7.5 ? " — very high: likely compressed or encrypted content" : e > 6 ? " — high: likely compressed/encoded content" : ""}. First bytes: ${first16}`,
      details: { size: bytes.length, entropyBitsPerByte: e, firstBytesHex: first16 },
    };
  } catch (err) {
    return {
      kind: "Unparseable file",
      summary: `Identification failed partway: ${err instanceof Error ? err.message : String(err)}`,
      details: { size: bytes.length, parseNote: "Parser hit malformed/truncated data and refused to guess further." },
    };
  }
}
