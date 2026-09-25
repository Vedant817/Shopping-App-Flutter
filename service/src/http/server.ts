import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rawBody from 'fastify-raw-body';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { checkDatabase } from '../db/health.js';
import { AppError, badRequest, problem } from '../utils/errors.js';
import { decodeEncryptionKey } from '../crypto/token-vault.js';
import { authenticateOptional } from './auth.js';
import { registerRoutes, type RouteDependencies } from './routes.js';

export type BuildAppOptions = RouteDependencies;

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: options.config.logLevel },
    trustProxy: options.config.trustProxy,
    bodyLimit: 5 * 1024 * 1024,
    genReqId: (request) => {
      const value = request.headers['x-request-id'];
      const candidate = Array.isArray(value) ? value[0] : value;
      return typeof candidate === 'string' && requestIdPattern.test(candidate) ? candidate : randomUUID();
    },
  });
  await app.register(helmet);
  await app.register(cors, {
    origin: options.config.corsOrigins,
    credentials: true,
    exposedHeaders: ['x-request-id'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id', 'x-shopify-api-version', 'x-shopify-hmac-sha256', 'x-shopify-shop-domain', 'x-shopify-topic', 'x-shopify-webhook-id'],
  });
  await app.register(sensible);
  await app.register(rawBody, { field: 'rawBody', global: false, encoding: false, runFirst: true });
  app.decorateRequest('authUser', null);
  app.addHook('onRequest', async (request) => {
    const value = request.headers['x-request-id'];
    const candidate = Array.isArray(value) ? value[0] : value;
    if (Array.isArray(value) || (candidate !== undefined && (typeof candidate !== 'string' || !requestIdPattern.test(candidate)))) throw badRequest('x-request-id is invalid', 'invalid_request_id');
    try {
      await authenticateOptional(request, options.config);
    } catch {
      throw new AppError({ statusCode: 401, code: 'invalid_token', message: 'Bearer token is invalid or expired' });
    }
  });
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });
  app.get('/health/live', async () => ({ status: 'alive', process: { pid: process.pid, uptimeSeconds: process.uptime() } }));
  const ready = async (_request: unknown, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    const database = await checkDatabase(options.db);
    let keyReady = true;
    try {
      decodeEncryptionKey(options.config.shopifyTokenEncryptionKey);
    } catch {
      keyReady = false;
    }
    const isReady = database.status === 'up' && keyReady;
    return reply.code(isReady ? 200 : 503).send({ status: isReady ? 'ready' : 'not_ready', checkedAt: new Date().toISOString(), resources: { database: { status: database.status, checkedAt: database.checkedAt, latencyMs: database.latencyMs }, tokenEncryption: { status: keyReady ? 'up' : 'down' } } });
  };
  app.get('/health/ready', ready);
  app.get('/health', ready);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).type('application/problem+json').send(problem(error, request.url, request.id));
    }
    if (error instanceof ZodError) {
      const invalid = new AppError({ statusCode: 400, code: 'validation_error', message: 'Request validation failed', detail: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
      return reply.code(invalid.statusCode).type('application/problem+json').send(problem(invalid, request.url, request.id));
    }
    const errorValue = error as { statusCode?: unknown; name?: unknown; message?: unknown };
    const statusCode = typeof errorValue.statusCode === 'number' && errorValue.statusCode >= 400 && errorValue.statusCode < 500 ? errorValue.statusCode : 500;
    const responseError = new AppError({ statusCode, code: statusCode === 404 ? 'not_found' : 'internal_error', message: statusCode === 404 ? 'Resource was not found' : 'An unexpected error occurred' });
    request.log.error({ errorName: typeof errorValue.name === 'string' ? errorValue.name : 'Error', errorMessage: typeof errorValue.message === 'string' ? errorValue.message : 'request failed' }, 'request failed');
    return reply.code(responseError.statusCode).type('application/problem+json').send(problem(responseError, request.url, request.id));
  });
  app.setNotFoundHandler((request, reply) => {
    const error = new AppError({ statusCode: 404, code: 'not_found', message: 'Resource was not found' });
    return reply.code(404).type('application/problem+json').send(problem(error, request.url, request.id));
  });
  await registerRoutes(app, options);
  return app;
}
