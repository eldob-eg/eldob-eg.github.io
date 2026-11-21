#!/usr/bin/env node
// Lapland gift page (lapland/): its words and photos live encrypted in lapland/vault/,
// locked with the date she types on the first screen. Nothing personal is ever stored in plain text in the repo.
//
//   node tools/lapland-vault.mjs pack   <privateDir>   privateDir holds content.json + photos/
//   node tools/lapland-vault.mjs unpack <outDir>       gets content.json + photos/ back from the vault
//
// Password = the date's digits, day-month-year: 11102026. Override with LAPLAND_PASS.
// Files are stored as base64 text (.txt) so any static host, claude.ai artifacts included, can serve them.
// Photos are turned upright, shrunk to 1600px and stripped of EXIF (location, phone model) before encrypting.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomBytes, webcrypto } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { subtle } = webcrypto;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = path.join(ROOT, "lapland", "vault");
const PASS = process.env.LAPLAND_PASS || "11102026";
const ITER = 250000;
const MAGIC = Buffer.from("LAP1");

async function deriveKey(salt) {
  const base = await subtle.importKey("raw", new TextEncoder().encode(PASS), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function seal(key, bytes) {
  const iv = randomBytes(12);
  return Buffer.concat([iv, Buffer.from(await subtle.encrypt({ name: "AES-GCM", iv }, key, bytes))]);
}
async function open(key, buf) {
  return Buffer.from(await subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, key, buf.subarray(12)));
}

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/jpeg", ".webp": "image/jpeg", ".heic": "image/jpeg",
  ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/mp4" };

async function loadMedia(file) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext];
  if (!type) throw new Error(`unsupported file: ${file}`);
  if (type === "image/jpeg") {
    const bytes = execFileSync("convert", [file, "-auto-orient", "-resize", "1600x1600>", "-strip", "-quality", "82", "jpg:-"], { maxBuffer: 1 << 28 });
    return { bytes, type, ext: ".jpg" };
  }
  return { bytes: await readFile(file), type, ext };
}

async function pack(dir) {
  const content = JSON.parse(await readFile(path.join(dir, "content.json"), "utf8"));
  const salt = randomBytes(16);
  const key = await deriveKey(salt);
  await rm(VAULT, { recursive: true, force: true });
  await mkdir(VAULT, { recursive: true });
  let n = 0;
  const packList = async list => {
    const photos = [];
    for (const p of list || []) {
      const m = await loadMedia(path.join(dir, "photos", p.file));
      const src = randomBytes(6).toString("hex") + ".txt";
      await writeFile(path.join(VAULT, src), (await seal(key, m.bytes)).toString("base64"));
      const name = String(++n).padStart(2, "0") + "-" + path.basename(p.file, path.extname(p.file)) + m.ext;
      photos.push({ src, type: m.type, caption: p.caption || "", name, ...(p.pos ? { pos: p.pos } : {}) });
      console.log(`  photo ${p.file} -> ${src} (${Math.round(m.bytes.length / 1024)} KB)`);
    }
    return photos;
  };
  const photos = await packList(content.photos);
  const timo = content.timo ? { ...content.timo, photos: await packList(content.timo.photos) } : undefined;
  const head = Buffer.alloc(8);
  MAGIC.copy(head);
  head.writeUInt32BE(ITER, 4);
  const body = await seal(key, Buffer.from(JSON.stringify({ ...content, photos, ...(timo ? { timo } : {}) })));
  await writeFile(path.join(VAULT, "content.txt"), Buffer.concat([head, salt, body]).toString("base64"));
  console.log(`vault ready: ${n} photo(s) in lapland/vault/`);
}

async function unpack(out) {
  const read = async f => Buffer.from(await readFile(path.join(VAULT, f), "utf8"), "base64");
  const buf = await read("content.txt");
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error("not a Lapland vault");
  const key = await deriveKey(buf.subarray(8, 24));
  const data = JSON.parse((await open(key, buf.subarray(24))).toString("utf8"));
  await mkdir(path.join(out, "photos"), { recursive: true });
  const unpackList = async list => {
    for (const p of list) await writeFile(path.join(out, "photos", p.name), await open(key, await read(p.src)));
    return list.map(p => ({ file: p.name, caption: p.caption, ...(p.pos ? { pos: p.pos } : {}) }));
  };
  data.photos = await unpackList(data.photos);
  if (data.timo) data.timo.photos = await unpackList(data.timo.photos);
  await writeFile(path.join(out, "content.json"), JSON.stringify(data, null, 2) + "\n");
  console.log(`unpacked to ${out}`);
}

const [cmd, dir] = process.argv.slice(2);
if (cmd === "pack" && dir) await pack(path.resolve(dir));
else if (cmd === "unpack" && dir) await unpack(path.resolve(dir));
else { console.log("usage: node tools/lapland-vault.mjs pack|unpack <dir>"); process.exit(1); }
