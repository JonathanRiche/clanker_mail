import type { WorkerEnv } from "../types";

import {
  getArchivedMessage,
  listArchivedMessages,
  readConfigDocument,
  writeArchivedMessage,
  writeConfigDocument,
} from "./d1";

export {
  getArchivedMessage,
  listArchivedMessages,
  readConfigDocument,
  writeConfigDocument,
};

export async function archiveStoredMessage(
  env: WorkerEnv,
  message: Parameters<typeof writeArchivedMessage>[1],
): Promise<void> {
  await writeArchivedMessage(env, message);
}
