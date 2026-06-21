# SKILL Specification v1.0

## Overview

SKILL.md is the standard format for encoding a recorded workflow into a machine-readable, human-editable, parameterizable, and replayable skill package. It is the core artifact of the ReSkill platform.

**Design Principles:**
- Single source of truth: SKILL.md contains both the semantic description and the execution definition
- Human-readable first: any person can read, audit, and edit a SKILL.md without tooling
- Machine-executable: the execution engine can parse and replay a SKILL.md without ambiguity
- Progressive disclosure: high-level overview for quick scanning, detailed action definitions for replay

---

## File Format

SKILL.md uses **YAML frontmatter** + **Markdown body**. The frontmatter contains structured metadata; the Markdown body contains the human-readable description and step definitions.

```
---
<YAML frontmatter: metadata + schema>
---

<Markdown body: overview + steps>
```

---

## Frontmatter Schema

```yaml
spec_version: "1.0"              # SKILL spec version (independent of skill version)

skill:
  name: string                    # Required. Human-readable skill name
  version: string                 # Required. Semver format (e.g. "1.0.0")
  description: string             # Required. One-line summary of what this skill does
  author: string                  # Optional. Creator identifier
  tags: [string]                  # Optional. Categorization labels
  created_at: string              # Optional. ISO 8601 datetime
  updated_at: string              # Optional. ISO 8601 datetime

inputs:                           # Parameter schema (what the user provides)
  <param_name>:
    type: string | number | boolean | url | email | date | file
    required: boolean             # Default: false
    secret: boolean               # Default: false. Marks sensitive fields (passwords, tokens)
    default: any                  # Optional default value
    description: string           # Human-readable description
    examples: [any]               # Optional example values

outputs:                          # What this skill produces
  <output_name>:
    type: string | file | document | image
    description: string

systems:                          # External systems this skill interacts with
  - name: string                  # System name (e.g. "Chrome", "Notion")
    role: string                  # Role description (e.g. "竞品官网", "文档系统")

config:                           # Runtime configuration
  display_width_px: integer       # Default: 1024. Screen resolution for coordinate mapping
  display_height_px: integer      # Default: 768
  max_retries: integer            # Default: 3. Per-step retry limit
  step_timeout_sec: integer       # Default: 30. Per-step timeout
  screenshot_interval_sec: number # Default: 2. Auto-screenshot interval during recording

variables:                        # Workflow-level mutable state (initialized at start)
  <var_name>: any
```

---

## Markdown Body Structure

The Markdown body contains four sections in order:

```markdown
# {Skill Name}

## Overview
<High-level description of the workflow, its purpose, and expected outcome>

## Prerequisites
<Conditions that must be true before execution (e.g. "Chrome browser available", "Notion logged in")>

## Steps
<Structured step definitions — see Step Definition Format below>

## Notes
<Edge cases, limitations, and tips for execution>
```

---

## Step Definition Format

Each step is an H3 section (`###`) with structured fields. Steps are the single source of truth — the execution engine parses them directly.

### Step Types

| Type | Purpose | Key Fields |
|------|---------|------------|
| `action` | Execute a Computer Use action (click, type, scroll, etc.) | `action`, `coordinate`, `text`, `keys` |
| `observe` | Take a screenshot and optionally assert visual state | `action: screenshot`, `assertions` |
| `navigate` | Open a URL or switch to a tab | `url`, `target` |
| `condition` | Branch based on a variable or observation | `if`, `then`, `else` |
| `loop` | Iterate a sub-sequence | `over`, `steps` |
| `wait` | Delay or wait for a condition | `duration`, `until` |
| `sub-skill` | Invoke another SKILL.md | `skill`, `with` |
| `generate` | AI generates content (text, analysis, summary) | `prompt`, `output` |

### Step Syntax

```markdown
### {step_id}. {Step Title}

- type: {step_type}
- description: {What this step does, in plain language}
- action: {Computer Use action name}           # For type: action
- coordinate: [x, y]                           # For click/drag/scroll actions
- text: {text to type or click description}     # For type/click actions
- keys: {key combination}                       # For key_press actions
- url: {URL to navigate}                        # For type: navigate
- direction: up|down|left|right                 # For scroll actions
- amount: {integer}                             # For scroll actions
- input: {variable or literal}                  # Data consumed by this step
- output: {variable name}                       # Data produced by this step
- if: {condition expression}                    # Optional. Skip if false
- on_error: {error handling strategy}           # Optional. retry|skip|fail|fallback
- hint: {natural language guidance for AI}      # Optional. For AI interpretation flexibility
```

### Condition Expression Syntax

Simple expressions supported in `if` fields:

| Syntax | Meaning |
|--------|---------|
| `${var} == "value"` | Equality check |
| `${var} != "value"` | Inequality check |
| `${var} contains "text"` | String contains |
| `${var} matches "/regex/"` | Regex match |
| `${var} exists` | Variable is defined and non-empty |
| `${steps.N.output.field} == "value"` | Reference previous step output |

### Error Handling Strategies

| Strategy | Behavior |
|----------|----------|
| `retry` | Retry the step up to `config.max_retries` times |
| `skip` | Skip this step and continue to the next |
| `fail` | Halt execution and report error |
| `fallback: {step_id}` | Jump to an alternative step |
| `ask_user` | Pause and prompt user for manual intervention |

### Variable Interpolation

Template variables use `${variable_name}` syntax throughout step fields:

```
- Navigate to ${competitor_url}
- Type "${competitor_name} 竞品分析" in the title field
- If ${competitor_url} contains "figma.com"
```

**Rules:**
- `${var}` references an `inputs` parameter or a `variables` state field
- `${steps.N.output.field}` references a previous step's output
- Literal `${` must be escaped as `$${`
- Undefined variables cause a validation error before execution

---

## Complete Example: Competitive Analysis Skill

```yaml
---
spec_version: "1.0"

skill:
  name: "一键竞品分析"
  version: "1.0.0"
  description: "打开竞品官网截图，记录功能要点，生成含产品截图的竞品分析报告"
  author: "user"
  tags: ["竞品分析", "截图", "报告生成"]

inputs:
  competitor_name:
    type: string
    required: true
    description: "竞品产品名称"
    examples: ["Figma", "Sketch", "Notion"]
  competitor_url:
    type: url
    required: true
    description: "竞品官网地址"
    examples: ["https://figma.com"]

outputs:
  analysis_report:
    type: document
    description: "含产品截图的功能分析报告"

systems:
  - name: Chrome
    role: "竞品官网浏览与截图"
  - name: Notion
    role: "分析文档撰写"

config:
  display_width_px: 1024
  display_height_px: 768
  max_retries: 3
  step_timeout_sec: 30
  screenshot_interval_sec: 2

variables:
  homepage_screenshot: null
  features_screenshot: null
  pricing_screenshot: null
---
```

```markdown
# 一键竞品分析

## Overview
打开竞品官网，依次浏览首页、产品功能页、定价页并截图，将截图和分析要点写入 Notion 文档，最终生成一份含产品截图的功能分析报告。

## Prerequisites
- Chrome 浏览器可用
- Notion 已登录
- 网络连接正常

## Steps

### 1. open_competitor_site
- type: navigate
- description: "在 Chrome 中打开竞品官网"
- url: "${competitor_url}"
- output: current_page_url
- on_error: retry

### 2. screenshot_homepage
- type: observe
- description: "等待首页加载完成，截取首屏画面"
- action: screenshot
- output: homepage_screenshot
- if: "${current_page_url} contains '${competitor_url}'"
- hint: "等待页面完全加载后再截图，确保主要内容可见"

### 3. navigate_to_features
- type: action
- description: "点击导航栏进入产品功能页面"
- action: click
- text: "Product 或 Features 导航链接"
- hint: "导航标签可能是 Product、Features、Solutions 或产品名，根据实际页面选择"
- on_error: retry

### 4. screenshot_features
- type: observe
- description: "截取产品功能介绍页"
- action: screenshot
- output: features_screenshot
- hint: "如页面较长，向下滚动截取完整内容"

### 5. navigate_to_pricing
- type: action
- description: "点击导航栏进入定价页面"
- action: click
- text: "Pricing 导航链接"
- on_error:
    strategy: skip
    reason: "部分竞品不公开定价，跳过此步骤"

### 6. screenshot_pricing
- type: observe
- description: "截取定价方案页"
- action: screenshot
- output: pricing_screenshot
- if: "${steps.5.output} != 'skipped'"

### 7. open_notion
- type: navigate
- description: "切换至 Notion，新建分析文档"
- url: "notion.so"
- output: notion_page_ready

### 8. create_document
- type: action
- description: "新建文档，标题为 ${competitor_name} 竞品分析"
- action: type
- text: "${competitor_name} 竞品分析"
- hint: "在文档标题处输入"

### 9. insert_screenshots
- type: action
- description: "依次粘贴首页、功能页、定价页截图"
- action: key_press
- keys: "control+v"
- hint: "粘贴截图后，在每张截图下方添加分析要点"

### 10. generate_analysis
- type: generate
- description: "AI 综合截图和观察记录，生成竞品分析摘要"
- prompt: "基于以下截图和操作记录，生成一份结构化的竞品分析摘要：首页核心卖点、核心功能列表、定价策略、竞争定位判断"
- output: analysis_summary

### 11. save_document
- type: action
- description: "保存文档"
- action: key_press
- keys: "control+s"
- on_error: skip

## Notes
- 竞品网站结构差异大，导航标签名称不固定，AI 需根据实际页面灵活判断
- 如无 Pricing 页面，步骤 5-6 自动跳过，在报告中注明"未公开定价"
- 截图应包含完整页面内容，长页面需滚动后多张截图拼接
- 生成的分析摘要需用户确认后方可作为最终交付物
```

---

## Execution Engine Contract

The execution engine MUST:

1. **Validate** the SKILL.md before execution: check required inputs are provided, resolve variable references, verify step IDs are unique and sequential
2. **Parse** each step into an executable action: map `type` and `action` fields to Computer Use API calls
3. **Execute** steps in order, respecting `if` conditions and `on_error` strategies
4. **Capture** a screenshot after every action step for observability
5. **Track** outputs: store each step's `output` in the variables context for downstream reference
6. **Report** progress: emit step status (pending → running → done/failed/skipped) in real-time
7. **Pause** on `ask_user` errors: halt execution and prompt user for manual intervention, then resume
8. **Generate** the final deliverable by collecting all `outputs` into the declared `outputs` schema

---

## Versioning Rules

- `spec_version`: Incremented when the SKILL.md format itself changes in a breaking way
- `skill.version`: Incremented when the skill's steps, parameters, or behavior change
  - Major (X.0.0): Breaking change to inputs/outputs or step removal
  - Minor (0.X.0): New steps added, new optional inputs
  - Patch (0.0.X): Bug fixes in descriptions, hint improvements
