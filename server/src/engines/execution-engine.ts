import { executeComputerUse } from '../lib/claude.js';
import { parseSkillMd } from './skill-parser.js';
import { broadcastToSession } from '../routes/ws.js';

export async function runExecution(
  executionId: string,
  executionStore: Map<string, any>,
  skillStore: Map<string, any>,
  sessionStore: Map<string, any>,
): Promise<void> {
  const execution = executionStore.get(executionId);
  if (!execution) return;

  const skill = skillStore.get(execution.skillId);
  if (!skill) {
    execution.status = 'failed';
    execution.stepResults.push({ stepId: 'init', status: 'failed', error: 'Skill not found' });
    broadcastToSession(execution.sessionId, 'execution:failed', {
      executionId,
      stepId: 'init',
      error: 'Skill not found',
    });
    return;
  }

  const parsed = parseSkillMd(skill.content);
  const inputs = execution.inputs || {};
  const prevOutputs: Record<string, unknown> = {};

  execution.status = 'running';
  executionStore.set(executionId, execution);

  broadcastToSession(execution.sessionId, 'execution:progress', {
    executionId,
    status: 'running',
    totalSteps: parsed.steps.length,
  });

  for (let i = 0; i < parsed.steps.length; i++) {
    const step = parsed.steps[i];

    if (execution.status === 'paused') {
      broadcastToSession(execution.sessionId, 'execution:paused', {
        executionId,
        stepId: step.id,
        reason: 'Paused by user',
      });
      await waitForResume(executionId, executionStore);
      if (execution.status === 'failed') return;
    }

    execution.stepResults.push({
      stepId: step.id,
      status: 'running',
      startedAt: new Date().toISOString(),
    });
    executionStore.set(executionId, execution);

    broadcastToSession(execution.sessionId, 'execution:progress', {
      executionId,
      stepId: step.id,
      stepIndex: i,
      status: 'running',
      description: step.description,
    });

    try {
      const result = await executeComputerUse(
        skill.content,
        i,
        inputs,
        prevOutputs,
      );

      if (step.output) {
        prevOutputs[step.output] = result.output;
      }

      const lastResult = execution.stepResults[execution.stepResults.length - 1];
      lastResult.status = 'done';
      lastResult.output = result.output;
      lastResult.action = result.action;
      lastResult.completedAt = new Date().toISOString();
      executionStore.set(executionId, execution);

      broadcastToSession(execution.sessionId, 'execution:progress', {
        executionId,
        stepId: step.id,
        stepIndex: i,
        status: 'done',
        output: result.output,
        action: result.action,
      });
    } catch (err: any) {
      const lastResult = execution.stepResults[execution.stepResults.length - 1];
      // on_error in SKILL.md is usually a natural-language sentence, not a
      // skip/retry/fail enum. Default to "skip" so one shaky step (e.g. a model
      // hiccup) doesn't abort the whole run — only an explicit "fail" stops it.
      const raw = (step.onError || '').toLowerCase();
      const onError = raw === 'fail' ? 'fail' : raw === 'retry' ? 'retry' : 'skip';

      if (onError === 'skip') {
        lastResult.status = 'skipped';
        lastResult.error = err.message;
      } else if (onError === 'retry') {
        try {
          const retryResult = await executeComputerUse(
            skill.content, i, inputs, prevOutputs,
          );
          lastResult.status = 'done';
          lastResult.output = retryResult.output;
          lastResult.action = retryResult.action;
          if (step.output) prevOutputs[step.output] = retryResult.output;
        } catch {
          lastResult.status = 'failed';
          lastResult.error = err.message;
        }
      } else {
        lastResult.status = 'failed';
        lastResult.error = err.message;
      }

      lastResult.completedAt = new Date().toISOString();
      executionStore.set(executionId, execution);

      broadcastToSession(execution.sessionId, 'execution:progress', {
        executionId,
        stepId: step.id,
        stepIndex: i,
        status: lastResult.status,
        error: lastResult.error,
      });

      if (lastResult.status === 'failed') {
        execution.status = 'failed';
        execution.completedAt = new Date().toISOString();
        executionStore.set(executionId, execution);

        broadcastToSession(execution.sessionId, 'execution:failed', {
          executionId,
          stepId: step.id,
          error: err.message,
        });
        return;
      }
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  execution.status = 'completed';
  execution.outputs = prevOutputs;
  execution.completedAt = new Date().toISOString();
  executionStore.set(executionId, execution);

  broadcastToSession(execution.sessionId, 'execution:completed', {
    executionId,
    outputs: prevOutputs,
  });
}

function waitForResume(
  executionId: string,
  executionStore: Map<string, any>,
): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const execution = executionStore.get(executionId);
      if (!execution || execution.status === 'running' || execution.status === 'completed') {
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });
}
