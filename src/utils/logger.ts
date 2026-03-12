import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

// Environment check independent of config.ts to avoid circular dependency
const NODE_ENV = process.env.NODE_ENV || 'development';

const logFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}]: ${message}`;
});

// IST Timestamp for logging
const istTimestamp = () => {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).replace(',', '');
};

export const logger = winston.createLogger({
  level: NODE_ENV === 'development' ? 'debug' : 'info',
  format: combine(
    timestamp({ format: istTimestamp }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: istTimestamp }),
        logFormat
      ),
    }),
    new winston.transports.File({ 
      filename: 'logs/app.log',
      level: 'debug',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
      tailable: true,
    }),
  ],
});
