import { FastifyInstance } from 'fastify';
import { runExecution } from '../engines/execution-engine.js';
import { skills } from './skills.js';
import { sessions } from './sessions.js';

const executions = new Map();

export async function executionRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    const id = crypto.randomUUID();
    const body = req.body as { skillId: string; sessionId: string; inputs: Record<string, unknown> };
    const execution = {
      id,
      skillId: body.skillId,
      sessionId: body.sessionId,
      inputs: body.inputs || {},
      status: 'pending',
      stepResults: [],
      outputs: {},
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    executions.set(id, execution);

    runExecution(id, executions, skills, sessions).catch((err) => {
      app.log.error({ err }, 'Execution engine error');
    });

    return reply.code(201).send(execution);
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const execution = executions.get(id);
    if (!execution) return reply.code(404).send({ error: 'Execution not found' });
    return execution;
  });

  app.post('/:id/pause', async (req, reply) => {
    const { id } = req.params as { id: string };
    const execution = executions.get(id);
    if (!execution) return reply.code(404).send({ error: 'Execution not found' });
    execution.status = 'paused';
    return { status: 'paused', executionId: id };
  });

  app.post('/:id/resume', async (req, reply) => {
    const { id } = req.params as { id: string };
    const execution = executions.get(id);
    if (!execution) return reply.code(404).send({ error: 'Execution not found' });
    execution.status = 'running';
    return { status: 'running', executionId: id };
  });

  app.post('/:id/takeover', async (req, reply) => {
    const { id } = req.params as { id: string };
    const execution = executions.get(id);
    if (!execution) return reply.code(404).send({ error: 'Execution not found' });
    execution.status = 'paused';
    return { status: 'paused', message: 'Manual takeover activated', executionId: id };
  });
}
