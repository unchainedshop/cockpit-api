/**
 * Logger for Cockpit API
 */

import { createLogger } from "@unchainedshop/logger";

type Logger = ReturnType<typeof createLogger>;

export const logger: Logger = createLogger("cockpit");

const logInfo: Logger["info"] = logger.info;
export default logInfo;

const warned = new Set<string>();

/** Logs `message` as a warning once per process for `key` */
export function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  logger.warn(message);
}
