/**
 * Minimal structured logger (Section 40). Emits single-line JSON so log
 * aggregators (or plain `grep`/`jq` over GitHub Actions logs) can parse it
 * without pulling in a logging framework we don't need at this scale.
 */
type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function emit(level: LogLevel, message: string, fields?: LogFields) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export type Logger = {
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
  /** Returns a logger that merges `baseFields` into every call, including
   * further nested `.child()` calls (e.g. a per-job logger child'd again
   * with a per-source-run id). */
  child: (baseFields: LogFields) => Logger;
};

function makeLogger(inheritedFields: LogFields): Logger {
  return {
    debug: (message, fields) => emit("debug", message, { ...inheritedFields, ...fields }),
    info: (message, fields) => emit("info", message, { ...inheritedFields, ...fields }),
    warn: (message, fields) => emit("warn", message, { ...inheritedFields, ...fields }),
    error: (message, fields) => emit("error", message, { ...inheritedFields, ...fields }),
    child: (baseFields) => makeLogger({ ...inheritedFields, ...baseFields }),
  };
}

export const logger: Logger = makeLogger({});
