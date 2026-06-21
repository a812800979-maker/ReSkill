"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import * as api from "@/lib/api";

interface SkillParam {
  name: string;
  desc: string;
}

interface SkillData {
  name: string;
  systems: string;
  stepCount: number;
  params: SkillParam[];
  md: string;
  execSteps: { text: string; chat: string; duration: number }[];
}

const CASES: Record<string, SkillData> = {
  competitor: {
    name: "一键竞品分析",
    systems: "Chrome / Notion",
    stepCount: 6,
    params: [
      { name: "competitor_name", desc: "竞品产品名称，如 \"Figma\"、\"Sketch\"" },
      { name: "competitor_url", desc: "竞品官网地址，如 \"https://figma.com\"" },
    ],
    md: `---
name: 一键竞品分析
version: 1.0
systems:
  - Chrome (竞品官网)
  - Notion (文档系统)
parameters:
  - name: competitor_name
    type: string
    required: true
  - name: competitor_url
    type: string
    required: true
---

# 一键竞品分析

## 概述
打开竞品官网，依次浏览首页、产品功能页、定价页并截图，将截图和分析要点写入 Notion 文档，最终生成一份含产品截图的功能分析报告。

## 步骤

### 1. 打开竞品官网
- 操作：在 Chrome 打开 {{competitor_url}}
- 类型：可变参数

### 2. 浏览并截图首页
- 操作：等待首页加载完成，截取首屏画面
- 类型：固定步骤

### 3. 浏览并截图产品功能页
- 操作：点击 "Product" 或 "Features" 导航，截取功能介绍页
- 类型：固定步骤

### 4. 浏览并截图定价页
- 操作：点击 "Pricing" 导航，截取定价方案
- 类型：固定步骤

### 5. 打开 Notion 新建文档
- 操作：切换至 Notion，新建页面，标题 "{{competitor_name}} 竞品分析"
- 类型：可变参数

### 6. 粘贴截图并记录要点
- 操作：依次粘贴截图，为每张截图添加分析要点
- 类型：固定步骤

## 注意事项
- 竞品网站结构可能不同，导航标签名称可能为 Product / Features / Solutions 等
- 如果网站没有 Pricing 页面，跳过步骤 4，记录"未公开定价"`,
    execSteps: [
      { text: "打开竞品官网", chat: "正在打开 {{competitor_url}} ...", duration: 1800 },
      { text: "浏览并截图首页", chat: "首页已加载，截取首屏画面 → homepage.png", duration: 2000 },
      { text: "浏览并截图产品功能页", chat: "点击 Product，截取功能介绍页 → features.png", duration: 2200 },
      { text: "浏览并截图定价页", chat: "点击 Pricing，截取定价方案 → pricing.png", duration: 1800 },
      { text: "打开 Notion 新建文档", chat: "切换至 Notion，新建文档「{{competitor_name}} 竞品分析」", duration: 1500 },
      { text: "粘贴截图并记录要点", chat: "将截图粘贴到文档，逐项添加分析要点...", duration: 2500 },
    ],
  },
  ticket: {
    name: "工单自动答疑",
    systems: "工单系统 / 知识库",
    stepCount: 5,
    params: [
      { name: "ticket_title", desc: "工单标题或关键词，如 \"登录失败\"" },
      { name: "ticket_system_url", desc: "工单系统地址，如 \"https://support.internal\"" },
    ],
    md: `---
name: 工单自动答疑
version: 1.0
systems:
  - 工单系统
  - 知识库 (Confluence)
parameters:
  - name: ticket_title
    type: string
    required: true
  - name: ticket_system_url
    type: string
    required: true
---

# 工单自动答疑

## 概述
打开工单系统，阅读待处理工单内容，在知识库中搜索相关解决方案，将方案粘贴到工单回复并发送。

## 步骤

### 1. 打开工单系统
- 操作：导航至 {{ticket_system_url}}
- 类型：可变参数

### 2. 查看待处理工单
- 操作：点击工单列表中的待处理工单，阅读 {{ticket_title}} 的详细内容
- 类型：可变参数

### 3. 搜索知识库
- 操作：切换至知识库，搜索 {{ticket_title}} 相关解决方案
- 类型：可变参数

### 4. 定位解决方案
- 操作：在搜索结果中找到匹配文档，复制解决方案内容
- 类型：固定步骤

### 5. 编写并发送回复
- 操作：切回工单系统，粘贴解决方案，根据工单内容调整措辞后发送
- 类型：固定步骤

## 注意事项
- 知识库中可能没有直接匹配的方案，需要模糊搜索或人工补充
- 回复内容需根据具体工单内容调整，避免直接复制粘贴`,
    execSteps: [
      { text: "打开工单系统", chat: "正在打开 {{ticket_system_url}} ...", duration: 1800 },
      { text: "查看待处理工单", chat: "打开工单「{{ticket_title}}」，阅读详情...", duration: 2000 },
      { text: "搜索知识库", chat: "切换至知识库，搜索「{{ticket_title}}」相关方案...", duration: 2200 },
      { text: "定位解决方案", chat: "找到匹配文档，复制解决方案内容", duration: 1800 },
      { text: "编写并发送回复", chat: "切回工单系统，粘贴方案并发送回复", duration: 2000 },
    ],
  },
};

function SkillEditorContent() {
  const searchParams = useSearchParams();
  const skillId = searchParams.get("skillId");
  const caseId = searchParams.get("case") || "competitor";

  const [isRealMode, setIsRealMode] = useState(!!skillId);
  const [realSkillId, setRealSkillId] = useState(skillId);
  const [loading, setLoading] = useState(!!skillId);
  const [realSkillData, setRealSkillData] = useState<any>(null);

  const initialSkill = CASES[caseId] || CASES.competitor;
  const currentSkill = isRealMode && realSkillData ? {
    name: realSkillData.name || "Untitled",
    systems: realSkillData.parsedSystems?.map((s: any) => s.name).filter(Boolean).join(" / ") || "unknown",
    stepCount: realSkillData.parsedSteps?.length || 0,
    params: realSkillData.parsedInputs?.map((p: any) => ({ name: p.name, desc: p.description || p.type })) || [],
    md: realSkillData.content || "",
    execSteps: realSkillData.parsedSteps?.map((s: any) => ({
      text: s.description || s.id,
      chat: `正在执行：${s.description || s.id}...`,
      duration: 2000,
    })) || [],
  } : initialSkill;

  const [skillName, setSkillName] = useState(currentSkill.name);
  const [mdContent, setMdContent] = useState("");
  const [displayedMd, setDisplayedMd] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  const [params, setParams] = useState<SkillParam[]>(currentSkill.params);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const systems = currentSkill.systems;
  const stepCount = currentSkill.stepCount;
  const duration = "3m 30s";

  // Load real skill data
  useEffect(() => {
    if (!skillId) { setLoading(false); return; }
    api.getSkill(skillId).then((data: any) => {
      setRealSkillData(data);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [skillId]);

  // Typing animation for md content
  useEffect(() => {
    const md = currentSkill.md;
    setMdContent(md);
    if (isRealMode) {
      setDisplayedMd(md);
      setTypingDone(true);
      return;
    }
    let idx = 0;
    const speed = 5;
    function typeSkill() {
      if (idx < md.length) {
        setDisplayedMd(md.substring(0, idx + speed));
        idx += speed;
        requestAnimationFrame(typeSkill);
      } else {
        setTypingDone(true);
      }
    }
    typeSkill();
  }, [currentSkill.md, isRealMode]);

  // Initialize name/params ONCE when real data first loads (don't overwrite user edits on re-render)
  useEffect(() => {
    if (realSkillData && !initialized) {
      setSkillName(currentSkill.name);
      setParams(currentSkill.params);
      setInitialized(true);
    }
  }, [realSkillData, initialized, currentSkill.name, currentSkill.params]);

  // Keep the skill name in sync with the `name:` field inside the editable SKILL.md (two-way).
  const onNameChange = useCallback((value: string) => {
    setSkillName(value);
    setMdContent(prev => {
      const replaced = prev.replace(/(\n\s*name:\s*)(["']?)(.*?)(\2)(\s*(?:\n|$))/, `$1$2${value}$4$5`);
      setDisplayedMd(replaced);
      return replaced;
    });
  }, []);

  // When the user edits the SKILL.md directly, reflect a changed `name:` back into the name field.
  const onMdChange = useCallback((value: string) => {
    setMdContent(value);
    setDisplayedMd(value);
    setTypingDone(true);
    const m = value.match(/\n\s*name:\s*["']?(.+?)["']?\s*(?:\n|$)/);
    if (m) setSkillName(m[1].trim());
  }, []);

  const addParam = useCallback(() => {
    setParams(prev => [...prev, { name: "new_param", desc: "请编辑参数描述" }]);
  }, []);

  const removeParam = useCallback((index: number) => {
    setParams(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateParamName = useCallback((index: number, value: string) => {
    setParams(prev => prev.map((p, i) => i === index ? { ...p, name: value.replace(/[{}]/g, "") } : p));
  }, []);

  const updateParamDesc = useCallback((index: number, value: string) => {
    setParams(prev => prev.map((p, i) => i === index ? { ...p, desc: value } : p));
  }, []);

  const downloadSkill = useCallback(() => {
    const content = typingDone ? mdContent : displayedMd;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SKILL_${skillName}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mdContent, displayedMd, typingDone, skillName]);

  const saveSkill = useCallback(async () => {
    if (!realSkillId) return;
    setSaving(true);
    try {
      await api.updateSkill(realSkillId, { name: skillName, content: mdContent });
    } catch { /* save failed */ }
    setSaving(false);
  }, [realSkillId, skillName, mdContent]);

  const goToVerify = useCallback(() => {
    if (isRealMode && realSkillId) {
      window.location.href = `/workspace?verify=true&skillId=${realSkillId}`;
    } else {
      const encodedCase = encodeURIComponent(caseId);
      window.location.href = `/workspace?verify=true&case=${encodedCase}`;
    }
  }, [isRealMode, realSkillId, caseId]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: "16px" }}>
        加载 Skill 数据中...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB" }}>
      {/* Top Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", background: "#fff", borderBottom: "1px solid #E5E7EB" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 700 }}>
          Skill 已生成 {isRealMode && <span style={{ fontSize: "12px", fontWeight: 400, color: "#9CA3AF" }}>· AI 生成</span>}
        </h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={downloadSkill} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "#F3F4F6", color: "#374151" }}>⬇ 下载 SKILL.md</button>
          {isRealMode && (
            <button onClick={saveSkill} disabled={saving} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: 600, cursor: saving ? "wait" : "pointer", background: "#F3F4F6", color: "#374151" }}>
              {saving ? "保存中..." : "💾 保存"}
            </button>
          )}
          <Link href="/" style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "#F3F4F6", color: "#374151", textDecoration: "none" }}>返回首页</Link>
          <button onClick={goToVerify} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "#7C3AED", color: "#fff" }}>▶ 验证执行</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: "24px", maxWidth: "1200px", margin: "32px auto", padding: "0 32px" }}>
        {/* SKILL.md Editor */}
        <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #E5E7EB", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 24px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: "#4B5563" }}>
            <span>SKILL.md</span>
            <span style={{ fontSize: "12px", color: "#9CA3AF" }}>可直接编辑内容</span>
          </div>
          <div style={{ padding: "20px", flex: 1, overflowY: "auto", maxHeight: "68vh" }}>
            <textarea
              value={typingDone ? mdContent : displayedMd}
              onChange={e => onMdChange(e.target.value)}
              style={{
                width: "100%", height: "100%", minHeight: "500px", border: "none", outline: "none",
                fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                fontSize: "13px", lineHeight: 1.8, color: "#374151", resize: "vertical", background: "transparent",
              }}
            />
          </div>
        </div>

        {/* Meta + Params */}
        <div>
          <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #E5E7EB", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <input
                type="text"
                value={skillName}
                onChange={e => onNameChange(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #D1D5DB", fontSize: "16px", fontWeight: 700, outline: "none" }}
              />
            </div>
            {[
              { label: "版本", value: "1.0" },
              { label: "关联系统", value: systems },
              { label: "步骤数", value: stepCount },
              { label: "参数数", value: params.length },
              { label: "录制时长", value: duration },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F3F4F6", fontSize: "13px" }}>
                <span style={{ color: "#6B7280" }}>{row.label}</span>
                <span style={{ fontWeight: 600 }}>{row.value}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "24px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>可调参数</span>
              <button onClick={addParam} style={{ width: "auto", padding: "4px 10px", margin: 0, borderRadius: "8px", border: "1px dashed #D1D5DB", background: "none", color: "#6B7280", fontSize: "13px", cursor: "pointer" }}>+ 添加</button>
            </h3>
            {params.map((p, i) => (
              <div key={i} style={{ padding: "12px", borderRadius: "8px", background: "#F9FAFB", border: "1px solid #E5E7EB", marginBottom: "8px", position: "relative" }}>
                <button onClick={() => removeParam(i)} style={{ position: "absolute", top: "8px", right: "8px", background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: "14px", padding: "2px 4px", borderRadius: "4px" }}>✕</button>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: "6px" }}>
                  <input value={`{{${p.name}}}`} onChange={e => updateParamName(i, e.target.value)} placeholder="参数名" style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #D1D5DB", fontSize: "13px", outline: "none", fontWeight: 600, color: "#007AFF" }} />
                  <input value="string — 必填" readOnly style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #D1D5DB", fontSize: "13px", outline: "none", color: "#6B7280" }} />
                  <input value={p.desc} onChange={e => updateParamDesc(i, e.target.value)} placeholder="参数描述" style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #D1D5DB", fontSize: "12px", outline: "none", color: "#4B5563", gridColumn: "1 / -1" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SkillPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF" }}>Loading...</div>}>
      <SkillEditorContent />
    </Suspense>
  );
}
