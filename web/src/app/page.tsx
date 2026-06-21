"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div>
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 48px", background: "rgba(255,255,255,0.8)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid #E5E7EB",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "10px",
            background: "linear-gradient(135deg, #007AFF, #7C3AED)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: "18px", fontWeight: 800,
            boxShadow: "0 2px 8px rgba(124,58,237,0.35)",
          }}>R</div>
          <div style={{
            fontSize: "24px", fontWeight: 800, letterSpacing: "-0.5px",
            background: "linear-gradient(135deg, #007AFF, #7C3AED)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            ReSkill
          </div>
        </div>
        <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
          <a href="#how" style={{ color: "#4B5563", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>工作原理</a>
          <a href="#features" style={{ color: "#4B5563", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>功能特性</a>
          <a href="#why" style={{ color: "#4B5563", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>产品优势</a>
          <Link href="/workspace" style={{ color: "#4B5563", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>开始使用</Link>
        </div>
      </nav>

      <section style={{
        padding: "180px 48px 100px", textAlign: "center",
        background: "linear-gradient(180deg, #fff 0%, #E8F0FE 100%)",
      }}>
        <h1 style={{
          fontSize: "64px", fontWeight: 800, letterSpacing: "-2px", lineHeight: 1.1, marginBottom: "20px",
        }}>
          录制一次，<br />
          <span style={{
            background: "linear-gradient(135deg, #007AFF, #7C3AED)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>自动执行无数次</span>
        </h1>
        <p style={{ fontSize: "22px", color: "#374151", maxWidth: "600px", margin: "0 auto 8px", lineHeight: 1.5, fontWeight: 500 }}>
          让 AI 观察你的工作方式，将操作行为转化为可复用的技能包。录制、生成、验证，三步完成工作流自动化。
        </p>
        <p style={{ fontSize: "16px", color: "#9CA3AF", maxWidth: "480px", margin: "0 auto 40px", lineHeight: 1.4, fontWeight: 400, letterSpacing: "0.5px" }}>
          Record Once, Skill Forever
        </p>
        <Link href="/workspace" style={{
          display: "inline-flex", alignItems: "center", gap: "10px",
          padding: "16px 36px", borderRadius: "100px", border: "none",
          background: "linear-gradient(135deg, #007AFF, #7C3AED)", color: "#fff",
          fontSize: "17px", fontWeight: 600, cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,122,255,0.4)", textDecoration: "none",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}>
          开始录制并生成 Skill
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </Link>
      </section>

      <section id="how" style={{ padding: "100px 48px", background: "#fff" }}>
        <div style={{ textAlign: "center", marginBottom: "60px" }}>
          <h2 style={{ fontSize: "40px", fontWeight: 700, letterSpacing: "-1px", marginBottom: "12px" }}>三步创建自动化技能</h2>
          <p style={{ color: "#6B7280", fontSize: "18px" }}>从手动操作到自动执行，只需一次录制</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "32px", maxWidth: "1100px", margin: "0 auto" }}>
          {[
            { icon: "🔴", bg: "#E8F0FE", title: "录制", desc: "点击开始录制，像平时一样完成你的工作。AI 通过 Computer Use 实时观察你的屏幕操作和行为轨迹。" },
            { icon: "🧠", bg: "#F3E8FF", title: "生成", desc: "AI 分析你的行为目的、操作步骤和可调参数，自动生成一份人类可读的 SKILL.md 技能包。" },
            { icon: "▶️", bg: "#ECFDF5", title: "复用", desc: "用户新建对话唤起 Skill，输入新的变量参数，AI 按 Skill 步骤自动执行整个工作流。" },
          ].map((step) => (
            <div key={step.title} style={{
              padding: "40px 32px", borderRadius: "16px", background: "#F9FAFB",
              border: "1px solid #E5E7EB", textAlign: "center",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            }}>
              <div style={{
                width: "56px", height: "56px", borderRadius: "16px", margin: "0 auto 20px",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px",
                background: step.bg,
              }}>
                {step.icon}
              </div>
              <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>{step.title}</h3>
              <p style={{ color: "#6B7280", fontSize: "15px", lineHeight: 1.6 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" style={{ padding: "100px 48px", background: "#F9FAFB" }}>
        <div style={{ textAlign: "center", marginBottom: "60px" }}>
          <h2 style={{ fontSize: "40px", fontWeight: 700, letterSpacing: "-1px", marginBottom: "12px" }}>核心能力</h2>
          <p style={{ color: "#6B7280", fontSize: "18px" }}>不只是录屏回放，而是理解意图的智能自动化</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px", maxWidth: "900px", margin: "0 auto" }}>
          {[
            { color: "#007AFF", title: "语义级行为理解", desc: "不只是记录点击坐标，而是理解「你在做什么」和「为什么这样做」" },
            { color: "#7C3AED", title: "智能参数提取", desc: "自动识别可变参数，支持灵活替换和手动调整" },
            { color: "#10B981", title: "跨应用录制", desc: "网页应用、本地软件、文档编辑——一个录制流程覆盖多个系统" },
            { color: "#F59E0B", title: "人类可读技能包", desc: "SKILL.md 格式输出，支持阅读、审核、修改和技能共享" },
          ].map((f) => (
            <div key={f.title} style={{
              padding: "28px", borderRadius: "12px", background: "#fff",
              border: "1px solid #E5E7EB", display: "flex", gap: "16px", alignItems: "flex-start",
            }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", marginTop: "6px", flexShrink: 0, background: f.color }} />
              <div>
                <h4 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "4px" }}>{f.title}</h4>
                <p style={{ color: "#6B7280", fontSize: "14px", lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="why" style={{ padding: "100px 48px", background: "#fff" }}>
        <div style={{ textAlign: "center", marginBottom: "60px" }}>
          <h2 style={{ fontSize: "40px", fontWeight: 700, letterSpacing: "-1px", marginBottom: "12px" }}>为什么选择 ReSkill</h2>
          <p style={{ color: "#6B7280", fontSize: "18px" }}>同样是自动化，ReSkill 把门槛降到了「录一遍」</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", maxWidth: "1100px", margin: "0 auto" }}>
          {[
            {
              tag: "VS 传统宏录制",
              accent: "#007AFF", bg: "#E8F0FE",
              point: "不是机械回放鼠标坐标",
              desc: "而是 AI 理解操作语义，换页面、改参数也能稳定执行。",
            },
            {
              tag: "VS 专业 RPA",
              accent: "#7C3AED", bg: "#F3E8FF",
              point: "不需要技术人员配置开发",
              desc: "普通用户录一遍就能生成，落地成本从数天压缩到 1 分钟。",
            },
            {
              tag: "VS 通用 AI Agent",
              accent: "#10B981", bg: "#ECFDF5",
              point: "不需要反复调试 prompt",
              desc: "用你最熟悉的操作方式就能教 AI 做事，学习成本约为零。",
            },
          ].map((c) => (
            <div key={c.tag} style={{
              padding: "32px 28px", borderRadius: "16px", background: "#F9FAFB",
              border: "1px solid #E5E7EB", display: "flex", flexDirection: "column", gap: "14px",
            }}>
              <span style={{
                alignSelf: "flex-start", padding: "5px 12px", borderRadius: "100px",
                fontSize: "13px", fontWeight: 700, color: c.accent, background: c.bg,
              }}>{c.tag}</span>
              <h3 style={{ fontSize: "19px", fontWeight: 700, lineHeight: 1.4, letterSpacing: "-0.3px" }}>{c.point}</h3>
              <p style={{ color: "#6B7280", fontSize: "15px", lineHeight: 1.6 }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
