import type { WorkerEnv } from "../types";

import {
  readConfigDocument,
  writeArchivedMessage,
  writeConfigDocument,
} from "./d1";

export { readConfigDocument, writeConfigDocument };

export async function archiveStoredMessage(
  env: WorkerEnv,
  message: Parameters<typeof writeArchivedMessage>[1],
): Promise<void> {
  await writeArchivedMessage(env, message);
}
