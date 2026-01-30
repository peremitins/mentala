import type { FastifyReply } from 'fastify';
import type { StreamEvent } from './types.js';

export function proxySse(reply: FastifyReply, ev: StreamEvent): void {
  reply.raw.write(ev.data);
}
