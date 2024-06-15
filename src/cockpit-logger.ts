let logger = { // eslint-disable-line
  log: console.log,
  info: console.log,
  error: console.error,
  warn: console.warn,
  verbose: console.debug,
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

const log = (...args: any) => logger.info(...args);

export { logger };

export default log;
