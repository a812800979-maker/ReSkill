# ReSkill Architecture Document

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (Client)                        │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Next.js  │  │ getDisplay   │  │ WebSocket            │  │
│  │ Frontend │  │ Media()      │  │ (real-time updates)  │  │
│  │          │──│ Screen       │──│                      │  │
│  │ - Landing│  │ Capture      │  │ - Step progress      │  │
│  │ - Work-  │  │ - Video rec  │  │ - Observation feed   │  │
│  │   space  │  │ - Frame      │  │ - Chat messages      │  │
│  │ - Skill  │  │   extraction │  │                      │  │
│  │ - Exec   │  │ - Event      │  └──────────┬───────────┘  │
│  └────┬─────┘  │   capture    │             │               │
│       │        └──────────────┘             │               │
└───────┼──────────────────────────────────────┼───────────────┘
        │ REST API                             │ WS
        ▼                                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Node.js Backend                           │
│                                                              │
│  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌───────────┐ │
│  │ Session    │ │ Recording  │ │ Skill    │ │ Execution │ │
│  │ Manager    │ │ Processor  │ │ Engine   │ │ Engine    │ │
│  │            │ │            │ │          │ │           │ │
│  │ - Auth     │ │ - Frame    │ │ - Parse  │ │ - Replay  │ │
│  │ - State    │ │   extract  │ │ - Validate│ │ - Step    │ │
│  │ - History  │ │ - Event    │ │ - Generate│ │   runner  │ │
│  │            │ │   sequence │ │ - Edit    │ │ - Error   │ │
│  └────────────┘ └─────┬──────┘ └────┬─────┘ │   handler │ │
│                        │             │        └─────┬─────┘ │
│                        ▼             ▼              ▼       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 Claude API Client                     │   │
│  │                                                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │   │
│  │  │ Sonnet       │  │ Opus         │  │ Sonnet     │ │   │
│  │  │ (Real-time   │  │ (Skill gen & │  │ (Computer  │ │   │
│  │  │  observation)│  │  report gen) │  │  Use exec) │ │   │
│  │  └──────────────┘  └──────────────┘  └────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  Storage Layer                        │   │
│  │  - PostgreSQL: sessions, skills, recordings           │   │
│  │  - S3/R2: screenshots, videos, artifacts              │   │
│  │  - Redis: WebSocket state, execution progress         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Core Modules

### 1. Screen Capture Module (Client-side)

**Technology**: Browser `getDisplayMedia()` API

**Responsibilities:**
- Request screen/window sharing permission from user
- Record MediaStream as WebM video (MediaRecorder API)
- Extract frames at configurable intervals (default: 2s) using Canvas API
- Capture DOM events on the captured page (clicks, keystrokes, scrolls, URL changes)
- Stream frames to backend for real-time analysis
- Save full video recording for user playback

**Frame Extraction Pipeline:**
```
MediaStream → VideoTrack → Canvas.drawImage() → toDataURL('image/jpeg') → Base64 → Backend
```

**Event Capture (via content script injection):**
```javascript
// Captured events per action
{
  type: 'click' | 'keydown' | 'scroll' | 'navigation',
  timestamp: ISO_8601,
  target: { tag, id, className, text, href },
  position: { x, y },
  value: string,        // for keydown
  scroll: { x, y },     // for scroll
  url: string,          // for navigation
}
```

### 2. Recording Processor (Backend)

**Responsibilities:**
- Receive frames and events from client via WebSocket
- Send frames to Claude Sonnet for real-time observation
- Maintain an observation log (what the AI sees and infers)
- Build a trajectory: ordered sequence of (screenshot, event, AI interpretation) tuples
- Detect natural workflow boundaries (e.g. user switches apps, idle period > 10s)
- Store the full trajectory for skill generation

**Real-time Observation Prompt Pattern:**
```
You are observing a user's screen during a workflow recording.
The user is performing a task. Analyze the screenshot and event
to understand what the user is doing and why.

Current observation:
- Screenshot: [base64 image]
- Recent events: [event list]
- Previous context: [accumulated observations]

Output:
1. current_action: What the user just did (1 sentence)
2. action_purpose: Why they likely did it (1 sentence)
3. relevant_system: Which application/system they're using
4. is_variable: Whether this step involves variable data (true/false)
5. variable_name: If is_variable, suggest a parameter name
```

### 3. Skill Engine (Backend)

**Sub-modules:**

#### 3a. Skill Generator
- Input: Full trajectory (screenshots + events + observations)
- Process: Send trajectory to Claude Opus for semantic analysis
- Output: SKILL.md following the SKILL_SPEC v1.0 format

**Generation Prompt Pattern:**
```
You are a workflow analyst. Given the following recorded trajectory,
generate a SKILL.md skill package following the SKILL_SPEC v1.0 format.

Trajectory:
[Structured trajectory data with timestamps, screenshots, events, and observations]

Requirements:
1. Extract semantic steps from the trajectory (merge fine-grained events into meaningful actions)
2. Identify which elements are variable parameters vs fixed steps
3. Define inputs with proper types and descriptions
4. Define outputs (what the skill produces)
5. List systems involved
6. Add hints for steps where AI judgment is needed during replay
7. Add on_error strategies for steps that may fail
8. Write clear descriptions that a human can understand
```

#### 3b. Skill Parser
- Input: SKILL.md text
- Process: Parse YAML frontmatter + Markdown body into structured object
- Output: ParsedSkill object with validated steps, inputs, outputs, config
- Validates: required fields present, step IDs unique, variable references resolvable

#### 3c. Skill Validator
- Input: ParsedSkill + user-provided input values
- Process: Check all required inputs provided, types match, URLs valid
- Output: Validation result (pass/fail with details)

### 4. Execution Engine (Backend)

**Responsibilities:**
- Parse SKILL.md into an execution plan
- Execute steps sequentially using Claude Computer Use
- Track step progress and emit real-time updates via WebSocket
- Handle errors per step's `on_error` strategy
- Support pause/resume and manual takeover

**Execution Loop:**
```
for each step in SKILL.steps:
  1. Check `if` condition → skip if false
  2. Map step type to Computer Use action:
     - action → computer tool call (click/type/scroll/key_press)
     - observe → screenshot + assertion check
     - navigate → open URL in browser
     - wait → sleep or poll condition
     - generate → Claude text generation
     - condition → evaluate expression, choose branch
  3. Execute action via Computer Use API
  4. Capture screenshot after action
  5. Store output in variables context
  6. Emit step status update via WebSocket
  7. If error → apply on_error strategy
  8. If on_error is ask_user → pause, wait for user input
```

**Computer Use Action Mapping:**

| SKILL step type + action | Computer Use API call |
|--------------------------|-----------------------|
| type: action, action: click | `computer(action="click", coordinate=[x,y])` |
| type: action, action: type | `computer(action="type", text="...")` |
| type: action, action: key_press | `computer(action="key_press", keys="control+c")` |
| type: action, action: scroll | `computer(action="scroll", coordinate=[x,y], direction="down")` |
| type: observe, action: screenshot | `computer(action="screenshot")` |
| type: navigate | Open URL via browser automation, then screenshot |
| type: generate | Claude text API call with prompt |
| type: wait | Poll with screenshot until condition met |

## Data Model

### Session
```typescript
interface Session {
  id: string
  userId: string
  status: 'idle' | 'recording' | 'generating' | 'ready' | 'executing' | 'completed' | 'failed'
  createdAt: Date
  updatedAt: Date
}
```

### Recording
```typescript
interface Recording {
  id: string
  sessionId: string
  videoUrl: string           // S3/R2 URL for the full recording
  duration: number            // Seconds
  frameCount: number
  events: RecordingEvent[]    // Captured user events
  observations: Observation[] // AI-generated observations
  trajectory: TrajectoryStep[]
}
```

### TrajectoryStep
```typescript
interface TrajectoryStep {
  id: string
  timestamp: Date
  screenshotUrl: string       // S3/R2 URL
  event?: CapturedEvent
  observation: {
    currentAction: string
    actionPurpose: string
    relevantSystem: string
    isVariable: boolean
    variableName?: string
  }
}
```

### Skill
```typescript
interface Skill {
  id: string
  sessionId: string
  name: string
  version: string
  content: string             // Raw SKILL.md text
  parsedContent: ParsedSkill  // Structured parse result
  status: 'draft' | 'validated' | 'published'
  createdAt: Date
  updatedAt: Date
}
```

### Execution
```typescript
interface Execution {
  id: string
  skillId: string
  sessionId: string
  inputs: Record<string, any>
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed'
  stepResults: StepResult[]
  outputs: Record<string, any>
  startedAt: Date
  completedAt?: Date
}

interface StepResult {
  stepId: string
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  screenshotUrl?: string
  output?: any
  error?: string
  startedAt: Date
  completedAt?: Date
}
```

## API Design

### REST Endpoints

```
POST   /api/sessions                    # Create new session
GET    /api/sessions/:id                # Get session details
GET    /api/sessions/:id/recordings     # List recordings for session

POST   /api/sessions/:id/record         # Start recording
POST   /api/sessions/:id/stop           # Stop recording
POST   /api/sessions/:id/frames         # Upload captured frame
POST   /api/sessions/:id/events         # Upload captured event

POST   /api/sessions/:id/generate-skill # Generate SKILL.md from trajectory
GET    /api/skills/:id                   # Get skill
PUT    /api/skills/:id                   # Update skill (edit)
POST   /api/skills/:id/validate         # Validate skill + inputs

POST   /api/skills/:id/execute          # Start execution
POST   /api/executions/:id/pause        # Pause execution
POST   /api/executions/:id/resume       # Resume execution
POST   /api/executions/:id/takeover     # Manual takeover at current step

GET    /api/skills                       # List all skills
```

### WebSocket Events

```
Client → Server:
  recording:frame       { sessionId, frameData, timestamp }
  recording:event       { sessionId, event }
  execution:input       { executionId, userInput }

Server → Client:
  observation:new       { observation }
  trajectory:step       { step }
  skill:generating      { progress }
  skill:generated       { skillId }
  execution:progress    { stepId, status, screenshot }
  execution:paused      { stepId, reason }
  execution:completed   { outputs }
  execution:failed      { stepId, error }
```

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS | SSR, file-based routing, React Server Components |
| Backend | Node.js + Fastify | Fast, TypeScript-native, WebSocket support |
| Database | PostgreSQL (via Supabase) | Relational, auth built-in, generous free tier |
| Object Storage | Cloudflare R2 | S3-compatible, no egress fees |
| Cache/Queue | Redis (Upstash) | Serverless Redis for WebSocket state |
| AI - Observation | Claude Sonnet 4 | Fast, cost-efficient for real-time frame analysis |
| AI - Generation | Claude Opus 4 | Highest quality for skill generation and reports |
| AI - Execution | Claude Sonnet 4 + Computer Use | Responsive execution with screen control |
| Deployment | Vercel (frontend) + Fly.io (backend) | Edge-first frontend, container-native backend |
| Auth | Supabase Auth | Email/OAuth, JWT, row-level security |

## Security Considerations

1. **Screenshot privacy**: All screenshots are encrypted at rest (R2 server-side encryption). User must explicitly consent before each recording session.
2. **API key storage**: Claude API keys stored in environment variables, never exposed to client.
3. **Input sanitization**: All user inputs validated server-side before interpolation into SKILL.md templates.
4. **Session isolation**: Each recording session is isolated; WebSocket connections authenticated per session.
5. **Secret parameters**: Input fields marked `secret: true` are never logged, stored in encrypted form, and masked in UI.
6. **Rate limiting**: API endpoints rate-limited per user to prevent abuse.
