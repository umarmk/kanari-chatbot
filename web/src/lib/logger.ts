type Fields = Record<string, unknown>;

function fmt(fields?: Fields) {
  return fields ? JSON.stringify(fields) : '';
}

export const log = {
  info(msg: string, fields?: Fields) { console.info(`[ui] ${msg}`, fmt(fields)); },
  warn(msg: string, fields?: Fields) { console.warn(`[ui] ${msg}`, fmt(fields)); },
  error(msg: string, fields?: Fields) { console.error(`[ui] ${msg}`, fmt(fields)); },
};

