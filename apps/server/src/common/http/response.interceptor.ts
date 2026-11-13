import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor, type Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiListResponse, ApiResponse } from '@homelab/contracts';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { map, type Observable } from 'rxjs';

import { Paginated } from './pagination.js';
import { RAW_RESPONSE, RESPONSE_DTO } from './serialize.js';

const sanitize = (dto: Type, value: unknown): unknown =>
  instanceToPlain(plainToInstance(dto, value, { excludeExtraneousValues: true, exposeUnsetFields: false }));

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, targets)) return next.handle();

    const dto = this.reflector.getAllAndOverride<Type | null | undefined>(RESPONSE_DTO, targets);
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    if (dto === undefined) throw new Error(`${route} must declare @Serialize(Dto) or @EmptyResponse()`);

    return next.handle().pipe(
      map((value: unknown): ApiResponse<unknown> | ApiListResponse<unknown> => {
        if (dto === null || value === undefined || value === null) return { data: null };
        if (value instanceof Paginated) {
          return { data: value.items.map((item) => sanitize(dto, item)), meta: value.meta };
        }
        if (Array.isArray(value)) throw new Error(`${route} returned an array; return Paginated so lists carry meta`);
        return { data: sanitize(dto, value) };
      })
    );
  }
}
