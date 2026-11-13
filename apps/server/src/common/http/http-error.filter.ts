import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ApiErrorDetail, ApiErrorResponse, ErrorCode } from '@homeport/contracts';
import type { NodeResponse } from '@nestjs/platform-node';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function describe(exception: HttpException): { code: ErrorCode; message: string; details?: ApiErrorDetail[] } {
  const status = exception.getStatus();
  const body = exception.getResponse();
  const fallbackCode = CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
  if (!isRecord(body)) return { code: fallbackCode, message: typeof body === 'string' ? body : exception.message };

  const { code, message, details } = body;
  return {
    code: typeof code === 'string' ? (code as ErrorCode) : fallbackCode,
    message: Array.isArray(message) ? message.join(', ') : typeof message === 'string' ? message : exception.message,
    ...(Array.isArray(details) ? { details: details as ApiErrorDetail[] } : {}),
  };
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<NodeResponse>();
    if (response.headersSent) return;

    if (exception instanceof HttpException && exception.getStatus() < 500) {
      const status = exception.getStatus();
      response.status(status).json({ error: { status, ...describe(exception) } } satisfies ApiErrorResponse);
      return;
    }

    this.logger.error({ event: 'http.unhandled', error: exception instanceof Error ? exception.stack : String(exception) });
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({
      error: { status, code: 'INTERNAL_ERROR', message: 'Something went wrong on the server' },
    } satisfies ApiErrorResponse);
  }
}
