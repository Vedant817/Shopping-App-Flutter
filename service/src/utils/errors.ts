export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly type: string;
  readonly detail?: string;
  readonly extensions?: Record<string, unknown>;

  constructor(options: {
    statusCode: number;
    code: string;
    message: string;
    type?: string;
    detail?: string;
    extensions?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'AppError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.type = options.type ?? 'about:blank';
    this.detail = options.detail;
    this.extensions = options.extensions;
  }
}

export function problem(error: AppError, instance?: string, requestId?: string): Record<string, unknown> {
  return {
    type: error.type,
    title: error.message,
    status: error.statusCode,
    detail: error.detail,
    instance,
    code: error.code,
    ...(requestId ? { requestId } : {}),
    ...(error.extensions ? { extensions: error.extensions } : {}),
  };
}

export function badRequest(message: string, code = 'bad_request', detail?: string): AppError {
  return new AppError({ statusCode: 400, code, message, detail });
}

export function unauthorized(message = 'Authentication is required', code = 'unauthorized'): AppError {
  return new AppError({ statusCode: 401, code, message, type: 'https://www.rfc-editor.org/rfc/rfc6750' });
}

export function forbidden(message = 'Access is forbidden', code = 'forbidden'): AppError {
  return new AppError({ statusCode: 403, code, message, type: 'https://www.rfc-editor.org/rfc/rfc9110' });
}

export function notFound(message = 'Resource was not found', code = 'not_found'): AppError {
  return new AppError({ statusCode: 404, code, message, type: 'https://www.rfc-editor.org/rfc/rfc9110' });
}

export function conflict(message: string, code = 'conflict'): AppError {
  return new AppError({ statusCode: 409, code, message, type: 'https://www.rfc-editor.org/rfc/rfc9110' });
}

export function unprocessable(message: string, code = 'unprocessable_entity', detail?: string): AppError {
  return new AppError({ statusCode: 422, code, message, detail });
}

export function serviceUnavailable(message: string, code = 'service_unavailable', detail?: string): AppError {
  return new AppError({ statusCode: 503, code, message, detail, type: 'https://www.rfc-editor.org/rfc/rfc9110' });
}
