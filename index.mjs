/**
 * rebuild-trigger/index.mjs
 * 
 * Lambda wywoływana przez:
 * - Webhook z backendu Stojan (POST /rebuild)
 * - EventBridge cron (co 30 min)
 * 
 * Debounce: jeśli build już trwa, nie startuje nowego.
 */

import { CodeBuildClient, StartBuildCommand, BatchGetBuildsCommand, ListBuildsForProjectCommand } from "@aws-sdk/client-codebuild";

const PROJECT_NAME = "silnik-elektryczny-pl";
const REGION = "eu-north-1";

// Opcjonalny secret do zabezpieczenia webhooka
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

  // Weryfikacja secret (jeśli ustawiony)
  if (WEBHOOK_SECRET) {
    const headerSecret =
      event.headers?.["x-webhook-secret"] ||
      event.headers?.["X-Webhook-Secret"] || "";
    if (headerSecret !== WEBHOOK_SECRET) {
      return {
        statusCode: 403,
        headers: CORS,
        body: JSON.stringify({ success: false, error: "Invalid secret" }),
      };
    }
  }

  try {
    // Sprawdź czy build już trwa (debounce)
    const listRes = await cb.send(
      new ListBuildsForProjectCommand({
        projectName: PROJECT_NAME,
        sortOrder: "DESCENDING",
      })
    );

    if (listRes.ids?.length > 0) {
      const latestId = listRes.ids[0];
      const buildRes = await cb.send(
        new BatchGetBuildsCommand({ ids: [latestId] })
      );
      const latest = buildRes.builds?.[0];
      if (latest && ["IN_PROGRESS", "QUEUED"].includes(latest.buildStatus)) {
        return {
          statusCode: 200,
          headers: CORS,
          body: JSON.stringify({
            success: true,
            message: "Build already in progress",
            buildId: latestId,
            status: latest.buildStatus,
          }),
        };
      }
    }

    // Startuj nowy build
    const source = event.source === "aws.events" ? "cron" : "webhook";
    let reason = `Triggered by ${source}`;

    // Jeśli webhook — loguj co się zmieniło
    if (method === "POST" && event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.reason) reason = body.reason;
        if (body.productSlug) reason += ` (product: ${body.productSlug})`;
      } catch {}
    }

    const startRes = await cb.send(
      new StartBuildCommand({
        projectName: PROJECT_NAME,
        environmentVariablesOverride: [
          { name: "BUILD_REASON", value: reason, type: "PLAINTEXT" },
        ],
      })
    );

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        success: true,
        message: "Build started",
        buildId: startRes.build?.id,
        reason,
      }),
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
