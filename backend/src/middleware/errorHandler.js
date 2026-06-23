// Central error handler. Never leak stack traces to clients in production.
export function notFound(req, res) {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const body = {
    error: err.code || 'internal_error',
    message: status === 500 ? 'An unexpected error occurred.' : err.message,
  };
  if (process.env.NODE_ENV !== 'production' && status === 500) {
    body.detail = err.message;
  }
  if (status >= 500) console.error('[error]', err);
  res.status(status).json(body);
}

/** Throw this for clean, client-facing errors. */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
