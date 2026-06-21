function normalizeBase(v: string | undefined): string {
  if (!v) return "http://localhost:3001";
  // Render's `host` property yields a bare hostname (no scheme) — add https://.
  if (!/^https?:\/\//.test(v)) return `https://${v}`;
  return v;
}

const API_URL = normalizeBase(process.env.NEXT_PUBLIC_API_URL);

export async function createSession() {
  const res = await fetch(`${API_URL}/api/sessions`, { method: "POST" });
  return res.json();
}

export async function getSession(id: string) {
  const res = await fetch(`${API_URL}/api/sessions/${id}`);
  return res.json();
}

export async function startRecording(sessionId: string) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/record`, { method: "POST" });
  return res.json();
}

export async function stopRecording(sessionId: string) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/stop`, { method: "POST" });
  return res.json();
}

export async function uploadFrame(sessionId: string, frame: { image: string; timestamp: string }) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/frames`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(frame),
  });
  return res.json();
}

export async function uploadEvent(sessionId: string, event: { type: string; timestamp: string; [key: string]: unknown }) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  return res.json();
}

export async function analyzeRecording(sessionId: string) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/analyze`, {
    method: "POST",
  });
  return res.json();
}

export async function generateSkill(sessionId: string) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/generate-skill`, {
    method: "POST",
  });
  return res.json();
}

export async function createSkill(data: { sessionId: string; name: string; content: string }) {
  const res = await fetch(`${API_URL}/api/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getSkill(id: string) {
  const res = await fetch(`${API_URL}/api/skills/${id}`);
  return res.json();
}

export async function updateSkill(id: string, data: { name?: string; content?: string }) {
  const res = await fetch(`${API_URL}/api/skills/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function validateSkill(id: string, inputs?: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/api/skills/${id}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs }),
  });
  return res.json();
}

export async function listSkills() {
  const res = await fetch(`${API_URL}/api/skills`);
  return res.json();
}

export async function createExecution(data: { skillId: string; sessionId: string; inputs: Record<string, unknown> }) {
  const res = await fetch(`${API_URL}/api/executions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getExecution(id: string) {
  const res = await fetch(`${API_URL}/api/executions/${id}`);
  return res.json();
}
