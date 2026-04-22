import { createPersona } from "@hall-of-fame/api-client";
import { uiTokens } from "@hall-of-fame/ui-tokens";
import { useState } from "react";

import { getApiBaseUrl } from "../../lib/api.js";

const presetTags = ["清醒", "锋利", "克制", "判断", "表达", "行动"];

export const CreatePersonaForm = () => {
  const [displayName, setDisplayName] = useState("");
  const [positioning, setPositioning] = useState("");
  const [customTags, setCustomTags] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(["清醒", "判断"]);
  const [status, setStatus] = useState("");
  const [createdPersonaId, setCreatedPersonaId] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "success" | "workbench">("form");

  const tags = Array.from(
    new Set([
      ...selectedTags,
      ...customTags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ]),
  ).slice(0, 4);

  const toggleTag = (tag: string) => {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  };

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      setStatus("请填写名称");
      return;
    }

    if (!positioning.trim()) {
      setStatus("请填写一句话简介");
      return;
    }

    if (!tags.length) {
      setStatus("至少选择一个风格");
      return;
    }

    setStatus("创建中…");

    try {
      const persona = await createPersona(getApiBaseUrl(), {
        displayName: displayName.trim(),
        positioning: positioning.trim(),
        personaType: "ORIGINAL_PERSONA",
        originType: "USER",
        distillFocus: tags,
      });
      setCreatedPersonaId(persona.id);
      setStatus("");
      setStep("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "创建失败");
    }
  };

  return (
    <section
      style={{
        minHeight: "100vh",
        padding: uiTokens.spacing.lg,
        background: `linear-gradient(180deg, ${uiTokens.colors.lightCanvas}, ${uiTokens.colors.lightSurfaceStrong})`,
        display: "grid",
        gap: uiTokens.spacing.md,
      }}
    >
      <header style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.56 }}>创建</span>
        <h1
          style={{
            margin: 0,
            fontFamily: uiTokens.typography.display.family,
            fontSize: uiTokens.typography.display.sizes.hero,
            lineHeight: "0.95",
          }}
        >
          先创建对象
        </h1>
      </header>

      {step === "form" ? (
        <div
          style={{
            display: "grid",
            gap: uiTokens.spacing.md,
            padding: uiTokens.spacing.lg,
            borderRadius: 28,
            background: "rgba(255,255,255,0.58)",
            border: `1px solid ${uiTokens.colors.lineLight}`,
            boxShadow: uiTokens.shadow.panel,
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <label>名称</label>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：王阳明式教练" />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <label>一句话简介</label>
            <textarea
              value={positioning}
              onChange={(event) => setPositioning(event.target.value)}
              placeholder="例如：清醒直接，擅长理清思路"
            />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <label>风格</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: uiTokens.spacing.xs }}>
              {presetTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    style={{
                      minHeight: 36,
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: `1px solid ${active ? "transparent" : uiTokens.colors.lineLight}`,
                      background: active ? uiTokens.colors.signalBlue : uiTokens.colors.lightSoft,
                      color: active ? uiTokens.colors.lightSurface : uiTokens.colors.ink,
                      boxShadow: "none",
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <input value={customTags} onChange={(event) => setCustomTags(event.target.value)} placeholder="自定义标签，逗号分隔" />
          </div>
          <button type="button" onClick={() => void handleSubmit()}>
            创建
          </button>
          {status ? <p style={{ margin: 0, color: uiTokens.colors.inkSoft }}>{status}</p> : null}
        </div>
      ) : null}

      {step === "success" ? (
        <div
          style={{
            display: "grid",
            gap: uiTokens.spacing.md,
            padding: uiTokens.spacing.lg,
            borderRadius: 28,
            background: "rgba(255,255,255,0.58)",
            border: `1px solid ${uiTokens.colors.lineLight}`,
          }}
        >
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.56 }}>创建成功</span>
          <h2 style={{ margin: 0, fontFamily: uiTokens.typography.display.family, fontSize: uiTokens.typography.display.sizes.panel }}>
            创建好了
          </h2>
          <p style={{ margin: 0, color: uiTokens.colors.inkMuted }}>先补资料，再去预览。</p>
          <strong>{displayName}</strong>
          <button type="button" onClick={() => setStep("workbench")}>
            添加资料
          </button>
        </div>
      ) : null}

      {step === "workbench" ? (
        <div style={{ display: "grid", gap: uiTokens.spacing.md }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: uiTokens.spacing.xs }}>
            <span style={{ padding: "8px 12px", borderRadius: 999, background: uiTokens.colors.lightSoft }}>对象定义</span>
            <span style={{ padding: "8px 12px", borderRadius: 999, background: uiTokens.colors.signalBlue, color: uiTokens.colors.lightSurface }}>资料管理</span>
            <span style={{ padding: "8px 12px", borderRadius: 999, background: uiTokens.colors.lightSoft }}>预览</span>
            <span style={{ padding: "8px 12px", borderRadius: 999, background: uiTokens.colors.lightSoft }}>发布</span>
          </div>

          <section
            style={{
              display: "grid",
              gap: uiTokens.spacing.sm,
              padding: uiTokens.spacing.lg,
              borderRadius: 28,
              background: "rgba(255,255,255,0.58)",
              border: `1px solid ${uiTokens.colors.lineLight}`,
            }}
          >
            <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.56 }}>对象定义</span>
            <h2 style={{ margin: 0, fontFamily: uiTokens.typography.display.family, fontSize: uiTokens.typography.display.sizes.panel }}>{displayName}</h2>
            <p style={{ margin: 0, color: uiTokens.colors.inkMuted }}>{positioning}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: uiTokens.spacing.xs }}>
              {tags.map((tag) => (
                <span key={tag} style={{ padding: "8px 12px", borderRadius: 999, background: uiTokens.colors.lightSoft }}>
                  {tag}
                </span>
              ))}
            </div>
            <p style={{ margin: 0, color: uiTokens.colors.inkSoft }}>当前对象：{createdPersonaId ?? "未创建"}</p>
          </section>

          <div style={{ display: "grid", gap: uiTokens.spacing.md }}>
            <section
              style={{
                display: "grid",
                gap: uiTokens.spacing.sm,
                padding: uiTokens.spacing.lg,
                borderRadius: 28,
                background: "rgba(255,255,255,0.58)",
                border: `1px solid ${uiTokens.colors.lineLight}`,
              }}
            >
              <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.56 }}>资料管理</span>
              <strong>添加文本资料</strong>
              <p style={{ margin: 0, color: uiTokens.colors.inkMuted }}>默认主推文本资料，链接导入保留为次动作。</p>
              <button type="button">添加文本资料</button>
              <button type="button" style={{ background: uiTokens.colors.lightSoft, color: uiTokens.colors.ink, boxShadow: "none" }}>
                导入链接
              </button>
            </section>

            <section
              style={{
                display: "grid",
                gap: uiTokens.spacing.sm,
                padding: uiTokens.spacing.lg,
                borderRadius: 28,
                background: "rgba(255,255,255,0.58)",
                border: `1px solid ${uiTokens.colors.lineLight}`,
              }}
            >
              <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.56 }}>预览</span>
              <strong>先听它怎么开口</strong>
              <p style={{ margin: 0, color: uiTokens.colors.inkMuted }}>预览先于发布，先验证它是不是像你要的人。</p>
            </section>

            <section
              style={{
                display: "grid",
                gap: uiTokens.spacing.sm,
                padding: uiTokens.spacing.lg,
                borderRadius: 28,
                background: "rgba(255,255,255,0.58)",
                border: `1px solid ${uiTokens.colors.lineLight}`,
              }}
            >
              <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.56 }}>发布</span>
              <strong>最后才进入发布</strong>
              <p style={{ margin: 0, color: uiTokens.colors.inkMuted }}>先补资料、再预览，最后再提审。</p>
            </section>
          </div>
        </div>
      ) : null}
    </section>
  );
};
