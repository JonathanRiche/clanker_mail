import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { Volume, createFsFromVolume } from "memfs";

import type { Env } from "./types";

const REPO_DIR = "/repo";

interface RepoAccess {
  remote: string;
  token: string;
  created: boolean;
}

export async function readJsonFileFromRepo(
  env: Env,
  repoName: string,
  filePath: string,
): Promise<unknown | null> {
  const access = await getRepoAccess(env, repoName, "read");
  if (!access) {
    return null;
  }

  const checkout = await openRepoCheckout(access);
  try {
    const raw = await checkout.fs.promises.readFile(joinRepoPath(filePath), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeJsonFileToRepo(
  env: Env,
  repoName: string,
  filePath: string,
  value: unknown,
  commitMessage: string,
): Promise<void> {
  await writeFilesToRepo(env, repoName, [
    {
      path: filePath,
      contents: JSON.stringify(value, null, 2) + "\n",
    },
  ], commitMessage);
}

export async function writeFilesToRepo(
  env: Env,
  repoName: string,
  files: Array<{ path: string; contents: string }>,
  commitMessage: string,
): Promise<void> {
  const access = await getRepoAccess(env, repoName, "write");
  if (!access) {
    throw new Error(`Unable to access Artifacts repo '${repoName}'`);
  }

  const checkout = await openRepoCheckout(access);
  const trackedFiles: string[] = [];

  for (const file of files) {
    const target = joinRepoPath(file.path);
    await checkout.fs.promises.mkdir(dirname(target), { recursive: true });
    await checkout.fs.promises.writeFile(target, file.contents, "utf8");
    trackedFiles.push(trimRepoPath(target));
  }

  for (const path of trackedFiles) {
    await git.add({
      fs: checkout.fs,
      dir: REPO_DIR,
      filepath: path,
    });
  }

  await git.commit({
    fs: checkout.fs,
    dir: REPO_DIR,
    author: {
      name: "clanker_mail worker",
      email: "agents@clanker-mail.local",
    },
    message: commitMessage,
  });

  await git.push({
    fs: checkout.fs,
    http,
    dir: REPO_DIR,
    remote: "origin",
    ref: "main",
    onAuth: () => ({
      username: "x",
      password: tokenSecret(access.token),
    }),
  });
}

async function getRepoAccess(
  env: Env,
  repoName: string,
  scope: "read" | "write",
): Promise<RepoAccess | null> {
  const repo = await env.ARTIFACTS.get(repoName);
  if (!repo) {
    if (scope == "read") {
      return null;
    }

    const created = await env.ARTIFACTS.create(repoName, {
      description: `clanker_mail managed repo '${repoName}'`,
      readOnly: false,
      setDefaultBranch: "main",
    });

    return {
      remote: created.remote,
      token: created.token,
      created: true,
    };
  }

  const info = await repo.info();
  if (!info) {
    return null;
  }

  const token = await repo.createToken(scope, 900);
  return {
    remote: info.remote,
    token: token.plaintext,
    created: false,
  };
}

async function openRepoCheckout(access: RepoAccess) {
  const fs = createFsFromVolume(new Volume());
  await fs.promises.mkdir(REPO_DIR, { recursive: true });

  try {
    await git.clone({
      fs,
      http,
      dir: REPO_DIR,
      url: access.remote,
      ref: "main",
      singleBranch: true,
      depth: 1,
      onAuth: () => ({
        username: "x",
        password: tokenSecret(access.token),
      }),
    });
  } catch {
    if (!access.created) {
      await git.init({
        fs,
        dir: REPO_DIR,
        defaultBranch: "main",
      });

      await git.addRemote({
        fs,
        dir: REPO_DIR,
        remote: "origin",
        url: access.remote,
      }).catch(() => {});
    } else {
      await git.init({
        fs,
        dir: REPO_DIR,
        defaultBranch: "main",
      });
      await git.addRemote({
        fs,
        dir: REPO_DIR,
        remote: "origin",
        url: access.remote,
      });
    }
  }

  return { fs };
}

function tokenSecret(token: string): string {
  return token.split("?expires=")[0];
}

function joinRepoPath(filePath: string): string {
  const normalized = filePath.replace(/^\/+/, "");
  return `${REPO_DIR}/${normalized}`;
}

function trimRepoPath(filePath: string): string {
  return filePath.replace(`${REPO_DIR}/`, "");
}

function dirname(filePath: string): string {
  const index = filePath.lastIndexOf("/");
  if (index <= 0) {
    return REPO_DIR;
  }
  return filePath.slice(0, index);
}
