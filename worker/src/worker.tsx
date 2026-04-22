import { env as runtimeEnv } from "cloudflare:workers";
import { route, render } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { DashboardPage } from "./app/pages/dashboard";
import { Document } from "./app/document";
import { loadConfig, configFromFormData, saveConfig } from "./lib/config";
import { archiveMessage, maybeAutoReply, maybeForwardMessage, repoNameForMessage } from "./lib/email";
import type { DashboardModel, WorkerEnv } from "./lib/types";

const workerEnv = runtimeEnv as WorkerEnv;

const app = defineApp([
  render(Document, [
    route("/", async ({ request }) => {
      const { config, repoExists } = await loadConfig(workerEnv);
      return <DashboardPage model={dashboardModel(request, config, repoExists)} />;
    }),
    route("/config", {
      get: async () => {
        const { config, repoExists } = await loadConfig(workerEnv);
        return Response.json({
          config,
          configRepoExists: repoExists,
          archivePreviewRepo: repoNameForMessage(config, config.journalAddress, new Date().toISOString()),
        });
      },
      post: async ({ request }) => {
        const formData = await request.formData();
        const config = await configFromFormData(workerEnv, formData);
        await saveConfig(workerEnv, config);

        const url = new URL(request.url);
        url.pathname = "/";
        url.searchParams.set("saved", "1");
        return Response.redirect(url.toString(), 303);
      },
    }),
  ]),
]);

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env as unknown as Parameters<typeof app.fetch>[1], ctx);
  },
  async email(message: ForwardableEmailMessage, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    const { config } = await loadConfig(env);

    const archive = await archiveMessage(env, config, message);

    ctx.waitUntil(Promise.resolve(console.log("archived", archive.repoName, archive.entryPath)));

    await maybeForwardMessage(config, message);
    await maybeAutoReply(env, config, message);
  },
} satisfies ExportedHandler<WorkerEnv>;

function dashboardModel(
  request: Request,
  config: DashboardModel["config"],
  repoExists: boolean,
): DashboardModel {
  const url = new URL(request.url);
  const saveState = url.searchParams.get("saved") == "1" ? "saved" : "idle";

  return {
    config,
    configRepoExists: repoExists,
    archivePreviewRepo: repoNameForMessage(config, config.journalAddress, new Date().toISOString()),
    saveState,
  };
}
