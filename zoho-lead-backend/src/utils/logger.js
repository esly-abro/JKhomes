/**
 * Winston Logger Configuration
 * Provides structured logging for the application
 */

const winston = require('winston');
const config = require('../config/config');

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
        }
        return log;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: config.logLevel,
    format: logFormat,
    transports: [
        // Console output
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        }),
        // Error log file
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error'
        }),
        // Combined log file
        new winston.transports.File({
            filename: 'logs/combined.log'
        })
    ]
});

module.exports = logger;
