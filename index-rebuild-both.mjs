import { CodeBuildClient, StartBuildCommand, BatchGetBuildsCommand, ListBuildsForProjectCommand } from "@aws-sdk/client-codebuild";

const PROJECTS = ["silnik-elektryczny-pl", "silniki-trojfazowe-pl"];
const REGION = "eu-north-1";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const cb = new CodeBuildClient({ region: REGION });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Secret",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || "GET";
  if (method === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  if (WEBHOOK_SECRET) {
    const headerSecret = event.headers?.["x-webhook-secret"] || event.headers?.["X-Webhook-Secret"] || "";
    if (headerSecret !== WEBHOOK_SECRET) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ success: false, error: "Invalid secret" }) };
    }
  }

  const source = event.source === "aws.events" ? "cron" : "webhook";
  let reason = `Triggered by ${source}`;
  if (method === "POST" && event.body) {
    try {
      const body = JSON.parse(event.body);
      if (body.reason) reason = body.reason;
      if (body.productSlug) reason += ` (product: ${body.productSlug})`;
    } catch {}
  }

  const results = [];

  for (const project of PROJECTS) {
    try {
      const listRes = await cb.send(new ListBuildsForProjectCommand({ projectName: project, sortOrder: "DESCENDING" }));
      if (listRes.ids?.length > 0) {
        const buildRes = await cb.send(new BatchGetBuildsCommand({ ids: [listRes.ids[0]] }));
        const latest = buildRes.builds?.[0];
        if (latest && ["IN_PROGRESS", "QUEUED"].includes(latest.buildStatus)) {
          results.push({ project, status: "skipped", reason: "build already " + latest.buildStatus });
          continue;
        }
      }

      const startRes = await cb.send(new StartBuildCommand({
        projectName: project,
        environmentVariablesOverride: [{ name: "BUILD_REASON", value: reason, type: "PLAINTEXT" }],
      }));
      results.push({ project, status: "started", buildId: startRes.build?.id, reason });
    } catch (err) {
      results.push({ project, status: "error", error: err.message });
    }
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, results }) };
};
