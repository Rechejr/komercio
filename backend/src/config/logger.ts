import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Los Error tienen `message`/`stack` como propiedades NO enumerables — un
// JSON.stringify normal de { err } los serializa como "{}", perdiendo el
// motivo real. Este replacer los expande antes de imprimir.
function errorReplacer(_key: string, value: unknown) {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack, ...(value as any) };
  }
  return value;
}

// Antes esta función solo imprimía level/message/timestamp/stack — cualquier
// metadata extra pasada como segundo argumento (logger.error('msg', { err }),
// { userId, ... }, etc.) se descartaba en silencio, incluyendo el motivo real
// de errores como el de envío de email (ver commit que agregó este comentario).
const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaKeys = Object.keys(meta);
  const metaStr = metaKeys.length > 0 ? ` ${JSON.stringify(meta, errorReplacer)}` : '';
  return `${ts} [${level}]: ${stack || message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    process.env.NODE_ENV !== 'production' ? colorize() : winston.format.uncolorize(),
    logFormat,
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});
