import type { Logger } from "@unchainedshop/logger";

let logger: Logger = { // eslint-disable-line
  info: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.debug,
  trace: console.trace,
};

async function loadLogger() {
  try {
    const { createLogger } = await import("@unchainedshop/logger");
    logger = createLogger("cockpit") || logger;
  } catch (e) {
    // console.warn(e);
  }
}

loadLogger();

const log = logger.info;

export { logger };

export default log;
