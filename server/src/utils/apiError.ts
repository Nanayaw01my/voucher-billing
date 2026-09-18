export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(msg: string, details?: unknown) { return new ApiError(400, msg, 'BAD_REQUEST', details); }
  static unauthorized(msg = 'You need to sign in to do that.') { return new ApiError(401, msg, 'UNAUTHORIZED'); }
  static forbidden(msg = 'Your role does not permit this action.') { return new ApiError(403, msg, 'FORBIDDEN'); }
  static notFound(msg = 'Not found.') { return new ApiError(404, msg, 'NOT_FOUND'); }
  static conflict(msg: string, details?: unknown) { return new ApiError(409, msg, 'CONFLICT', details); }
  static unprocessable(msg: string, details?: unknown) { return new ApiError(422, msg, 'UNPROCESSABLE', details); }
}

/** A router could not be reached or refused us. Always surfaced as a soft failure. */
export class RouterUnavailableError extends ApiError {
  constructor(routerName: string, reason: string) {
    super(503, `MikroTik "${routerName}" is unreachable: ${reason}`, 'ROUTER_UNAVAILABLE');
    this.name = 'RouterUnavailableError';
  }
}
