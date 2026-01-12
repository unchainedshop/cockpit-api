/**
 * Logger for Cockpit API
 */

import { createLogger } from "@unchainedshop/logger";

type Logger = ReturnType<typeof createLogger>;

export const logger: Logger = createLogger("cockpit");

const logInfo: Logger["info"] = logger.info;
export default logInfo;
