import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ApiErrorDetail, ErrorCode } from '@homeport/contracts';

export interface AppErrorBody {
  code: ErrorCode;
  message: string;
  details?: ApiErrorDetail[];
}

export class AppError extends HttpException {
  constructor(status: HttpStatus, code: ErrorCode, message: string, details?: ApiErrorDetail[]) {
    super({ code, message, ...(details ? { details } : {}) } satisfies AppErrorBody, status);
  }
}
