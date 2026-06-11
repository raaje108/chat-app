// A custom error class that extends JavaScript's built-in Error
// This lets us attach a statusCode to any error we throw
// So the error handler knows what HTTP status to send back

class AppError extends Error {
    constructor(message, statusCode) {
        // super() calls the parent Error class constructor
        // This sets this.message = message
        super(message);

        this.statusCode  = statusCode;
        this.status      = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        // 4xx errors = 'fail'  (client did something wrong)
        // 5xx errors = 'error' (server did something wrong)

        this.isOperational = true;
        // isOperational = true means this is a known, expected error
        // we threw it ourselves with a clear message
        // vs unexpected crashes (null reference, DB connection lost)
        // which have isOperational = undefined (falsy)

        // captureStackTrace gives us a clean stack trace
        // pointing to where the error was created
        // not inside this AppError constructor
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;