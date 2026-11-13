import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { NodeRequest } from '@nestjs/platform-node';

export function hostnameOf(header: string | undefined): string {
  if (!header) throw new BadRequestException('Missing Host header');
  try {
    return new URL(`http://${header}`).hostname;
  } catch {
    throw new BadRequestException('Invalid Host header');
  }
}

export const RequestHost = createParamDecorator((_data: unknown, context: ExecutionContext): string =>
  hostnameOf(context.switchToHttp().getRequest<NodeRequest>().headers.host)
);
