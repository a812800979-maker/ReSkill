import { FastifyInstance } from 'fastify';
import { parseSkillMd } from '../engines/skill-parser.js';

const skills = new Map();

export async function skillRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    const id = crypto.randomUUID();
    const body = req.body as { sessionId: string; name: string; content: string };
    const skill = {
      id,
      sessionId: body.sessionId,
      name: body.name || 'Untitled Skill',
      content: body.content || '',
      version: '1.0.0',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    skills.set(id, skill);
    return reply.code(201).send(skill);
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const skill = skills.get(id);
    if (!skill) return reply.code(404).send({ error: 'Skill not found' });

    let parsedInputs: any[] = [];
    let parsedSteps: any[] = [];
    let parsedSystems: any[] = [];
    try {
      const parsed = parseSkillMd(skill.content);
      parsedInputs = parsed.inputs;
      parsedSteps = parsed.steps;
      parsedSystems = parsed.systems;
    } catch {
      // return raw skill if parsing fails
    }

    return { ...skill, parsedInputs, parsedSteps, parsedSystems };
  });

  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const skill = skills.get(id);
    if (!skill) return reply.code(404).send({ error: 'Skill not found' });
    const body = req.body as { name?: string; content?: string };
    if (body.name) skill.name = body.name;
    if (body.content) skill.content = body.content;
    skill.updatedAt = new Date().toISOString();
    return skill;
  });

  app.post('/:id/validate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const skill = skills.get(id);
    if (!skill) return reply.code(404).send({ error: 'Skill not found' });
    const body = req.body as { inputs?: Record<string, unknown> };
    const errors: string[] = [];
    if (!skill.content) errors.push('SKILL.md content is empty');
    if (!skill.name) errors.push('Skill name is required');

    try {
      const parsed = parseSkillMd(skill.content);
      if (body.inputs) {
        for (const input of parsed.inputs) {
          if (input.required && !(input.name in body.inputs)) {
            errors.push(`Required input '${input.name}' is missing`);
          }
        }
      }
    } catch {
      errors.push('SKILL.md parse error');
    }

    if (errors.length > 0) return { valid: false, errors };
    return { valid: true, errors: [] };
  });

  app.get('/', async () => {
    return Array.from(skills.values());
  });
}

export { skills };
