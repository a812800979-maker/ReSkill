import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const MODEL = process.env.RESKILL_MODEL || 'Claude-Opus-4.8-joybuilder';

export interface Observation {
  currentAction: string;
  actionPurpose: string;
  relevantSystem: string;
  isVariable: boolean;
  variableName?: string;
}

function stripDataUrl(data: string): { mediaType: string; base64: string } {
  const match = data.match(/^data:(image\/[a-z]+);base64,/);
  if (match) {
    return { mediaType: match[1], base64: data.slice(match[0].length) };
  }
  return { mediaType: 'image/jpeg', base64: data };
}

function extractJson(text: string): any {
  try { return JSON.parse(text); } catch {}
  const mdMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1].trim()); } catch {}
  }
  return null;
}

const MAX_IMAGE_BASE64_LENGTH = 1_000_000;

function validateImageSize(base64: string): void {
  if (base64.length > MAX_IMAGE_BASE64_LENGTH) {
    throw new Error(`截图过大 (${Math.round(base64.length / 1024)}KB)，超过处理上限。请降低屏幕分辨率或重启录制。`);
  }
}

export async function observeFrame(
  imageBase64: string,
  previousContext: string[],
): Promise<Observation> {
  const { mediaType, base64 } = stripDataUrl(imageBase64);

  if (!base64 || base64.length < 5000) {
    return {
      currentAction: '截图数据过小，可能是黑屏或无效帧',
      actionPurpose: '',
      relevantSystem: 'unknown',
      isVariable: false,
    };
  }

  validateImageSize(base64);

  const contextBlock =
    previousContext.length > 0
      ? `\nPrevious context:\n${previousContext.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : '';

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64,
            },
          },
          {
            type: 'text',
            text: `观察截图并描述用户的操作。${contextBlock}

重要：仅回复一个原始 JSON 对象，不要 markdown、代码块或解释。
{"currentAction":"用户正在做什么（中文，1句话）","actionPurpose":"为什么这样做（中文，1句话）","relevantSystem":"应用名称（中文，如'浏览器'、'文档编辑器'、'终端'）","isVariable":false,"variableName":null}

如果用户输入了可变数据（URL、名称、搜索词），设置 isVariable=true 并给出一个 camelCase 英文变量名。`,
          },
        ],
      },
    ],
  });

  const text = msg.content[0].type === 'text' ? (msg.content[0] as { type: 'text'; text: string }).text : '';
  const parsed = extractJson(text);
  if (parsed) {
    return {
      currentAction: parsed.currentAction || '',
      actionPurpose: parsed.actionPurpose || '',
      relevantSystem: parsed.relevantSystem || 'unknown',
      isVariable: !!parsed.isVariable,
      variableName: parsed.variableName || undefined,
    };
  }

  return {
    currentAction: text.slice(0, 100),
    actionPurpose: '',
    relevantSystem: 'unknown',
    isVariable: false,
  };
}

export async function analyzeRecordingOffline(
  frames: { index: number; timestamp: string; image: string }[],
): Promise<{ observations: Observation[]; trajectory: { title: string; desc: string; tag: string; observation: Observation }[] }> {
  const observations: Observation[] = [];
  const trajectory: { title: string; desc: string; tag: string; observation: Observation }[] = [];

  // Try real per-frame vision analysis. The 1px probe is unreliable on some
  // gateways (Bedrock rejects the tiny test image), so we attempt actual frames
  // and only fall back to metadata if every frame fails.
  let visionFailures = 0;
  let visionAttempts = 0;
  for (const frame of frames) {
    const { base64 } = stripDataUrl(frame.image);
    if (!base64 || base64.length < 5000) continue;
    visionAttempts++;
    try {
      validateImageSize(base64);
      const obs = await observeFrame(base64, observations.map(o => `${o.currentAction} (${o.relevantSystem})`));
      observations.push(obs);
      trajectory.push({
        title: obs.currentAction,
        desc: obs.isVariable ? `Variable: ${obs.variableName || 'unknown'} — ${obs.actionPurpose}` : obs.actionPurpose,
        tag: obs.relevantSystem,
        observation: obs,
      });
    } catch {
      visionFailures++;
      observations.push({ currentAction: `截图 #${frame.index + 1} 分析失败`, actionPurpose: '', relevantSystem: 'unknown', isVariable: false });
    }
  }

  // If we had frames to analyze but every one failed, vision is truly down —
  // fall back to metadata-only analysis.
  if (visionAttempts > 0 && visionFailures === visionAttempts) {
    return analyzeWithMetadata(frames);
  }

  return { observations, trajectory };
}

// Fallback: analyze recording using frame metadata (timestamps, count, intervals)
// without sending actual images to the AI
async function analyzeWithMetadata(
  frames: { index: number; timestamp: string; image: string }[],
): Promise<{ observations: Observation[]; trajectory: { title: string; desc: string; tag: string; observation: Observation }[] }> {
  const observations: Observation[] = [];
  const trajectory: { title: string; desc: string; tag: string; observation: Observation }[] = [];

  if (frames.length === 0) return { observations, trajectory };

  // Build metadata summary for AI
  const startTime = new Date(frames[0].timestamp).getTime();
  const endTime = new Date(frames[frames.length - 1].timestamp).getTime();
  const totalDuration = Math.round((endTime - startTime) / 1000);
  const frameCount = frames.length;

  // Group frames into steps based on time gaps (>5s gap = new step)
  const steps: { startIndex: number; endIndex: number; startTime: number; endTime: number }[] = [];
  let currentStep = { startIndex: 0, endIndex: 0, startTime, endTime: startTime };

  for (let i = 1; i < frames.length; i++) {
    const prevTime = new Date(frames[i - 1].timestamp).getTime();
    const currTime = new Date(frames[i].timestamp).getTime();
    const gap = (currTime - prevTime) / 1000;

    if (gap > 5) {
      // New step
      currentStep.endTime = prevTime;
      steps.push(currentStep);
      currentStep = { startIndex: i, endIndex: i, startTime: currTime, endTime: currTime };
    } else {
      currentStep.endIndex = i;
      currentStep.endTime = currTime;
    }
  }
  steps.push(currentStep);

  // Build metadata description for each step
  const stepDescriptions = steps.map((step, i) => {
    const duration = Math.round((step.endTime - step.startTime) / 1000);
    const frameRange = `${step.startIndex + 1}-${step.endIndex + 1}`;
    return `步骤 ${i + 1}: ${duration}秒, 截图 ${frameRange} (${frames.length}帧中)`;
  }).join('\n');

  // Try to extract text content from screenshots using basic analysis
  // For each step, sample the middle frame and check for any readable text patterns
  const stepTextHints: string[] = [];
  for (const step of steps) {
    const midIndex = Math.floor((step.startIndex + step.endIndex) / 2);
    const frame = frames[midIndex];
    // Check if the image data is substantial (not just black screen)
    const imageSize = frame.image?.length || 0;
    stepTextHints.push(imageSize > 20000 ? '有屏幕内容' : '屏幕内容较少');
  }

  const prompt = `你是一个工作流分析师。用户录制了 ${totalDuration} 秒的屏幕操作，共捕获 ${frameCount} 张截图。

根据以下录制元数据，推断用户在每个步骤中可能执行了什么操作，生成合理的观察结果和轨迹步骤。

录制元数据：
- 总时长：${totalDuration} 秒
- 总截图数：${frameCount}
- 按时间间隔检测到的步骤数：${steps.length}

步骤详情：
${stepDescriptions}

屏幕内容提示：
${steps.map((s, i) => `步骤 ${i + 1}: ${stepTextHints[i]}`).join('\n')}

生成一个 JSON 数组，每个元素包含：
- "currentAction": 用户正在做什么（中文，1句话）
- "actionPurpose": 为什么这样做（中文，1句话）
- "relevantSystem": 可能的应用名称（中文，如"浏览器"、"VS Code"、"终端"、"访达"）
- "isVariable": 如果该步骤涉及可变输入（URL、名称、搜索词）则为 true
- "variableName": 如果 isVariable 为 true，给出一个 camelCase 英文变量名，否则为 null

要求：所有面向用户的文本字段必须使用中文。
仅输出 JSON 数组，不要包含 markdown 或其他说明。`;

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].type === 'text' ? (msg.content[0] as { type: 'text'; text: string }).text : '';
    const parsed = extractJson(text);

    if (Array.isArray(parsed)) {
      for (const step of parsed) {
        const obs: Observation = {
          currentAction: step.currentAction || `屏幕操作`,
          actionPurpose: step.actionPurpose || '',
          relevantSystem: step.relevantSystem || 'unknown',
          isVariable: !!step.isVariable,
          variableName: step.variableName || undefined,
        };
        observations.push(obs);
        trajectory.push({
          title: obs.currentAction,
          desc: obs.isVariable ? `Variable: ${obs.variableName || 'unknown'} — ${obs.actionPurpose}` : obs.actionPurpose,
          tag: obs.relevantSystem,
          observation: obs,
        });
      }
    } else {
      // Fallback: generate basic trajectory from metadata
      for (let i = 0; i < steps.length; i++) {
        const duration = Math.round((steps[i].endTime - steps[i].startTime) / 1000);
        const obs: Observation = {
          currentAction: `屏幕操作 #${i + 1} (${duration}秒)`,
          actionPurpose: `第 ${i + 1} 段操作，持续 ${duration} 秒`,
          relevantSystem: 'unknown',
          isVariable: false,
        };
        observations.push(obs);
        trajectory.push({
          title: obs.currentAction,
          desc: obs.actionPurpose,
          tag: 'web',
          observation: obs,
        });
      }
    }
  } catch (err: any) {
    console.error('Metadata analysis failed:', err.message);
    // Ultimate fallback
    for (let i = 0; i < steps.length; i++) {
      const duration = Math.round((steps[i].endTime - steps[i].startTime) / 1000);
      const obs: Observation = {
        currentAction: `屏幕操作 #${i + 1} (${duration}秒)`,
        actionPurpose: `第 ${i + 1} 段操作，持续 ${duration} 秒`,
        relevantSystem: 'unknown',
        isVariable: false,
      };
      observations.push(obs);
      trajectory.push({
        title: obs.currentAction,
        desc: obs.actionPurpose,
        tag: 'web',
        observation: obs,
      });
    }
  }

  return { observations, trajectory };
}

export interface TrajectoryStep {
  num: number;
  title: string;
  desc: string;
  tag: string;
  observation: Observation;
}

export async function generateSkillMd(
  trajectory: TrajectoryStep[],
): Promise<string> {
  const trajectoryText = trajectory
    .map(
      (t) =>
        `步骤 ${t.num}: ${t.title}\n  描述: ${t.desc}\n  系统: ${t.observation.relevantSystem}\n  是否为变量: ${t.observation.isVariable}${t.observation.isVariable ? ` (${t.observation.variableName})` : ''}`,
    )
    .join('\n\n');

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `你是一个工作流分析师。根据以下录制的操作轨迹，生成一份 SKILL.md 技能包。

SKILL.md 格式要求：
1. YAML frontmatter（--- 分隔符），包含：spec_version, skill (name/version/description), inputs, outputs, systems, config, variables
2. Markdown 正文，包含：概述（Overview）、前置条件（Prerequisites）、步骤（Steps，用 ### 编号，每步包含 type/description/action/output/on_error）、注意事项（Notes）

步骤类型（type）包括：navigate, action, observe, generate, wait, condition
- navigate: url 字段
- action: action (click/type/key_press) + text/keys 字段
- observe: action: screenshot + output 字段
- generate: prompt 字段 + output 字段

重要要求：
- 所有面向用户的文本必须使用中文，包括：skill name、description、步骤标题、步骤描述、概述、前置条件、注意事项等
- YAML frontmatter 中的 name 和 description 使用中文
- inputs 的 description 使用中文
- Markdown 正文全部使用中文撰写
- 仅变量名（variableName）和 type 字段使用英文
- 录制中的可变数据应提取为 inputs，并给出合适的类型
- 每个 input 必须包含 default 字段：填入一个从录制内容中提取的、合理的真实示例值（如具体网址、文档标题等），让用户可以直接使用而无需修改。default 用引号包裹。
- 每个 input 的 description 必须自带一个示例，格式为「<说明>，例如"<示例值>"」，例如：description: 竞品官网网址，例如"https://www.figma.com"

inputs 字段格式示例：
inputs:
  - name: competitorUrl
    type: string
    description: 竞品官网网址，例如"https://www.figma.com"
    default: "https://www.figma.com"
    required: true

轨迹：
${trajectoryText}

生成完整的 SKILL.md。仅输出 SKILL.md 内容，不要包含其他文字。`,
      },
    ],
  });

  const text = msg.content[0].type === 'text' ? (msg.content[0] as { type: 'text'; text: string }).text : '';
  // Strip a wrapping ```markdown ... ``` fence if the model added one.
  return text.replace(/^\s*```(?:markdown|md)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
}

export interface StepAction {
  type: string;
  action?: string;
  text?: string;
  url?: string;
  keys?: string;
  prompt?: string;
  coordinate?: [number, number];
}

export async function executeComputerUse(
  skillMd: string,
  stepIndex: number,
  inputs: Record<string, string>,
  prevOutputs: Record<string, unknown>,
  screenshotBase64?: string,
): Promise<{ output: string; screenshot?: string; action: StepAction }> {
  const steps = skillMd.split(/^### /m).slice(1);
  const rawStep = steps[stepIndex] || 'Unknown step';
  // Substitute {{var}} placeholders with the provided input values up-front so
  // the model receives concrete values (URLs, titles) rather than placeholders.
  const currentStep = rawStep.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) =>
    inputs[key] != null && inputs[key] !== '' ? String(inputs[key]) : m,
  );

  // Build a concise step summary instead of sending the entire SKILL.md
  const stepSummary = steps
    .map((s, i) => {
      const title = s.split('\n')[0]?.trim() || `Step ${i + 1}`;
      return `${i + 1}. ${title}${i === stepIndex ? ' ← current' : ''}`;
    })
    .join('\n');

  const userContent: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: `You are executing step ${stepIndex + 1} of ${steps.length} in a skill workflow.

Skill steps overview:
${stepSummary}

Inputs: ${JSON.stringify(inputs)}
Previous outputs: ${JSON.stringify(prevOutputs)}

Current step to execute:
### ${currentStep}

Determine the exact action to take. Output a JSON object:
{
  "action": {
    "type": "navigate" | "action" | "observe" | "generate",
    "action": "click" | "type" | "key_press" | "screenshot" (for action type),
    "text": "text to type or click target",
    "url": "URL to navigate to",
    "keys": "key combination",
    "prompt": "prompt for generation",
    "coordinate": [x, y] for click
  },
  "output": "description of what this step produces",
  "screenshot": true if you need a screenshot of the result
}

Output ONLY the JSON.`,
    },
  ];

  if (screenshotBase64) {
    const { mediaType, base64 } = stripDataUrl(screenshotBase64);
    validateImageSize(base64);
    userContent.unshift({
      type: 'image',
      source: { type: 'base64', media_type: mediaType as any, data: base64 },
    });
  }

  const msg = screenshotBase64
    ? await client.beta.messages.create({
        model: MODEL,
        max_tokens: 1024,
        betas: ['computer-use-2025-01-24'],
        tools: [
          {
            type: 'computer_20250124',
            name: 'computer',
            display_width_px: 1024,
            display_height_px: 768,
          },
        ],
        messages: [{ role: 'user', content: userContent }],
      })
    : await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: userContent }],
      });

  let output = '';
  let action: StepAction = { type: 'unknown' };

  for (const block of msg.content) {
    if (block.type === 'text') {
      const parsed = extractJson(block.text);
      if (parsed) {
        action = parsed.action || action;
        output = parsed.output || block.text;
      } else {
        output = block.text;
      }
    } else if (block.type === 'tool_use' && block.name === 'computer') {
      const input = block.input as Record<string, unknown>;
      action = {
        type: 'action',
        action: String(input.action || ''),
        coordinate: input.coordinate as [number, number] | undefined,
        text: input.text ? String(input.text) : undefined,
      };
      output = `Computer Use: ${input.action}${input.coordinate ? ` at [${(input.coordinate as number[]).join(',')}]` : ''}`;
    }
  }

  return { output, action };
}
