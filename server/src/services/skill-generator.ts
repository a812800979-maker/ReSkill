import { generateSkillMd, type TrajectoryStep } from '../lib/claude.js';

export async function generateSkill(
  sessionId: string,
  sessionStore: Map<string, any>,
  skillStore: Map<string, any>,
): Promise<any> {
  const session = sessionStore.get(sessionId);
  if (!session?.recording) throw new Error('Session not found or no recording');

  session.status = 'generating';
  session.updatedAt = new Date().toISOString();

  const rawTrajectory = session.recording.trajectory || [];

  // If no trajectory from AI, build one from observations/screenshots
  if (rawTrajectory.length === 0 && session.recording.frames?.length > 0) {
    const frameCount = session.recording.frames.length;
    for (let i = 0; i < frameCount; i++) {
      rawTrajectory.push({
        id: crypto.randomUUID(),
        num: i + 1,
        title: `截图步骤 ${i + 1}`,
        desc: '用户操作截图（AI 分析不可用）',
        tag: 'capture',
        observation: {
          currentAction: `截图步骤 ${i + 1}`,
          actionPurpose: '用户操作截图',
          relevantSystem: 'unknown',
          isVariable: false,
        },
      });
    }
  }

  // If still empty, generate a minimal fallback skill
  if (rawTrajectory.length === 0) {
    const id = crypto.randomUUID();
    const skill = {
      id,
      sessionId,
      name: '自定义工作流',
      content: `---\nspec_version: "1.0"\nskill:\n  name: "自定义工作流"\n  version: "1.0.0"\n  description: "基于录制轨迹自动生成的工作流（录制时间较短，AI 分析数据不足）"\ninputs: []\noutputs: []\nsystems: []\n---\n\n# 自定义工作流\n\n## 概述\n录制时间较短或 AI 分析数据不足，无法生成完整技能包。请重新录制并操作更多步骤。\n`,
      version: '1.0.0',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    skillStore.set(id, skill);
    session.status = 'ready';
    session.skill = id;
    session.updatedAt = new Date().toISOString();
    return skill;
  }

  const trajectory: TrajectoryStep[] = rawTrajectory.map(
    (t: any, i: number) => ({
      num: t.num || i + 1,
      title: t.title || 'Unknown step',
      desc: t.desc || '',
      tag: t.tag || 'unknown',
      observation: t.observation || {
        currentAction: t.title,
        actionPurpose: t.desc,
        relevantSystem: t.tag,
        isVariable: false,
      },
    }),
  );

  const md = await generateSkillMd(trajectory);

  const id = crypto.randomUUID();
  const skill = {
    id,
    sessionId,
    name: extractSkillName(md) || 'Untitled Skill',
    content: md,
    version: '1.0.0',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  skillStore.set(id, skill);

  session.status = 'ready';
  session.skill = id;
  session.updatedAt = new Date().toISOString();

  return skill;
}

function extractSkillName(md: string): string | null {
  // Try quoted name first: name: "一键竞品分析" or name: '一键竞品分析'
  const quoted = md.match(/name:\s*["'](.+?)["']/);
  if (quoted) return quoted[1];
  // Try unquoted YAML: name: 一键竞品分析 (capture until newline, supports Chinese)
  const unquoted = md.match(/name:\s*(.+)/);
  if (unquoted) return unquoted[1].trim();
  return null;
}
