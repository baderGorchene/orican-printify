#!/usr/bin/env node
/**
 * Migrates all files from Vercel Blob to Cloudflare R2.
 * 
 * Safe & Non-Destructive:
 * - Only READS from Vercel Blob (never deletes).
 * - Copies exact paths (models/, config/, theme/, logs/, designs/).
 * - Supports --skip-existing to resume interrupted runs.
 * - Supports --dry-run to preview what will be copied.
 * 
 * Usage:
 *   node scripts/migrate-blob-to-r2.js
 * 
 * Required Environment Variables (can be set in terminal or .env.local):
 *   BLOB_READ_WRITE_TOKEN
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 */

const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
const accountId = process.env.R2_ACCOUNT_ID || "0c05ca5c6cf7618457d75e7468486992";
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || "orican-storage";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const skipExisting = !args.includes("--overwrite");

if (!blobToken) {
  console.error("\x1b[31mError: BLOB_READ_WRITE_TOKEN environment variable is required.\x1b[0m");
  console.error("You can find it in your Vercel Project Settings > Environment Variables or Storage tab.");
  console.error("\nExample command to run:");
  console.error('  $env:BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."; node scripts/migrate-blob-to-r2.js\n');
  process.exit(1);
}

if (!accessKeyId || !secretAccessKey) {
  console.error("\x1b[31mError: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required.\x1b[0m");
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

async function listAllVercelBlobs() {
  console.log("Listing files from Vercel Blob...");
  const allBlobs = [];
  let cursor = null;

  do {
    const url = new URL("https://blob.vercel-storage.com");
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${blobToken}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to list blobs from Vercel (HTTP ${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    if (Array.isArray(data.blobs)) {
      allBlobs.push(...data.blobs);
    }
    cursor = data.hasMore ? data.cursor : null;
  } while (cursor);

  return allBlobs;
}

async function existsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return true;
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    return false;
  }
}

async function migrate() {
  console.log("==========================================");
  console.log(" Vercel Blob -> Cloudflare R2 Migration");
  console.log("==========================================");
  console.log(`Target Bucket: ${bucketName}`);
  console.log(`Account ID:    ${accountId}`);
  console.log(`Mode:          ${isDryRun ? "DRY RUN (no files will be written)" : "LIVE MIGRATION"}`);
  console.log(`Policy:        ${skipExisting ? "Skip existing files" : "Overwrite all files"}\n`);

  const blobs = await listAllVercelBlobs();
  console.log(`Found ${blobs.length} file(s) in Vercel Blob.\n`);

  if (!blobs.length) {
    console.log("No files to migrate.");
    return;
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let totalBytes = 0;

  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const key = b.pathname;
    const sizeMb = ((b.size || 0) / (1024 * 1024)).toFixed(2);
    const progress = `[${i + 1}/${blobs.length}]`;

    if (skipExisting && !isDryRun) {
      const alreadyThere = await existsInR2(key);
      if (alreadyThere) {
        console.log(`${progress} \x1b[33mSKIP (exists)\x1b[0m ${key}`);
        skipped++;
        continue;
      }
    }

    if (isDryRun) {
      console.log(`${progress} \x1b[36mPLAN\x1b[0m ${key} (${sizeMb} MB, ${b.contentType || "binary"})`);
      migrated++;
      totalBytes += b.size || 0;
      continue;
    }

    try {
      const fileUrl = b.downloadUrl || b.url;
      const downloadRes = await fetch(fileUrl);
      if (!downloadRes.ok) {
        throw new Error(`Download failed with status ${downloadRes.status}`);
      }
      const buffer = Buffer.from(await downloadRes.arrayBuffer());

      await r2.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: buffer,
          ContentType: b.contentType || "application/octet-stream",
        })
      );

      console.log(`${progress} \x1b[32mOK\x1b[0m ${key} (${sizeMb} MB)`);
      migrated++;
      totalBytes += buffer.length;
    } catch (err) {
      console.error(`${progress} \x1b[31mFAIL\x1b[0m ${key}: ${err.message}`);
      failed++;
    }
  }

  console.log("\n==========================================");
  console.log(" Migration Summary");
  console.log("==========================================");
  console.log(`Total files inspected: ${blobs.length}`);
  console.log(`Successfully copied:   ${migrated} (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`Skipped (existing):    ${skipped}`);
  console.log(`Failed:                ${failed}`);
  console.log("\nAll original data in Vercel Blob remains untouched.");
}

migrate().catch((err) => {
  console.error("\x1b[31mFatal error:\x1b[0m", err);
  process.exit(1);
});
