const DEBUG = false;

const noop = (..._args: unknown[]) => {};

export const log = DEBUG
    ? { info: console.log.bind(console), warn: console.warn.bind(console), error: console.error.bind(console) }
    : { info: noop, warn: noop, error: noop };
