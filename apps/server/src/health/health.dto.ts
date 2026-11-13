import { Expose } from 'class-transformer';

import type { Health } from './health.service.js';

export class HealthDto implements Health {
  @Expose() status!: 'ok';
  @Expose() database!: 'ok';
}
