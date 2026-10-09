// Centralized error handler: emits the API's standard error envelope.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const status = Number.isInteger(err.status) ? err.status : 500;
  const code = err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
  const message = err.expose === false ? 'Internal Server Error' : err.message || 'Server error';

  if (status >= 500) {
    console.error(`[dt13-api] ${req.method} ${req.originalUrl} -> ${status} ${code}: ${message}`);
  }

  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

// JSON 404 for any unknown /api route. Other methods are left to Express' default handler.
export function notFoundHandler(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    return next();
  }
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint khong ton tai: ${req.method} ${req.originalUrl}`,
    },
  });
}
