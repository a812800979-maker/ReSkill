"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import * as api from "@/lib/api";
import { startScreenCapture, startFrameExtraction, startVideoRecording } from "@/lib/screen-capture";
import { createWSClient } from "@/lib/websocket";

type RecordingState = "idle" | "recording" | "paused" | "stopped";
type RightTab = "obs" | "traj";
type AppMode = "demo" | "real";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tool?: { type: string; text: string };
}

interface Observation {
  id: string;
  app: string;
  text: string;
  time: string;
}

interface TrajectoryStep {
  id: string;
  num: number;
  title: string;
  desc: string;
  tag: string;
}

interface RecSession {
  id: string;
  name: string;
  status: "recording" | "done" | "idle";
  time: string;
}

interface SkillData {
  name: string;
  systems: string;
  stepCount: number;
  params: { name: string; desc: string; label?: string; example?: string; defaultValue?: string }[];
  md: string;
  execSteps: { text: string; chat: string; duration: number }[];
}

// Split a parameter description into a label (the explanation) and an example
// placeholder. AI descriptions look like: 提交给TRAE的任务内容，例如"每日抓取热榜top50"
function splitParamDesc(desc: string): { label: string; example: string } {
  const m = desc.match(/^(.*?)[，,。]?\s*(?:例如|如|比如|e\.g\.?)[:：]?\s*(.+)$/i);
  if (m && m[2]) {
    return { label: m[1].trim().replace(/[（(]$/, '').trim(), example: m[2].trim().replace(/^["'“”]|["'“”]$/g, '').replace(/[）)]$/, '').trim() };
  }
  return { label: desc.trim(), example: '' };
}

const CASES: Record<string, {
  name: string;
  poster: string;
  script: { delay: number; chat?: { role: "user" | "assistant"; text: string; tool?: { type: string; text: string } }; obs?: { app: string; text: string }; traj?: { title: string; desc: string; tag: string } }[];
  skill: SkillData;
}> = {
  competitor: {
    name: "一键竞品分析",
    poster: "/case-covers/competitor.png",
    script: [
      { delay: 600, chat: { role: "user", text: "开始录制" } },
      { delay: 1000, chat: { role: "assistant", text: "录制已开始！我将通过 Computer Use 观察你的屏幕操作。请像平时一样完成竞品分析流程。", tool: { type: "computer", text: "已激活屏幕观察模式" } }, obs: { app: "系统", text: "录制模式已激活" } },
      { delay: 2200, chat: { role: "assistant", text: "检测到你打开了竞品官网 Notion.so。", tool: { type: "computer", text: "截屏分析：当前页面 = Notion 官网 (notion.so)" } }, obs: { app: "Chrome", text: "用户打开竞品官网 Notion.so" }, traj: { title: "打开竞品官网", desc: "导航至 {{competitor_url}}", tag: "web" } },
      { delay: 2000, chat: { role: "assistant", text: "你正在浏览首页，我截取了首屏画面。", tool: { type: "screenshot", text: "截屏保存：首页截图 → homepage.png" } }, obs: { app: "Chrome", text: "浏览竞品首页，截取首屏画面" }, traj: { title: "截图首页", desc: "浏览首页并截取首屏", tag: "capture" } },
      { delay: 2400, chat: { role: "assistant", text: "你点击了「Product」导航，进入产品功能页面。", tool: { type: "screenshot", text: "截屏保存：产品功能页 → features.png" } }, obs: { app: "Chrome", text: "导航至产品功能页，截取功能介绍" }, traj: { title: "截图产品功能页", desc: "点击 Product，截取功能介绍页", tag: "capture" } },
      { delay: 2200, chat: { role: "assistant", text: "你点击了「Pricing」进入定价页面。", tool: { type: "screenshot", text: "截屏保存：定价页面 → pricing.png" } }, obs: { app: "Chrome", text: "导航至定价页面，截取定价方案" }, traj: { title: "截图定价页", desc: "点击 Pricing，截取定价方案", tag: "capture" } },
      { delay: 2000, chat: { role: "assistant", text: "你切换到了 Notion 文档系统，新建了一个竞品分析文档。", tool: { type: "computer", text: "窗口切换：Chrome → Notion" } }, obs: { app: "Notion", text: "切换至 Notion，新建竞品分析文档" }, traj: { title: "打开文档系统", desc: "切换至 Notion 新建分析文档", tag: "doc" } },
      { delay: 2600, chat: { role: "assistant", text: "你将截图逐一粘贴到文档中，并为每张截图添加了分析要点。", tool: { type: "analysis", text: "语义分析：竞品名称和地址为可变参数 → {{competitor_name}}, {{competitor_url}}" } }, obs: { app: "Notion", text: "粘贴截图并记录分析要点" }, traj: { title: "记录分析要点", desc: "粘贴截图到文档，记录功能要点和分析", tag: "doc" } },
      { delay: 1600, chat: { role: "assistant", text: "录制完成！我观察到你完成了一次完整的「竞品分析」工作流，涉及 Chrome 和 Notion 两个系统。可以停止录制并生成 Skill 了。" }, obs: { app: "系统", text: "工作流录制完成" } },
    ],
    skill: {
      name: "一键竞品分析", systems: "Chrome / Notion", stepCount: 6,
      params: [
        { name: "competitor_name", desc: "竞品产品名称，如 \"Figma\"、\"Sketch\"" },
        { name: "competitor_url", desc: "竞品官网地址，如 \"https://figma.com\"" },
      ],
      md: `---\nname: 一键竞品分析\nversion: 1.0\nsystems:\n  - Chrome (竞品官网)\n  - Notion (文档系统)\nparameters:\n  - name: competitor_name\n    type: string\n    required: true\n  - name: competitor_url\n    type: string\n    required: true\n---\n\n# 一键竞品分析\n\n## 概述\n打开竞品官网，依次浏览首页、产品功能页、定价页并截图，将截图和分析要点写入 Notion 文档，最终生成一份含产品截图的功能分析报告。\n\n## 步骤\n\n### 1. 打开竞品官网\n- 操作：在 Chrome 打开 {{competitor_url}}\n- 类型：可变参数\n\n### 2. 浏览并截图首页\n- 操作：等待首页加载完成，截取首屏画面\n- 类型：固定步骤\n\n### 3. 浏览并截图产品功能页\n- 操作：点击 "Product" 或 "Features" 导航，截取功能介绍页\n- 类型：固定步骤\n\n### 4. 浏览并截图定价页\n- 操作：点击 "Pricing" 导航，截取定价方案\n- 类型：固定步骤\n\n### 5. 打开 Notion 新建文档\n- 操作：切换至 Notion，新建页面，标题 "{{competitor_name}} 竞品分析"\n- 类型：可变参数\n\n### 6. 粘贴截图并记录要点\n- 操作：依次粘贴截图，为每张截图添加分析要点\n- 类型：固定步骤`,
      execSteps: [
        { text: "打开竞品官网", chat: "正在打开 {{competitor_url}} ...", duration: 1800 },
        { text: "浏览并截图首页", chat: "首页已加载，截取首屏画面 → homepage.png", duration: 2000 },
        { text: "浏览并截图产品功能页", chat: "点击 Product，截取功能介绍页 → features.png", duration: 2200 },
        { text: "浏览并截图定价页", chat: "点击 Pricing，截取定价方案 → pricing.png", duration: 1800 },
        { text: "打开 Notion 新建文档", chat: "切换至 Notion，新建文档「{{competitor_name}} 竞品分析」", duration: 1500 },
        { text: "粘贴截图并记录要点", chat: "将截图粘贴到文档，逐项添加分析要点...", duration: 2500 },
      ],
    },
  },
  ticket: {
    name: "工单自动答疑",
    poster: "/case-covers/ticket.png",
    script: [
      { delay: 600, chat: { role: "user", text: "开始录制" } },
      { delay: 1000, chat: { role: "assistant", text: "录制已开始！我将通过 Computer Use 观察你的屏幕操作。请像平时一样完成工单答疑流程。", tool: { type: "computer", text: "已激活屏幕观察模式" } }, obs: { app: "系统", text: "录制模式已激活" } },
      { delay: 2200, chat: { role: "assistant", text: "检测到你打开了工单管理系统。", tool: { type: "computer", text: "截屏分析：当前页面 = 工单列表" } }, obs: { app: "工单系统", text: "用户打开工单管理系统" }, traj: { title: "打开工单系统", desc: "导航至 {{ticket_system_url}}", tag: "web" } },
      { delay: 2000, chat: { role: "assistant", text: "你点击了一个待处理的工单，正在阅读工单内容。", tool: { type: "screenshot", text: "截屏保存：工单详情 → ticket_detail.png" } }, obs: { app: "工单系统", text: "打开待处理工单，阅读问题描述" }, traj: { title: "阅读工单内容", desc: "点击工单查看 {{ticket_title}} 详细内容", tag: "capture" } },
      { delay: 2600, chat: { role: "assistant", text: "你切换到了知识库文档，搜索相关解决方案。", tool: { type: "computer", text: "窗口切换：工单系统 → 知识库 (confluence.internal)" } }, obs: { app: "知识库", text: "切换至知识库，搜索相关问题解决方案" }, traj: { title: "搜索知识库", desc: "在知识库中搜索 {{ticket_title}} 相关方案", tag: "doc" } },
      { delay: 2000, chat: { role: "assistant", text: "你找到了相关文档，复制了解决方案内容。", tool: { type: "analysis", text: "语义分析：工单标题和内容为可变参数 → {{ticket_title}}, {{ticket_content}}" } }, obs: { app: "知识库", text: "找到相关解决方案文档，复制内容" }, traj: { title: "定位解决方案", desc: "找到匹配文档并复制解决方案", tag: "doc" } },
      { delay: 2400, chat: { role: "assistant", text: "你切回工单系统，在回复框中粘贴了解决方案，并根据工单内容做了个性化调整。", tool: { type: "computer", text: "窗口切换：知识库 → 工单系统，写入回复内容" } }, obs: { app: "工单系统", text: "切回工单系统，编写并发送回复" }, traj: { title: "编写并发送回复", desc: "粘贴解决方案，调整措辞后发送", tag: "web" } },
      { delay: 1600, chat: { role: "assistant", text: "录制完成！我观察到你完成了一次「工单答疑」工作流，涉及工单系统和知识库。可以停止录制并生成 Skill 了。" }, obs: { app: "系统", text: "工作流录制完成" } },
    ],
    skill: {
      name: "工单自动答疑", systems: "工单系统 / 知识库", stepCount: 5,
      params: [
        { name: "ticket_title", desc: "工单标题或关键词，如 \"登录失败\"" },
        { name: "ticket_system_url", desc: "工单系统地址，如 \"https://support.internal\"" },
      ],
      md: `---\nname: 工单自动答疑\nversion: 1.0\nsystems:\n  - 工单系统\n  - 知识库 (Confluence)\nparameters:\n  - name: ticket_title\n    type: string\n    required: true\n  - name: ticket_system_url\n    type: string\n    required: true\n---\n\n# 工单自动答疑\n\n## 概述\n打开工单系统，阅读待处理工单内容，在知识库中搜索相关解决方案，将方案粘贴到工单回复并发送。\n\n## 步骤\n\n### 1. 打开工单系统\n- 操作：导航至 {{ticket_system_url}}\n- 类型：可变参数\n\n### 2. 查看待处理工单\n- 操作：点击工单列表中的待处理工单，阅读 {{ticket_title}} 的详细内容\n- 类型：可变参数\n\n### 3. 搜索知识库\n- 操作：切换至知识库，搜索 {{ticket_title}} 相关解决方案\n- 类型：可变参数\n\n### 4. 定位解决方案\n- 操作：在搜索结果中找到匹配文档，复制解决方案内容\n- 类型：固定步骤\n\n### 5. 编写并发送回复\n- 操作：切回工单系统，粘贴解决方案，根据工单内容调整措辞后发送\n- 类型：固定步骤`,
      execSteps: [
        { text: "打开工单系统", chat: "正在打开 {{ticket_system_url}} ...", duration: 1800 },
        { text: "查看待处理工单", chat: "打开工单「{{ticket_title}}」，阅读详情...", duration: 2000 },
        { text: "搜索知识库", chat: "切换至知识库，搜索「{{ticket_title}}」相关方案...", duration: 2200 },
        { text: "定位解决方案", chat: "找到匹配文档，复制解决方案内容", duration: 1800 },
        { text: "编写并发送回复", chat: "切回工单系统，粘贴方案并发送回复", duration: 2000 },
      ],
    },
  },
};

function replaceParams(text: string, values: Record<string, string>) {
  let result = text;
  Object.entries(values).forEach(([k, v]) => {
    result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v || k);
  });
  return result;
}

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const verifyMode = searchParams.get("verify") === "true";
  const skillIdParam = searchParams.get("skillId");
  const caseParam = searchParams.get("case");

  const [mode, setMode] = useState<AppMode>("real");
  const [recState, setRecState] = useState<RecordingState>("idle");
  const [rightTab, setRightTab] = useState<RightTab>("obs");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: "欢迎来到 ReSkill 工作台！录制你的操作流程，我会自动分析并生成可复用的 Skill 技能包。" },
  ]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [trajectory, setTrajectory] = useState<TrajectoryStep[]>([]);
  const [sessions, setSessions] = useState<RecSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showStartCard, setShowStartCard] = useState(true);
  const [showCaseCards, setShowCaseCards] = useState(true);
  const [inputText, setInputText] = useState("");
  const [currentCase, setCurrentCase] = useState<string | null>(null);
  const [currentSkill, setCurrentSkill] = useState<SkillData | null>(null);
  const [skillPill, setSkillPill] = useState<string | null>(null);
  const [showParamPopup, setShowParamPopup] = useState(false);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [execSteps, setExecSteps] = useState<{ text: string; status: "pending" | "running" | "done" }[]>([]);
  const [execRunning, setExecRunning] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [videoDuration, setVideoDuration] = useState("");
  const [videoName, setVideoName] = useState("");
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoPoster, setVideoPoster] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);

  const simTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const captureStopRef = useRef<{ stop: () => void } | null>(null);
  const frameStopRef = useRef<{ stop: () => void } | null>(null);
  const videoRecorderRef = useRef<{ stop: () => Promise<Blob> } | null>(null);
  const recStartTimeRef = useRef<number>(0);
  const wsRef = useRef<ReturnType<typeof createWSClient> | null>(null);
  const execPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoRunningRef = useRef(false);

  const addMessage = useCallback((role: "user" | "assistant", text: string, tool?: { type: string; text: string }) => {
    setMessages(prev => [...prev, { id: `msg_${Date.now()}_${Math.random()}`, role, text, tool }]);
  }, []);

  const addObservation = useCallback((app: string, text: string) => {
    const t = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setObservations(prev => [{ id: `obs_${Date.now()}`, app, text, time: t }, ...prev]);
  }, []);

  const addTrajectoryStep = useCallback((title: string, desc: string, tag: string) => {
    setTrajectory(prev => [...prev, { id: `traj_${Date.now()}`, num: prev.length + 1, title, desc, tag }]);
  }, []);

  const finishSession = useCallback((name: string) => {
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, status: "done" as const, name } : s));
  }, [activeSessionId]);

  // Handle verify mode on load
  useEffect(() => {
    if (!verifyMode) return;

    if (skillIdParam) {
      setMode("real");
      api.getSkill(skillIdParam).then(async (skill: any) => {
        if (!skill || skill.error) {
          addMessage("assistant", "无法加载 Skill 数据。");
          return;
        }
        // Verify mode has no recording session yet — create one so real
        // execution (which needs a sessionId) can run instead of demo sim.
        try {
          const session = await api.createSession();
          setActiveSessionId(session.id);
        } catch { /* execution will surface the error if this fails */ }
        const params = skill.parsedInputs?.length > 0
          ? skill.parsedInputs.map((p: any) => {
              const { label, example } = splitParamDesc(p.description || p.type || "");
              return { name: p.name, desc: p.description || p.type, label, example, defaultValue: p.default || "" };
            })
          : [{ name: "input_1", desc: "请输入参数", label: "请输入参数", example: "" }];
        const skillData: SkillData = {
          name: skill.name,
          systems: skill.parsedSteps?.map((_: any) => _.type).join(" / ") || "unknown",
          stepCount: skill.parsedSteps?.length || 0,
          params,
          md: skill.content,
          execSteps: skill.parsedSteps?.map((s: any) => ({
            text: s.description || s.id,
            chat: `正在执行：${s.description || s.id}...`,
            duration: 2000,
          })) || [],
        };
        setCurrentSkill(skillData);
        // Prefill default values so the user can run directly without editing.
        setParamValues(Object.fromEntries(params.map((p: any) => [p.name, p.defaultValue || ""])));
        setSkillPill(skillData.name);
        setShowCaseCards(false);
        setShowStartCard(false);
        addMessage("assistant", `已载入技能「${skillData.name}」。填写下方变量参数并启动后，AI 会用这个技能自动代你完成这项重复操作，直接产出交付成果——无需你再手动操作一遍。`);
        setTimeout(() => setShowParamPopup(true), 600);
      }).catch(() => {
        addMessage("assistant", "无法连接后端加载 Skill。请确认后端服务正在运行。");
      });
    } else if (caseParam && CASES[caseParam]) {
      const skill = CASES[caseParam].skill;
      setCurrentSkill(skill);
      setSkillPill(skill.name);
      setShowCaseCards(false);
      setShowStartCard(false);
      addMessage("assistant", `已载入技能「${skill.name}」。填写下方变量参数并启动后，AI 会用这个技能自动代你完成这项重复操作，直接产出交付成果——无需你再手动操作一遍。`);
      setTimeout(() => setShowParamPopup(true), 600);
    }
  }, [verifyMode, skillIdParam, caseParam, addMessage]);

  // Setup WebSocket for real mode
  useEffect(() => {
    if (mode !== "real" || !activeSessionId) return;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
    const ws = createWSClient(`${wsUrl}/ws?sessionId=${activeSessionId}`);
    wsRef.current = ws;

    ws.on("observation:new", (data: any) => {
      addObservation(data.relevantSystem || "unknown", data.currentAction || "");
    });
    ws.on("trajectory:step", (data: any) => {
      addTrajectoryStep(data.title || "Step", data.desc || "", data.tag || "web");
    });
    ws.on("execution:progress", (data: any) => {
      setExecSteps(prev => {
        const updated = [...prev];
        if (data.stepIndex !== undefined && updated[data.stepIndex]) {
          updated[data.stepIndex] = { ...updated[data.stepIndex], status: data.status === "done" ? "done" : data.status === "running" ? "running" : updated[data.stepIndex].status };
        }
        return updated;
      });
      if (data.description) addMessage("assistant", data.description);
    });
    ws.on("execution:completed", (data: any) => {
      setExecRunning(false);
      addMessage("assistant", `执行完毕！`);
      if (execPollRef.current) clearInterval(execPollRef.current);
    });
    ws.on("execution:failed", (data: any) => {
      setExecRunning(false);
      addMessage("assistant", `执行失败：${data.error || "未知错误"}`);
      if (execPollRef.current) clearInterval(execPollRef.current);
    });

    return () => { ws.close(); wsRef.current = null; };
  }, [mode, activeSessionId, addMessage, addObservation, addTrajectoryStep]);

  // Demo: play a preset case
  const playCase = useCallback((caseId: string) => {
    const caseData = CASES[caseId];
    if (!caseData) return;
    setMode("demo");
    setRecState("recording");
    setCurrentCase(caseId);
    setShowStartCard(false);
    setShowCaseCards(false);

    const sid = `rec_${Date.now()}`;
    setActiveSessionId(sid);
    setSessions(prev => [...prev, { id: sid, name: caseData.name, status: "recording" as const, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }]);

    const recordStartTime = Date.now();
    let i = 0;
    function next() {
      if (i >= caseData.script.length) {
        const elapsed = Math.round((Date.now() - recordStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        setRecState("stopped");
        finishSession(caseData.name);
        setShowVideo(true);
        setVideoPoster(caseData.poster);
        setVideoDuration(minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`);
        setVideoName(caseData.name);
        addMessage("assistant", "录制已完成，以下是本次录制的屏幕回放：");
        return;
      }
      const step = caseData.script[i];
      if (step.chat) addMessage(step.chat.role, step.chat.text, step.chat.tool);
      if (step.obs) addObservation(step.obs.app, step.obs.text);
      if (step.traj) addTrajectoryStep(step.traj.title, step.traj.desc, step.traj.tag);
      i++;
      simTimerRef.current = setTimeout(next, step.delay || 1500);
    }
    simTimerRef.current = setTimeout(next, 400);
  }, [addMessage, addObservation, addTrajectoryStep, finishSession]);

  // Real: start recording with screen capture
  const startRealRecording = useCallback(async () => {
    if (recState === "recording") return;
    setMode("real");
    setVideoPoster(null); // clear any leftover case-demo poster before a real recording

    try {
      // 1. Get screen stream FIRST (before any await) — browser requires user gesture context
      const { stream, stop: stopCapture } = await startScreenCapture();
      captureStopRef.current = { stop: stopCapture };

      // 2. Start video recording (MediaRecorder) for playback later
      const videoRecorder = startVideoRecording(stream);
      videoRecorderRef.current = videoRecorder;

      // 3. Record start time for duration display
      recStartTimeRef.current = Date.now();

      // 4. Now safe to do async backend calls
      const session = await api.createSession();
      const sid = session.id;
      setActiveSessionId(sid);
      setSessions(prev => [...prev, { id: sid, name: `新录制 ${prev.length + 1}`, status: "recording" as const, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }]);

      await api.startRecording(sid);

      const { stop: stopFrames } = startFrameExtraction(
        stream,
        async (base64) => {
          try {
            const res = await api.uploadFrame(sid, { image: base64, timestamp: new Date().toISOString() });
            const obs = res?.observation;
            if (obs?.currentAction) {
              addObservation(obs.relevantSystem || "系统", obs.currentAction);
              if (obs.isVariable && obs.variableName) {
                addTrajectoryStep(obs.currentAction, `变量: ${obs.variableName} — ${obs.actionPurpose || ""}`, obs.relevantSystem || "web");
              }
            } else {
              addObservation("系统", "截图已保存");
            }
          } catch {
            addObservation("系统", "截图上传失败");
          }
        },
        (error) => {
          addMessage("assistant", `⚠ 屏幕捕获异常：${error}。请尝试停止并重新录制。`);
        },
        3000,
      );
      frameStopRef.current = { stop: stopFrames };

      addMessage("user", "开始录制");
      addMessage("assistant", "请开始你的操作！AI 会在录制过程中实时观察并分析你的每一步操作。完成后点击「停止录制」。", { type: "computer", text: "已激活屏幕录制模式" });
      setRecState("recording");
      setShowStartCard(false);
      setShowCaseCards(false);
    } catch (err: any) {
      const msg = err.name === "NotAllowedError"
        ? "你拒绝了屏幕共享权限，请在浏览器弹窗中点击「允许」"
        : err.name === "NotFoundError"
        ? "未找到可共享的屏幕，请确认有可用的显示器"
        : err.name === "NotReadableError"
        ? "屏幕源无法读取，可能是系统安全策略限制"
        : `启动录制失败：${err.message || "请确认浏览器允许屏幕共享权限"}`;
      addMessage("assistant", msg);
    }
  }, [recState, addMessage, addObservation, addTrajectoryStep]);

  const togglePause = useCallback(() => {
    setRecState(prev => prev === "recording" ? "paused" : prev === "paused" ? "recording" : prev);
  }, []);

  const stopRecording = useCallback(async () => {
    if (simTimerRef.current) clearTimeout(simTimerRef.current);

    // Calculate duration from actual start time
    const elapsed = recStartTimeRef.current ? Math.round((Date.now() - recStartTimeRef.current) / 1000) : 0;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    if (mode === "real" && activeSessionId) {
      // Stop video recorder FIRST to capture the full recording before stream ends
      let blobUrl: string | null = null;
      if (videoRecorderRef.current) {
        try {
          const blob = await videoRecorderRef.current.stop();
          blobUrl = URL.createObjectURL(blob);
          setVideoBlobUrl(blobUrl);
        } catch { /* ignore video recorder errors */ }
        videoRecorderRef.current = null;
      }

      // Then stop frame extraction and capture stream
      frameStopRef.current?.stop();
      captureStopRef.current?.stop();

      try { await api.stopRecording(activeSessionId); } catch { /* ignore */ }
    }

    setRecState("stopped");
    const skillName = mode === "demo" && currentCase && CASES[currentCase] ? CASES[currentCase].name : "自定义工作流录制";
    finishSession(skillName);
    setShowVideo(true);
    setVideoDuration(durationStr);
    setVideoName(skillName);

    // Trigger offline analysis for real mode
    if (mode === "real" && activeSessionId) {
      setAnalyzing(true);
      addMessage("assistant", "录制已停止。正在离线分析你的操作轨迹...");
      try {
        const result = await api.analyzeRecording(activeSessionId);
        if (result.observations && result.observations.length > 0) {
          // Replace placeholder observations with analyzed ones
          const analyzedObs = result.observations.map((obs: any) => ({
            id: `obs_${Date.now()}_${Math.random()}`,
            app: obs.relevantSystem || "unknown",
            text: obs.currentAction || "操作",
            time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          }));
          setObservations(analyzedObs);
        }
        if (result.trajectory && result.trajectory.length > 0) {
          const analyzedTraj = result.trajectory.map((step: any, i: number) => ({
            id: `traj_${Date.now()}_${i}`,
            num: i + 1,
            title: step.title || `步骤 ${i + 1}`,
            desc: step.desc || "",
            tag: step.tag || "web",
          }));
          setTrajectory(analyzedTraj);
        }
        addMessage("assistant", `分析完成！识别到 ${result.trajectory?.length || 0} 个操作步骤。你可以点击「生成 Skill」来创建技能包。`, { type: "analysis", text: `共 ${result.frameCount || 0} 帧截图，${result.trajectory?.length || 0} 个步骤` });
      } catch (err: any) {
        addMessage("assistant", "离线分析未完成，你仍然可以点击「生成 Skill」来创建技能包。");
      } finally {
        setAnalyzing(false);
      }
    } else {
      addMessage("assistant", "录制已停止。你可以点击「生成 Skill」来创建技能包。");
    }
  }, [mode, activeSessionId, currentCase, finishSession, addMessage]);

  const handleInput = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");

    if (text === "开始录制" && recState === "idle") {
      startRealRecording();
      return;
    }
    addMessage("user", text);
    setTimeout(() => {
      if (recState === "recording") addMessage("assistant", "收到，我继续观察你的操作。");
      else if (recState === "stopped") addMessage("assistant", "录制已结束。点击「生成 Skill」即可创建技能包。");
      else addMessage("assistant", "你可以点击左侧「新建录制」按钮启动录制，也可以点击下方案例卡片快速体验。");
    }, 500);
  }, [inputText, recState, addMessage, startRealRecording]);

  const generateSkill = useCallback(async () => {
    if (mode === "real" && activeSessionId) {
      setGenerating(true);
      addMessage("assistant", "正在生成 Skill，请稍候...");
      try {
        const skill = await api.generateSkill(activeSessionId);
        if (skill.id) {
          window.location.href = `/skill?skillId=${skill.id}`;
        } else {
          addMessage("assistant", `生成失败：${skill.error || "未知错误"}`);
        }
      } catch (err: any) {
        addMessage("assistant", `生成 Skill 失败：${err.message || "请确认后端服务和 API Key 已配置"}`);
      } finally {
        setGenerating(false);
      }
      return;
    }

    // Demo mode
    let skill: SkillData;
    if (currentCase && CASES[currentCase]) {
      skill = CASES[currentCase].skill;
    } else {
      skill = {
        name: "自定义工作流", systems: "待识别", stepCount: trajectory.length || 1,
        params: [{ name: "variable_1", desc: "请编辑此参数名称和描述" }],
        md: `---\nname: 自定义工作流\nversion: 1.0\n---\n\n# 自定义工作流\n\n## 步骤\n\n${trajectory.map((s, i) => `### ${i + 1}. ${s.title}\n- 操作：${s.desc}`).join("\n\n")}`,
        execSteps: trajectory.map((s, i) => ({ text: s.title, chat: `正在执行步骤 ${i + 1}...`, duration: 1500 })),
      };
    }
    setCurrentSkill(skill);
    window.location.href = `/skill?case=${currentCase || "custom"}`;
  }, [mode, activeSessionId, currentCase, trajectory, addMessage]);

  const runExecution = useCallback(async () => {
    if (!currentSkill) return;
    setShowParamPopup(false);

    if (mode === "real" && skillIdParam && activeSessionId) {
      const paramStr = Object.entries(paramValues).map(([k, v]) => `${k}=${v || "(未填)"}`).join(", ");
      addMessage("user", `执行「${currentSkill.name}」：${paramStr}`);

      try {
        const exec = await api.createExecution({ skillId: skillIdParam, sessionId: activeSessionId, inputs: paramValues });
        setExecutionId(exec.id);

        const steps = currentSkill.execSteps.map(s => ({ text: replaceParams(s.text, paramValues), status: "pending" as const }));
        setExecSteps(steps);
        setExecRunning(true);

        execPollRef.current = setInterval(async () => {
          try {
            const updated = await api.getExecution(exec.id);
            if (updated.stepResults) {
              setExecSteps(prev => prev.map((s, i) => {
                const result = updated.stepResults[i];
                if (!result) return s;
                return { ...s, status: result.status === "done" ? "done" : result.status === "running" ? "running" : result.status === "skipped" ? "done" as const : result.status === "failed" ? "done" as const : s.status };
              }));
            }
            if (updated.status === "completed" || updated.status === "failed") {
              setExecRunning(false);
              // Force-sync final step statuses (a fast run may complete before
              // the incremental poll mapped every step).
              if (updated.stepResults) {
                setExecSteps(prev => prev.map((s, i) => (
                  updated.stepResults[i] ? { ...s, status: "done" as const } : s
                )));
              }
              addMessage("assistant", updated.status === "completed" ? "「" + currentSkill.name + "」执行完毕！" : `执行失败：${updated.stepResults?.find((r: any) => r.error)?.error || "未知错误"}`);
              if (execPollRef.current) clearInterval(execPollRef.current);
              if (updated.status === "completed") setTimeout(() => setShowReport(true), 500);
            }
          } catch { /* poll failed */ }
        }, 2000);
      } catch (err: any) {
        addMessage("assistant", `启动执行失败：${err.message || "请确认后端服务正在运行"}`);
      }
      return;
    }

    // Demo execution
    const steps = currentSkill.execSteps || [];
    if (steps.length === 0) { addMessage("assistant", "该 Skill 暂无可执行步骤。"); return; }
    // Guard against double-invocation (StrictMode / rapid clicks) spawning two
    // overlapping timer chains that corrupt step status.
    if (demoRunningRef.current) return;
    demoRunningRef.current = true;

    const paramStr = Object.entries(paramValues).map(([k, v]) => `${k}=${v || "(未填)"}`).join(", ");
    addMessage("user", `执行「${currentSkill.name}」：${paramStr}`);

    const initialSteps = steps.map(s => ({ text: replaceParams(s.text, paramValues), status: "pending" as const }));
    setExecSteps(initialSteps);
    setExecRunning(true);

    const runStep = (idx: number) => {
      if (idx >= steps.length) {
        demoRunningRef.current = false;
        setExecRunning(false);
        addMessage("assistant", `「${currentSkill!.name}」执行完毕！`);
        setTimeout(() => setShowReport(true), 500);
        return;
      }
      setExecSteps(prev => prev.map((s, i) => i === idx ? { ...s, status: "running" } : s));
      addMessage("assistant", replaceParams(steps[idx].chat, paramValues));
      setTimeout(() => {
        setExecSteps(prev => prev.map((s, i) => i === idx ? { ...s, status: "done" as const } : s));
        runStep(idx + 1);
      }, steps[idx].duration);
    };
    setTimeout(() => runStep(0), 600);
  }, [mode, currentSkill, paramValues, skillIdParam, activeSessionId, addMessage]);

  useEffect(() => {
    if (chatAreaRef.current) chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
  }, [messages, execSteps]);

  // Extract a poster frame from the recorded video for the playback thumbnail.
  // Only runs for real recordings (which have a blob URL); case demos set their
  // own static poster in playCase, so we must NOT clear it here.
  useEffect(() => {
    if (!videoBlobUrl) return;
    let cancelled = false;
    const video = document.createElement("video");
    video.src = videoBlobUrl;
    video.muted = true;
    video.crossOrigin = "anonymous";
    const grab = () => {
      if (cancelled || !video.videoWidth) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try { setVideoPoster(canvas.toDataURL("image/jpeg", 0.7)); } catch { /* ignore */ }
    };
    video.onloadeddata = () => { try { video.currentTime = 0.1; } catch { grab(); } };
    video.onseeked = grab;
    return () => { cancelled = true; };
  }, [videoBlobUrl]);

  useEffect(() => {
    return () => {
      if (execPollRef.current) clearInterval(execPollRef.current);
      captureStopRef.current?.stop();
      frameStopRef.current?.stop();
      wsRef.current?.close();
    };
  }, []);

  // 主动录制入口（侧栏「新建录制」/「开始录制」）始终走真实录制；
  // 案例模拟仅通过 playCase 触发（内部临时切到 demo）。
  const startRecording = startRealRecording;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#F3F4F6" }}>
      {/* Sidebar */}
      <div style={{ width: "260px", background: "#111827", color: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700, background: "linear-gradient(135deg, #60A5FA, #A78BFA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>ReSkill</span>
          <Link href="/" style={{ marginLeft: "auto", background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: "13px", padding: "4px 8px", borderRadius: "6px", textDecoration: "none" }}>← 返回</Link>
        </div>
        <div style={{ padding: "16px" }}>
          <h4 style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "#9CA3AF", marginBottom: "12px", fontWeight: 600 }}>录制历史</h4>
          <button onClick={startRecording} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            width: "100%", padding: "10px", borderRadius: "8px", border: "1px dashed rgba(255,255,255,0.2)",
            background: "none", color: "#9CA3AF", fontSize: "13px", fontWeight: 600, cursor: "pointer",
            marginBottom: "12px",
          }}>+ 新建录制</button>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", fontSize: "13px", marginBottom: "8px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: recState === "recording" ? "#EF4444" : recState === "stopped" ? "#10B981" : "#9CA3AF", animation: recState === "recording" ? "pulse 1.5s infinite" : "none" }} />
            <span>{recState === "recording" ? "正在录制中..." : recState === "paused" ? "已暂停" : recState === "stopped" ? "录制完成" : "准备就绪"}</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
          {sessions.slice().reverse().map(s => (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px",
              borderRadius: "8px", marginBottom: "4px", cursor: "pointer",
              background: s.id === activeSessionId ? "rgba(96,165,250,0.15)" : "transparent", fontSize: "13px",
            }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0, background: s.status === "recording" ? "#EF4444" : s.status === "done" ? "#10B981" : "#6B7280" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#fff" }}>{s.name}</div>
                <div style={{ fontSize: "10px", color: "#6B7280", marginTop: "1px" }}>{s.time} · {s.status === "recording" ? "录制中" : s.status === "done" ? "已完成" : "就绪"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Top Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px", background: "#fff", borderBottom: "1px solid #E5E7EB" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 600 }}>ReSkill 工作台</h2>
          <div style={{ display: "flex", gap: "8px" }}>
            {(recState === "recording" || recState === "paused") && (
              <button onClick={togglePause} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "#F3F4F6", color: "#374151" }}>
                {recState === "paused" ? "▶ 继续" : "⏸ 暂停"}
              </button>
            )}
            {(recState === "recording" || recState === "paused") && (
              <button onClick={stopRecording} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "#EF4444", color: "#fff" }}>⏹ 停止录制</button>
            )}
            {recState === "stopped" && (
              <button onClick={generateSkill} disabled={generating} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: 600, cursor: generating ? "wait" : "pointer", background: generating ? "#9CA3AF" : "#007AFF", color: "#fff" }}>
                {generating ? "⏳ 生成中..." : "✨ 生成 Skill"}
              </button>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div ref={chatAreaRef} style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ display: "flex", gap: "12px", marginBottom: "20px", animation: "fadeIn 0.3s ease", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 600,
                background: msg.role === "assistant" ? "linear-gradient(135deg, #007AFF, #7C3AED)" : "#E5E7EB",
                color: msg.role === "assistant" ? "#fff" : "#374151",
              }}>
                {msg.role === "assistant" ? "AI" : "你"}
              </div>
              <div style={{ maxWidth: "70%", padding: "12px 16px", borderRadius: "12px", fontSize: "14px", lineHeight: 1.6, background: msg.role === "user" ? "#007AFF" : "#fff", color: msg.role === "user" ? "#fff" : "#111827", border: msg.role === "assistant" ? "1px solid #E5E7EB" : "none" }}>
                {msg.text}
                {msg.tool && (
                  <div style={{ marginTop: "8px", padding: "10px 12px", borderRadius: "8px", background: "#F9FAFB", border: "1px solid #E5E7EB", fontSize: "12px", color: "#4B5563", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", background: msg.tool.type === "computer" ? "#F3E8FF" : msg.tool.type === "analysis" ? "#E8F0FE" : "#ECFDF5", color: msg.tool.type === "computer" ? "#7C3AED" : msg.tool.type === "analysis" ? "#007AFF" : "#10B981" }}>
                      {msg.tool.type === "computer" ? "Computer Use" : msg.tool.type === "analysis" ? "语义分析" : "截图采集"}
                    </span>
                    <span>{msg.tool.text}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Start Recording Card — hidden in verify mode (use 新建录制 in sidebar instead) */}
          {showStartCard && recState === "idle" && !verifyMode && (
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E5E7EB", padding: "24px", textAlign: "center", marginBottom: "20px", animation: "fadeIn 0.4s ease" }}>
              <p style={{ fontSize: "14px", color: "#6B7280", marginBottom: "16px", lineHeight: 1.5 }}>点击下方按钮录制你的操作，或选择一个案例快速体验</p>
              <button onClick={startRecording} style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                padding: "12px 28px", borderRadius: "100px", border: "none",
                background: "linear-gradient(135deg, #007AFF, #7C3AED)", color: "#fff",
                fontSize: "15px", fontWeight: 600, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(0,122,255,0.3)",
              }}>🔴 开始录制</button>
              <p style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "10px" }}>将请求屏幕共享权限，AI 实时观察并分析你的操作</p>
              <p style={{ fontSize: "12px", color: "#C084FC", marginTop: "6px" }}>💡 在线体验版建议点击下方案例查看完整效果；真实录制需连接内网模型服务运行</p>
            </div>
          )}

          {/* Video Preview */}
          {showVideo && (
            <div style={{ marginTop: "8px" }}>
              {(() => {
                // Case demos show a static cover only (no real video to open);
                // real recordings open the playback modal on click.
                const isCaseDemo = mode === "demo";
                return (
              <div onClick={() => { if (!isCaseDemo) setShowVideoModal(true); }} style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid #E5E7EB", background: "#000", cursor: isCaseDemo ? "default" : "pointer", maxWidth: "400px" }}>
                <div style={{ width: "100%", height: "200px", background: videoPoster ? "#000" : "linear-gradient(135deg, #1F2937, #374151)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {videoPoster && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={videoPoster} alt="录制封面" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                  {!isCaseDemo && (
                    <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(255,255,255,0.95)", display: "flex", alignItems: "center", justifyContent: "center", position: "absolute", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
                      <div style={{ width: 0, height: 0, borderTop: "10px solid transparent", borderBottom: "10px solid transparent", borderLeft: "16px solid #111827", marginLeft: "3px" }} />
                    </div>
                  )}
                </div>
                <div style={{ padding: "10px 14px", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "#374151", fontWeight: 600 }}>📋 {videoName} — 录制回放</span>
                  <span style={{ color: "#9CA3AF" }}>{videoDuration}</span>
                </div>
              </div>
                );
              })()}
            </div>
          )}

          {/* Execution Progress Card */}
          {execSteps.length > 0 && (
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E5E7EB", padding: "20px", marginBottom: "20px", animation: "fadeIn 0.3s ease" }}>
              <h4 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                执行进度
                <span style={{ fontSize: "12px", fontWeight: 400, color: "#9CA3AF" }}>
                  {execSteps.filter(s => s.status === "done").length} / {execSteps.length}
                </span>
              </h4>
              {execSteps.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", fontSize: "13px" }}>
                  <div style={{
                    width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 700,
                    background: step.status === "running" ? "#E8F0FE" : step.status === "done" ? "#ECFDF5" : "#F3F4F6",
                    color: step.status === "running" ? "#007AFF" : step.status === "done" ? "#10B981" : "#9CA3AF",
                    animation: step.status === "running" ? "pulse 1.5s infinite" : "none",
                  }}>
                    {step.status === "done" ? "✓" : i + 1}
                  </div>
                  <span style={{
                    color: step.status === "running" ? "#007AFF" : step.status === "done" ? "#111827" : "#4B5563",
                    fontWeight: step.status === "running" ? 600 : 400,
                  }}>
                    {step.text}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Report */}
          {showReport && currentCase === "competitor" && (
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E5E7EB", padding: "24px", marginBottom: "20px", animation: "fadeIn 0.5s ease" }}>
              <h4 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>{paramValues.competitor_name || "目标"} 竞品分析报告</h4>
              {[
                { title: "1. 首页概览", screen: "首页截图", content: "核心卖点：协作设计、实时多人编辑\n目标用户：产品设计师、设计团队\n主要 CTA：\"Get started for free\"" },
                { title: "2. 核心功能", screen: "功能页截图", content: "核心功能：Design / Prototype / Dev Mode\n差异化亮点：实时协作、组件变量系统\n技术架构：Web-first，基于 WebGL 渲染" },
                { title: "3. 定价策略", screen: "定价页截图", content: "套餐层级：Free / Professional / Organization / Enterprise\n价格：$0 / $15/人/月 / $45/人/月\n免费/付费边界：3 文件 3 页面限制在 Free 版" },
              ].map((section, i) => (
                <div key={i} style={{ marginBottom: "16px" }}>
                  <h5 style={{ fontSize: "14px", fontWeight: 700, color: "#1F2937", marginBottom: "6px" }}>{section.title}</h5>
                  <div style={{ width: "100%", height: "80px", borderRadius: "8px", background: "#F3F4F6", border: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: "12px", margin: "6px 0" }}>📷 {paramValues.competitor_name || "目标"} {section.screen}</div>
                  <p style={{ fontSize: "13px", color: "#4B5563", lineHeight: 1.6, whiteSpace: "pre-line" }}>{section.content}</p>
                </div>
              ))}
            </div>
          )}
          {showReport && currentCase === "ticket" && (
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E5E7EB", padding: "24px", marginBottom: "20px", animation: "fadeIn 0.5s ease" }}>
              <h4 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>工单「{paramValues.ticket_title || "目标"}」处理结果</h4>
              <div style={{ marginBottom: "16px" }}>
                <h5 style={{ fontSize: "14px", fontWeight: 700, color: "#1F2937", marginBottom: "6px" }}>自动回复内容</h5>
                <p style={{ fontSize: "13px", color: "#4B5563", lineHeight: 1.6 }}>尊敬的用户，关于「{paramValues.ticket_title || "目标"}」问题，请尝试以下步骤：<br />1. 清除浏览器缓存并重新登录<br />2. 检查网络连接是否正常<br />3. 如问题持续，请联系技术支持</p>
              </div>
              <div>
                <h5 style={{ fontSize: "14px", fontWeight: 700, color: "#1F2937", marginBottom: "6px" }}>处理状态</h5>
                <p style={{ fontSize: "13px", color: "#10B981", fontWeight: 600 }}>已自动回复并发送 ✓</p>
              </div>
            </div>
          )}
          {showReport && mode === "real" && (
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #E5E7EB", padding: "24px", marginBottom: "20px", animation: "fadeIn 0.5s ease" }}>
              <h4 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>「{currentSkill?.name}」执行报告</h4>
              <p style={{ fontSize: "13px", color: "#4B5563", lineHeight: 1.6 }}>
                执行已完成，共 {execSteps.length} 个步骤。{execSteps.filter(s => s.status === "done").length} 个步骤成功执行。
              </p>
              <p style={{ fontSize: "13px", color: "#10B981", fontWeight: 600, marginTop: "8px" }}>执行完毕 ✓</p>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div style={{ padding: "12px 24px 16px", background: "#fff", borderTop: "1px solid #E5E7EB" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "10px 16px", borderRadius: "12px", background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
            {skillPill && (
              <div onClick={() => setShowParamPopup(true)} style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "6px 12px", borderRadius: "20px",
                background: "linear-gradient(135deg, #007AFF, #7C3AED)", color: "#fff",
                fontSize: "13px", fontWeight: 600, cursor: "pointer", marginRight: "8px", flexShrink: 0,
              }}>📋 {skillPill}</div>
            )}
            <input
              type="text"
              placeholder={skillPill ? "填写参数后启动执行，或点击 Skill 标签编辑参数..." : "输入指令或消息..."}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleInput()}
              style={{ flex: 1, border: "none", background: "none", outline: "none", fontSize: "14px", color: "#111827" }}
            />
            <button onClick={handleInput} style={{ width: "32px", height: "32px", borderRadius: "8px", border: "none", background: "#007AFF", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            </button>
          </div>
          {showCaseCards && recState === "idle" && (
            <div style={{ marginTop: "14px", padding: "14px", borderRadius: "12px", background: "linear-gradient(135deg, #F5F3FF, #EEF2FF)", border: "1px solid #E0E7FF" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                <span style={{ fontSize: "14px" }}>⭐</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#4F46E5" }}>不想录屏？点开案例直接体验效果</span>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <div onClick={() => playCase("competitor")} style={{
                  flex: 1, padding: "12px 14px", borderRadius: "10px", background: "#fff", border: "1px solid #E0E7FF",
                  cursor: "pointer", display: "flex", gap: "10px", alignItems: "center", boxShadow: "0 1px 3px rgba(79,70,229,0.08)",
                }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0, background: "#F3E8FF" }}>🔍</div>
                  <div>
                    <h5 style={{ fontSize: "13px", fontWeight: 600, marginBottom: "1px" }}>案例：一键竞品分析</h5>
                    <p style={{ fontSize: "11px", color: "#6B7280", lineHeight: 1.4 }}>录制竞品分析流程，截图并记录要点到文档</p>
                  </div>
                </div>
                <div onClick={() => playCase("ticket")} style={{
                  flex: 1, padding: "12px 14px", borderRadius: "10px", background: "#fff", border: "1px solid #E0E7FF",
                  cursor: "pointer", display: "flex", gap: "10px", alignItems: "center", boxShadow: "0 1px 3px rgba(79,70,229,0.08)",
                }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0, background: "#FFFBEB" }}>🎫</div>
                  <div>
                    <h5 style={{ fontSize: "13px", fontWeight: 600, marginBottom: "1px" }}>案例：工单自动答疑</h5>
                    <p style={{ fontSize: "11px", color: "#6B7280", lineHeight: 1.4 }}>读取工单内容，查找知识库，生成回复</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div style={{ width: "340px", background: "#fff", borderLeft: "1px solid #E5E7EB", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", padding: "0 8px" }}>
          {(["obs", "traj"] as const).map(tab => (
            <div key={tab} onClick={() => setRightTab(tab)} style={{
              flex: 1, padding: "14px 12px", textAlign: "center", fontSize: "13px", fontWeight: 600,
              color: rightTab === tab ? "#007AFF" : "#9CA3AF", cursor: "pointer",
              borderBottom: rightTab === tab ? "2px solid #007AFF" : "2px solid transparent",
            }}>
              {tab === "obs" ? "👁 观察日志" : "📍 行为轨迹"}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: rightTab === "obs" ? "block" : "none" }}>
          {observations.map(obs => (
            <div key={obs.id} style={{
              padding: "10px 12px", borderRadius: "8px", background: "#F9FAFB", marginBottom: "6px",
              fontSize: "12px", lineHeight: 1.5, color: "#4B5563", borderLeft: "3px solid #007AFF",
              animation: "slideIn 0.3s ease",
            }}>
              <div style={{ color: "#9CA3AF", fontSize: "10px", marginBottom: "2px" }}>{obs.time}</div>
              <span style={{ color: "#007AFF", fontWeight: 600 }}>[{obs.app}]</span> {obs.text}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: rightTab === "traj" ? "block" : "none" }}>
          {trajectory.map(step => (
            <div key={step.id} style={{ position: "relative", paddingLeft: "24px", marginBottom: "16px", animation: "fadeIn 0.3s ease" }}>
              <div style={{ position: "absolute", left: "6px", top: "24px", bottom: "-16px", width: "2px", background: "#E5E7EB" }} />
              <div style={{ position: "absolute", left: "0", top: "6px", width: "14px", height: "14px", borderRadius: "50%", border: "2px solid #007AFF", background: "#fff" }} />
              <div style={{ fontSize: "11px", color: "#9CA3AF", marginBottom: "2px", fontWeight: 600 }}>步骤 {step.num}</div>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "2px" }}>{step.title}</div>
              <div style={{ fontSize: "12px", color: "#6B7280", lineHeight: 1.5 }}>{step.desc}</div>
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 600, marginTop: "4px",
                background: step.tag === "web" ? "#E8F0FE" : step.tag === "doc" ? "#FFFBEB" : "#ECFDF5",
                color: step.tag === "web" ? "#007AFF" : step.tag === "doc" ? "#F59E0B" : "#10B981",
              }}>
                {step.tag === "web" ? "Web 应用" : step.tag === "doc" ? "文档系统" : "截图采集"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Param Popup */}
      {showParamPopup && currentSkill && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#fff", borderRadius: "16px", padding: "28px",
            width: "460px", maxHeight: "80vh", overflowY: "auto",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", animation: "fadeIn 0.3s ease",
          }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>执行「{currentSkill.name}」</h3>
            <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "20px" }}>请输入变量参数以启动自动执行</p>
            {currentSkill.params.map(p => (
              <div key={p.name} style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#374151" }}>
                  {p.name} {(p.label || p.desc) && <span style={{ color: "#9CA3AF", fontWeight: 400 }}>· {p.label || p.desc}</span>}
                </label>
                <input
                  type="text"
                  placeholder={p.example ? `例如：${p.example}` : (p.defaultValue ? `默认：${p.defaultValue}` : "请输入…")}
                  value={paramValues[p.name] || ""}
                  onChange={e => setParamValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #D1D5DB", fontSize: "14px", outline: "none", background: "#F9FAFB" }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
              <button onClick={() => setShowParamPopup(false)} style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "none", fontSize: "14px", fontWeight: 600, cursor: "pointer", background: "#F3F4F6", color: "#374151" }}>取消</button>
              <button onClick={runExecution} disabled={execRunning} style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "none", fontSize: "14px", fontWeight: 600, cursor: execRunning ? "wait" : "pointer", background: "linear-gradient(135deg, #007AFF, #7C3AED)", color: "#fff" }}>
                {execRunning ? "执行中..." : "启动执行"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Modal */}
      {showVideoModal && (
        <div onClick={e => e.target === e.currentTarget && setShowVideoModal(false)} style={{
          position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(8px)", animation: "fadeIn 0.3s ease",
        }}>
          <div style={{ width: "80vw", maxWidth: "960px", background: "#000", borderRadius: "16px", overflow: "hidden", position: "relative" }}>
            <button onClick={() => setShowVideoModal(false)} style={{
              position: "absolute", top: "12px", right: "12px", width: "32px", height: "32px",
              borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff",
              cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1,
            }}>✕</button>
            <div style={{ width: "100%", aspectRatio: "16/9", background: "#000" }}>
              {videoBlobUrl ? (
                <video src={videoBlobUrl} poster={videoPoster || undefined} controls autoPlay style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1a1a2e, #16213e)", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: "14px" }}>
                  录制回放播放中...<br /><span style={{ fontSize: "12px", opacity: 0.5 }}>（Demo 模拟回放）</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF" }}>Loading...</div>}>
      <WorkspaceContent />
    </Suspense>
  );
}
