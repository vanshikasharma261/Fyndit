import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { products } from './seed-data/products.data';
import { imageSources } from './seed-data/image-sources.data';
import { IMAGES_PER_VARIANT } from './seed-data/constants';

/** Maximum number of concurrent image downloads. */
const DOWNLOAD_CONCURRENCY = 6;

/**
 * Downloads product images from `image-sources.data.ts` into
 * `backend/assets/products/<slug>/<color>/{1..N}.jpg`.
 *
 * Data-driven: it walks `products.data.ts`, so adding a product needs no change
 * here (only its source URLs in `image-sources.data.ts`). It always writes
 * exactly {@link IMAGES_PER_VARIANT} files per (product, color), padding by
 * reusing successfully downloaded images when fewer than N URLs are available
 * or some fail. The seed persists the matching relative paths.
 *
 * Re-runnable: a (product, color) whose N files already exist is skipped unless
 * `--force` is passed.
 */

const FORCE = process.argv.includes('--force');

// Scripts are always run from the backend root via npm (`npm run seed:assets`).
const assetsRoot = join(process.cwd(), 'assets', 'products');

const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
};

interface ColorTask {
  slug: string;
  color: string;
  urls: string[];
}

async function downloadBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.warn(`  ! ${response.status} ${response.statusText} - ${url}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  ! failed (${message}) - ${url}`);
    return null;
  }
}

function colorAlreadyDownloaded(dir: string): boolean {
  for (let i = 1; i <= IMAGES_PER_VARIANT; i += 1) {
    if (!existsSync(join(dir, `${i}.jpg`))) return false;
  }
  return true;
}

async function processColor(task: ColorTask): Promise<{
  written: number;
  missing: boolean;
}> {
  const dir = join(assetsRoot, task.slug, task.color);

  if (!FORCE && colorAlreadyDownloaded(dir)) {
    return { written: 0, missing: false };
  }

  // Download each provided URL (in order); keep the successful buffers.
  const downloaded: Buffer[] = [];
  for (const url of task.urls) {
    const buffer = await downloadBuffer(url);
    if (buffer) downloaded.push(buffer);
  }

  if (downloaded.length === 0) {
    console.warn(`  x ${task.slug}/${task.color}: no images downloaded`);
    return { written: 0, missing: true };
  }

  mkdirSync(dir, { recursive: true });
  let written = 0;
  for (let i = 0; i < IMAGES_PER_VARIANT; i += 1) {
    // Use the matching image when available, else pad by cycling.
    const buffer = downloaded[i] ?? downloaded[i % downloaded.length];
    writeFileSync(join(dir, `${i + 1}.jpg`), buffer);
    written += 1;
  }
  console.log(`  + ${task.slug}/${task.color}: ${written} image(s)`);
  return { written, missing: false };
}

/** Run tasks with a bounded concurrency pool. */
async function runPool(
  tasks: ColorTask[],
  limit: number,
): Promise<{ written: number; missing: number }> {
  let index = 0;
  let written = 0;
  let missing = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const task = tasks[index];
      index += 1;
      const result = await processColor(task);
      written += result.written;
      if (result.missing) missing += 1;
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return { written, missing };
}

async function main(): Promise<void> {
  const tasks: ColorTask[] = [];
  for (const product of products) {
    for (const color of product.colors) {
      const urls = imageSources[product.slug]?.[color] ?? [];
      if (urls.length === 0) {
        console.warn(`  x ${product.slug}/${color}: no source URLs configured`);
        continue;
      }
      tasks.push({ slug: product.slug, color, urls });
    }
  }

  console.log(
    `Downloading product images (${tasks.length} product/color groups)...`,
  );
  const { written, missing } = await runPool(tasks, DOWNLOAD_CONCURRENCY);
  console.log(`Done. Wrote ${written} file(s); ${missing} group(s) incomplete.`);

  if (missing > 0) {
    console.warn(
      'Some images could not be downloaded. Re-run `npm run seed:assets` (optionally with --force) or update image-sources.data.ts.',
    );
  }
}

void main();
