import { route, render } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { DashboardPage } from "./app/pages/dashboard";
import { Document } from "./app/document";
import { loadConfig, configFromFormData, saveConfig } from "./lib/config";
import { archiveMessage, maybeAutoReply, maybeForwardMessage, repoNameForMessage } from "./lib/email";
import type { DashboardModel, Env } from "./lib/types";

const app = defineApp([
  render(Document, [
    route("/", async ({ request, env }) => {
      const { config, repoExists } = await loadConfig(env as Env);
      return <DashboardPage model={dashboardModel(request, config, repoExists)} />;
    }),
    route("/config", {
      GET: async ({ request, env }) => {
        const { config, repoExists } = await loadConfig(env as Env);
        return Response.json({
          config,
          configRepoExists: repoExists,
          archivePreviewRepo: repoNameForMessage(config, config.journalAddress, new Date().toISOString()),
        });
      },
      POST: async ({ request, env }) => {
        const formData = await request.formData();
        const config = await configFromFormData(env as Env, formData);
        await saveConfig(env as Env, config);

        const url = new URL(request.url);
        url.pathname = "/";
        url.searchParams.set("saved", "1");
        return Response.redirect(url.toString(), 303);
      },
    }),
  ]),
]);

export default {
  fetch: app.fetch,
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const { config } = await loadConfig(env);

    const archive = await archiveMessage(env, config, message);

    ctx.waitUntil(Promise.resolve(console.log("archived", archive.repoName, archive.entryPath)));

    await maybeForwardMessage(config, message);
    await maybeAutoReply(env, config, message);
  },
} satisfies ExportedHandler<Env>;

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
