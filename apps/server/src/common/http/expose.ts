import { applyDecorators } from '@nestjs/common';
import { Expose, Transform, Type } from 'class-transformer';

export const ExposeDate = (): PropertyDecorator =>
  applyDecorators(
    Expose(),
    Transform(({ value }: { value: unknown }) => (value instanceof Date ? value.toISOString() : value), { toClassOnly: true })
  );

export const ExposeNested = (dto: () => new () => object): PropertyDecorator => applyDecorators(Expose(), Type(dto));
