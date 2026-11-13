import { SetMetadata, type Type } from '@nestjs/common';

export const RESPONSE_DTO = 'http:response-dto';
export const RAW_RESPONSE = 'http:raw-response';

export const Serialize = (dto: Type): MethodDecorator & ClassDecorator => SetMetadata(RESPONSE_DTO, dto);

export const EmptyResponse = (): MethodDecorator => SetMetadata(RESPONSE_DTO, null);

export const RawResponse = (): MethodDecorator => SetMetadata(RAW_RESPONSE, true);
