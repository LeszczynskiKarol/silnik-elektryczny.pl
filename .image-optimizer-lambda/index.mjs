import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const s3 = new S3Client({});

const SOURCE_EXT_RE = /\.(jpe?g|png|webp)$/i;
const VARIANT_RE = /-(600|1200)w\.webp$/i;

const RESIZE_VARIANTS = [
  { width: 600,  suffix: "-600w.webp",  quality: 78 },
  { width: 1200, suffix: "-1200w.webp", quality: 80 }
];
const FULL_VARIANT = { width: null, suffix: ".webp", quality: 82 };

async function exists(Bucket, Key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket, Key }));
    return true;
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return false;
    throw e;
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export const handler = async (event) => {
  const records = event.Records || [{ s3: { bucket: { name: event.bucket }, object: { key: event.key } } }];

  for (const rec of records) {
    const Bucket = rec.s3.bucket.name;
    const Key = decodeURIComponent((rec.s3.object.key || "").replace(/\+/g, " "));

    if (!Key || !SOURCE_EXT_RE.test(Key)) {
      console.log(`SKIP non-source: ${Key}`);
      continue;
    }
    if (VARIANT_RE.test(Key)) {
      console.log(`SKIP variant: ${Key}`);
      continue;
    }

    console.log(`PROCESS ${Bucket}/${Key}`);

    const baseKey = Key.replace(SOURCE_EXT_RE, "");
    const isWebpSource = /\.webp$/i.test(Key);
    const obj = await s3.send(new GetObjectCommand({ Bucket, Key }));
    const srcBuf = await streamToBuffer(obj.Body);
    const meta = await sharp(srcBuf).metadata();
    const srcWidth = meta.width || 0;

    // For non-webp sources also produce a full-size .webp transcode.
    // For webp sources, only produce sized variants (skip overwriting the source itself).
    const variants = isWebpSource ? RESIZE_VARIANTS : [...RESIZE_VARIANTS, FULL_VARIANT];

    for (const v of variants) {
      const outKey = `${baseKey}${v.suffix}`;
      if (v.width && srcWidth <= v.width) {
        console.log(`SKIP ${outKey}: source ${srcWidth}px <= ${v.width}px`);
        continue;
      }
      if (await exists(Bucket, outKey)) {
        console.log(`SKIP ${outKey}: already exists`);
        continue;
      }
      const pipeline = sharp(srcBuf, { failOn: "none" }).rotate();
      if (v.width) pipeline.resize({ width: v.width, withoutEnlargement: true });
      const outBuf = await pipeline.webp({ quality: v.quality, effort: 5 }).toBuffer();
      await s3.send(new PutObjectCommand({
        Bucket,
        Key: outKey,
        Body: outBuf,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: { "source-key": Key, "source-width": String(srcWidth) }
      }));
      console.log(`WROTE ${outKey} (${outBuf.length} bytes)`);
    }
  }

  return { statusCode: 200, processed: records.length };
};
