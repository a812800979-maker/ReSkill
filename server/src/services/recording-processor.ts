import { analyzeRecordingOffline, observeFrame, type Observation } from '../lib/claude.js';

const sessionContexts = new Map<string, string[]>();

export async function processFrame(
  sessionId: string,
  imageBase64: string,
  timestamp: string,
  sessionStore: Map<string, any>,
): Promise<Observation | { error: string } | null> {
  const session = sessionStore.get(sessionId);
  if (!session?.recording) return null;

  // Save frame data (also kept for optional offline re-analysis)
  session.recording.frames.push({
    index: session.recording.frames.length,
    timestamp,
    image: imageBase64,
  });
  session.updatedAt = new Date().toISOString();

  // Real-time vision analysis of this frame
  const context = sessionContexts.get(sessionId) || [];
  try {
    const obs = await observeFrame(imageBase64, context);
    // Skip invalid/blank frames so they don't pollute observations or trajectory
    if (obs.relevantSystem === 'unknown' && /过小|黑屏|无效/.test(obs.currentAction)) {
      return obs;
    }
    context.push(`${obs.currentAction} (${obs.relevantSystem})`);
    sessionContexts.set(sessionId, context);
    session.recording.observations.push({
      id: crypto.randomUUID(),
      app: obs.relevantSystem,
      text: obs.currentAction,
      time: new Date().toISOString(),
    });
    // Also accumulate trajectory so skill generation can reuse real-time analysis
    session.recording.trajectory.push({
      id: crypto.randomUUID(),
      num: session.recording.trajectory.length + 1,
      title: obs.currentAction,
      desc: obs.isVariable ? `变量: ${obs.variableName || 'unknown'} — ${obs.actionPurpose}` : obs.actionPurpose,
      tag: obs.relevantSystem,
      observation: obs,
    });
    return obs;
  } catch (err: any) {
    console.error('observeFrame error:', err.message || err);
    return {
      currentAction: '截图已保存（实时分析失败）',
      actionPurpose: err.message || '',
      relevantSystem: '系统',
      isVariable: false,
    };
  }
}

export async function analyzeRecording(
  sessionId: string,
  sessionStore: Map<string, any>,
): Promise<{ observations: Observation[]; trajectory: any[] } | { error: string }> {
  const session = sessionStore.get(sessionId);
  if (!session?.recording) return { error: 'No recording found' };

  const frames = session.recording.frames || [];
  if (frames.length === 0) return { error: 'No frames to analyze' };

  // Reuse real-time analysis if it already produced a trajectory (preferred path)
  const existingTraj = session.recording.trajectory || [];
  if (existingTraj.length > 0) {
    sessionContexts.delete(sessionId);
    return {
      observations: existingTraj.map((t: any) => t.observation),
      trajectory: existingTraj,
    };
  }

  // Fallback: no real-time trajectory (e.g. vision was unavailable) — analyze now
  session.recording.observations = [];
  session.recording.trajectory = [];

  try {
    const result = await analyzeRecordingOffline(frames);
    const observations = result.observations;
    const trajectorySteps = result.trajectory;

    // Store observations
    for (const obs of observations) {
      session.recording.observations.push({
        id: crypto.randomUUID(),
        app: obs.relevantSystem,
        text: obs.currentAction,
        time: new Date().toISOString(),
      });
    }

    // Store trajectory
    for (const step of trajectorySteps) {
      session.recording.trajectory.push({
        id: crypto.randomUUID(),
        num: session.recording.trajectory.length + 1,
        title: step.title,
        desc: step.desc,
        tag: step.tag,
        observation: step.observation,
      });
    }

    session.updatedAt = new Date().toISOString();
    sessionContexts.delete(sessionId);

    return { observations, trajectory: session.recording.trajectory };
  } catch (err: any) {
    console.error('analyzeRecording error:', err.message || err);
    return { error: `离线分析失败: ${err.message || '未知错误'}` };
  }
}

export function clearSessionContext(sessionId: string) {
  sessionContexts.delete(sessionId);
}
