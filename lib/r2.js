const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

async function readBufferFromR2(key) {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });
  const response = await r2Client.send(command);
  const byteArray = await response.Body.transformToByteArray();
  return Buffer.from(byteArray);
}

async function readStringFromR2(key) {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });
  const response = await r2Client.send(command);
  return await response.Body.transformToString();
}

async function readJsonFromR2(key) {
  const body = await readStringFromR2(key);
  return JSON.parse(body);
}

async function uploadToR2(key, body, contentType) {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  return await r2Client.send(command);
}

async function listFromR2(prefix) {
  const items = [];
  let token;
  const publicBase =
    process.env.R2_PUBLIC_URL ||
    `https://${process.env.R2_BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  do {
    const command = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: token,
    });
    const response = await r2Client.send(command).catch((err) => {
      console.error("R2 list error:", err);
      return { Contents: [] };
    });
    if (response.Contents) {
      for (const obj of response.Contents) {
        items.push({
          pathname: obj.Key,
          url: `${publicBase}/${obj.Key}`,
          uploadedAt: obj.LastModified,
          size: obj.Size || 0,
        });
      }
    }
    token = response.IsTruncated ? response.NextContinuationToken : null;
  } while (token);
  return items;
}

async function deleteFromR2(keys) {
  if (!keys || !keys.length) return;
  const Objects = keys.map((k) => ({ Key: k.replace(/^https?:\/\/[^/]+\//, "") }));
  const command = new DeleteObjectsCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Delete: { Objects },
  });
  return await r2Client.send(command);
}

module.exports = {
  r2Client,
  readBufferFromR2,
  readStringFromR2,
  readJsonFromR2,
  uploadToR2,
  listFromR2,
  deleteFromR2,
};
