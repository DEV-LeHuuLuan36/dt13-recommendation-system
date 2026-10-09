/**
 * Async wrapper de bat loi promise va chuyen cho errorHandler Express.
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}