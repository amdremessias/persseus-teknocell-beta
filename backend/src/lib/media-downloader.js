import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads';
const TIMEOUT_MS = 15_000;

function extractExt(url, hint) {
  // tenta pegar extensão da URL ou do hint
  const fromHint = hint ? path.extname(hint) : '';
  if (fromHint) return fromHint.toLowerCase();
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    return ext ? ext.toLowerCase() : '';
  } catch {
    return '';
  }
}

function buildFilename(url, filenameHint) {
  try {
    const pathname = new URL(url).pathname;
    const base = path.basename(pathname);
    // usa o nome original se tiver extensão reconhecível
    if (base && path.extname(base)) return base;
  } catch {
    // ignore
  }
  const ext = extractExt(url, filenameHint) || '.bin';
  return `${Date.now()}${ext}`;
}

export async function downloadMedia(url, filenameHint = null) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      console.warn(`[media-download] HTTP ${response.status} ao baixar ${url}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = buildFilename(url, filenameHint);

    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(path.join(UPLOADS_DIR, filename), buffer);

    console.log(`[media-download] salvo: ${filename} (${buffer.length} bytes)`);
    return `/api/uploads/${filename}`;
  } catch (err) {
    console.warn(`[media-download] falha ao baixar ${url}: ${err.message}`);
    return null;
  }
}
