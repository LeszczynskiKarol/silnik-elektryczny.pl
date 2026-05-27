import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const BUCKET = "piszemy.com.pl";
const PREFIX = "products/";
const FN = "piszemy-image-optimizer";
const REGION = "eu-north-1";
const CONCURRENCY = 8;

const s3 = new S3Client({ region: REGION });
const lambda = new LambdaClient({ region: REGION });

const SOURCE_RE = /\.(jpe?g|png|webp)$/i;
const VARIANT_RE = /-(600|1200)w\.webp$/i;

async function listAll() {
  const keys = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: token
    }));
    for (const o of r.Contents || []) {
      if (SOURCE_RE.test(o.Key) && !VARIANT_RE.test(o.Key)) keys.push(o.Key);
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function invoke(key) {
  const payload = JSON.stringify({
    Records: [{ s3: { bucket: { name: BUCKET }, object: { key } } }]
  });
  const r = await lambda.send(new InvokeCommand({
    FunctionName: FN,
    InvocationType: "RequestResponse",
    Payload: Buffer.from(payload)
  }));
  if (r.FunctionError) {
    const body = r.Payload ? Buffer.from(r.Payload).toString() : "(no payload)";
    throw new Error(`${r.FunctionError}: ${body}`);
  }
  return JSON.parse(Buffer.from(r.Payload).toString());
}

(async () => {
  const start = Date.now();
  const keys = await listAll();
  console.log(`To process: ${keys.length} source images`);

  let done = 0, err = 0;
  async function worker(slice) {
    for (const k of slice) {
      try {
        await invoke(k);
        done++;
      } catch (e) {
        err++;
        console.error(`FAIL ${k}: ${e.message}`);
      }
      if ((done + err) % 25 === 0) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`  progress ${done + err}/${keys.length} (ok=${done} err=${err}) ${elapsed}s`);
      }
    }
  }

  const slices = Array.from({ length: CONCURRENCY }, (_, i) =>
    keys.filter((_k, j) => j % CONCURRENCY === i)
  );
  await Promise.all(slices.map(worker));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`DONE total=${keys.length} ok=${done} err=${err} in ${elapsed}s`);
})();
