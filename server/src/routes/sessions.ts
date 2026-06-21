import { FastifyInstance } from 'fastify';
import { processFrame, analyzeRecording } from '../services/recording-processor.js';
import { generateSkill } from '../services/skill-generator.js';
import { skills } from './skills.js';

const sessions = new Map();

export async function sessionRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    const id = crypto.randomUUID();
    const session = {
      id,
      status: 'idle',
      recording: null,
      skill: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sessions.set(id, session);
    return reply.code(201).send(session);
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = sessions.get(id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    return session;
  });

  app.post('/:id/record', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = sessions.get(id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    session.status = 'recording';
    session.recording = { startTime: new Date().toISOString(), frames: [], events: [], observations: [], trajectory: [] };
    session.updatedAt = new Date().toISOString();
    return { status: 'recording', sessionId: id };
  });

  app.post('/:id/stop', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = sessions.get(id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    session.status = 'recorded';
    if (session.recording) {
      session.recording.endTime = new Date().toISOString();
    }
    session.updatedAt = new Date().toISOString();
    return { status: 'recorded', sessionId: id };
  });

  app.post('/:id/frames', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = sessions.get(id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (!session.recording) return reply.code(400).send({ error: 'No active recording' });
    const frame = req.body as { image: string; timestamp: string };
    const frameSize = frame.image?.length || 0;
    const hasDataUrlPrefix = frame.image?.startsWith('data:');
    app.log.info({ frameSize, hasDataUrlPrefix, frameIndex: session.recording.frames.length }, 'Frame received');
    if (!frame.image || frameSize < 100) {
      return reply.code(400).send({ error: '截图数据为空或无效，请确认屏幕共享正常' });
    }

    let observation: any = null;
    try {
      observation = await processFrame(id, frame.image, frame.timestamp, sessions);
      app.log.info({ observationAction: observation?.currentAction, observationError: observation?.error }, 'Observation result');
    } catch (err: any) {
      app.log.error({ err }, 'Frame processing failed');
      observation = { currentAction: '截图已保存', actionPurpose: '', relevantSystem: '系统', isVariable: false };
    }

    return { received: true, observation, debug: { frameSize, hasDataUrlPrefix } };
  });

  app.post('/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = sessions.get(id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (!session.recording) return reply.code(400).send({ error: 'No active recording' });
    const event = req.body as { type: string; timestamp: string; [key: string]: unknown };
    session.recording.events.push(event);
    return { received: true };
  });

  // Offline analysis: analyze all saved frames after recording stops
  app.post('/:id/analyze', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = sessions.get(id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.status !== 'recorded') return reply.code(400).send({ error: 'Session must be in recorded state' });

    try {
      const result = await analyzeRecording(id, sessions);
      if ('error' in result) {
        return reply.code(500).send(result);
      }
      // Return observations and trajectory for the frontend to update
      return {
        observations: result.observations,
        trajectory: result.trajectory,
        frameCount: session.recording.frames.length,
      };
    } catch (err: any) {
      app.log.error({ err }, 'Analysis failed');
      return reply.code(500).send({ error: 'Analysis failed', details: err.message });
    }
  });

  app.post('/:id/generate-skill', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = sessions.get(id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.status !== 'recorded') return reply.code(400).send({ error: 'Session must be in recorded state' });

    try {
      const skill = await generateSkill(id, sessions, skills);
      return skill;
    } catch (err: any) {
      app.log.error({ err }, 'Skill generation failed');
      session.status = 'failed';
      session.updatedAt = new Date().toISOString();
      return reply.code(500).send({ error: 'Skill generation failed', details: err.message });
    }
  });
}

export { sessions };
