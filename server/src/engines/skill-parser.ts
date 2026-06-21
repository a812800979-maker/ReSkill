export interface ParsedInput {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
  examples?: string[];
}

export interface ParsedStep {
  id: string;
  type: string;
  description: string;
  action?: string;
  text?: string;
  url?: string;
  keys?: string;
  prompt?: string;
  output?: string;
  onError?: string;
  if?: string;
  hint?: string;
}

export interface ParsedSkill {
  name: string;
  version: string;
  description: string;
  inputs: ParsedInput[];
  outputs: Record<string, string>;
  steps: ParsedStep[];
  systems: { name: string; role: string }[];
  config: Record<string, unknown>;
}

// Strip markdown emphasis and surrounding quotes from a YAML/field value.
function clean(v: string): string {
  return v.trim().replace(/^\*\*|\*\*$/g, '').replace(/^["']|["']$/g, '').trim();
}

// Match a field within a block, tolerating markdown bold (- **key**: val) and
// plain (- key: val / key: val) forms.
function field(block: string, key: string): string | undefined {
  const re = new RegExp(`(?:^|\\n)\\s*[-*]?\\s*\\*{0,2}${key}\\*{0,2}\\s*:\\s*(.+)`, 'i');
  const m = block.match(re);
  return m ? clean(m[1]) : undefined;
}

export function parseSkillMd(mdText: string): ParsedSkill {
  // Frontmatter may be wrapped in a ```markdown fence — tolerate leading fence.
  const fmMatch = mdText.match(/---\n([\s\S]*?)\n---/);
  const frontmatter = fmMatch ? fmMatch[1] : '';

  const nameMatch = frontmatter.match(/name:\s*["']?(.+?)["']?\s*$/m);
  const versionMatch = frontmatter.match(/version:\s*["']?(.+?)["']?\s*$/m);
  const descMatch = frontmatter.match(/description:\s*["']?(.+?)["']?\s*$/m);

  return {
    name: nameMatch ? clean(nameMatch[1]) : 'Untitled',
    version: versionMatch ? clean(versionMatch[1]) : '1.0.0',
    description: descMatch ? clean(descMatch[1]) : '',
    inputs: parseInputs(frontmatter),
    outputs: parseOutputs(frontmatter),
    steps: parseSteps(mdText),
    systems: parseSystems(frontmatter),
    config: parseConfig(frontmatter),
  };
}

// Grab a top-level YAML section body (everything indented under `key:` until the
// next top-level key or end).
function section(fm: string, key: string): string | null {
  const re = new RegExp(`(?:^|\\n)${key}:\\s*\\n([\\s\\S]*?)(?=\\n\\S|$)`);
  const m = fm.match(re);
  return m ? m[1] : null;
}

function parseInputs(fm: string): ParsedInput[] {
  const body = section(fm, 'inputs');
  if (!body) return [];

  const inputs: ParsedInput[] = [];
  // Split into list items (- name: ...) — list form used by AI-generated skills.
  if (/^\s*-\s+name:/m.test(body)) {
    const items = body.split(/\n\s*-\s+/).map(s => s.trim()).filter(Boolean);
    for (const item of items) {
      const name = field(item, 'name');
      if (!name) continue;
      inputs.push({
        name,
        type: field(item, 'type') || 'string',
        required: field(item, 'required') !== 'false',
        description: field(item, 'description') || '',
        default: field(item, 'default'),
      });
    }
    return inputs;
  }

  // Fallback: key form (competitorUrl:\n  type: ...\n  description: ...)
  const lines = body.split('\n');
  let current: Partial<ParsedInput> | null = null;
  for (const line of lines) {
    const nameMatch = line.match(/^\s+(\w+):\s*$/);
    if (nameMatch) {
      if (current?.name) inputs.push(current as ParsedInput);
      current = { name: nameMatch[1], type: 'string', required: true, description: '' };
      continue;
    }
    if (!current) continue;
    const t = field(line, 'type'); if (t) current.type = t;
    const r = field(line, 'required'); if (r) current.required = r === 'true';
    const d = field(line, 'description'); if (d) current.description = d;
    const def = field(line, 'default'); if (def) current.default = def;
  }
  if (current?.name) inputs.push(current as ParsedInput);
  return inputs;
}

function parseOutputs(fm: string): Record<string, string> {
  const body = section(fm, 'outputs');
  if (!body) return {};
  const outputs: Record<string, string> = {};

  // List form: - name: x \n description: ...
  if (/^\s*-\s+name:/m.test(body)) {
    const items = body.split(/\n\s*-\s+/).map(s => s.trim()).filter(Boolean);
    for (const item of items) {
      const name = field(item, 'name');
      if (name) outputs[name] = field(item, 'description') || '';
    }
    return outputs;
  }

  // Key form
  const lines = body.split('\n');
  let currentName = '';
  for (const line of lines) {
    const nameMatch = line.match(/^\s+(\w+):\s*$/);
    if (nameMatch) { currentName = nameMatch[1]; continue; }
    const d = field(line, 'description');
    if (d && currentName) outputs[currentName] = d;
  }
  return outputs;
}

function parseSystems(fm: string): { name: string; role: string }[] {
  const body = section(fm, 'systems');
  if (!body) return [];
  const result: { name: string; role: string }[] = [];

  // Object form: - name: X \n role: Y
  const objBlocks = body.matchAll(/-\s*name:\s*["']?(.+?)["']?\n\s+role:\s*["'](.+?)["']/g);
  for (const m of objBlocks) result.push({ name: m[1].trim(), role: m[2] });
  if (result.length > 0) return result;

  // Simple list form: - 浏览器
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*-\s+(.+)/);
    if (m) result.push({ name: clean(m[1]), role: '' });
  }
  return result;
}

function parseConfig(fm: string): Record<string, unknown> {
  const body = section(fm, 'config');
  if (!body) return {};
  const config: Record<string, unknown> = {};
  for (const line of body.split('\n')) {
    const kv = line.match(/^\s+(\w+):\s*(.+)/);
    if (kv) {
      const val = clean(kv[2]);
      config[kv[1]] = isNaN(Number(val)) ? val : Number(val);
    }
  }
  return config;
}

function parseSteps(mdText: string): ParsedStep[] {
  // Tolerate English "## Steps" / Chinese "## 步骤" with optional trailing text
  // on the heading line (e.g. "## 步骤（Steps）"); stop at next ## section.
  const bodyMatch = mdText.match(/##\s*(?:Steps|步骤)[^\n]*\n([\s\S]*?)(?=\n##\s|\n```|$)/);
  if (!bodyMatch) return [];

  const steps: ParsedStep[] = [];
  const stepBlocks = bodyMatch[1].split(/^###\s+/m).slice(1);

  for (const block of stepBlocks) {
    const headerLine = block.split('\n')[0] || '';
    const numMatch = headerLine.match(/^(\d+)[.、]?\s*(.*)/);
    const stepType = field(block, 'type') || '';
    const step: ParsedStep = {
      id: numMatch ? `${numMatch[1]}.${stepType || 'step'}` : 'unknown',
      type: stepType,
      description: field(block, 'description') || (numMatch ? numMatch[2].trim() : ''),
    };

    const action = field(block, 'action'); if (action) step.action = action;
    const text = field(block, 'text'); if (text) step.text = text;
    const url = field(block, 'url'); if (url) step.url = url;
    const keys = field(block, 'keys'); if (keys) step.keys = keys;
    const prompt = field(block, 'prompt'); if (prompt) step.prompt = prompt;
    const output = field(block, 'output'); if (output) step.output = output;
    const onError = field(block, 'on_error') || field(block, 'onError'); if (onError) step.onError = onError;
    const hint = field(block, 'hint'); if (hint) step.hint = hint;

    steps.push(step);
  }

  return steps;
}
