"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { api, downloadReport } from "@/lib/api";
import type {
  Project,
  ProjectCreate,
  SystemInfo,
  VerificationRun,
} from "@/lib/types";

type View = "overview" | "requirements" | "runs" | "integrations";
const views: { id: View; label: string; symbol: string }[] = [
  { id: "overview", label: "验证工作台", symbol: "◫" },
  { id: "requirements", label: "需求与行为", symbol: "≡" },
  { id: "runs", label: "任务与报告", symbol: "↗" },
  { id: "integrations", label: "模块接入", symbol: "⊞" },
];
const blank: ProjectCreate = {
  name: "",
  description: "",
  repository_ref: "",
  requirements_text: "",
};
const example: ProjectCreate = {
  name: "Shipping service",
  description: "验证运费规则、金额边界和非法输入。",
  repository_ref: "",
  requirements_text:
    "R1：订单金额以整数分表示，金额不少于 10,000 分时免运费，否则收取 1,000 分。\nR2：负数金额必须抛出 ValueError。",
};
const date = (value: string) =>
  new Date(value).toLocaleString("zh-CN", { hour12: false });
const message = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请重试。";

export default function Workbench() {
  const [view, setView] = useState<View>("overview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [runData, setRunData] = useState<{
    projectId: string;
    revision: number;
    items: VerificationRun[];
  }>({ projectId: "", revision: 0, items: [] });
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProjectCreate>(blank);
  const [activeRunId, setActiveRunId] = useState("");
  const [reload, setReload] = useState(0);
  const runsLoading =
    Boolean(selectedId) &&
    (runData.projectId !== selectedId || runData.revision !== reload);
  const runs = runsLoading ? [] : runData.items;
  const project = projects.find((item) => item.id === selectedId);
  const latest = runs[0];
  const activeRun = runs.find((run) => run.id === activeRunId) ?? latest;

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.projects(), api.system()])
      .then(([items, info]) => {
        if (cancelled) return;
        setProjects(items);
        setSystem(info);
        setSelectedId((id) =>
          items.some((item) => item.id === id) ? id : (items[0]?.id ?? ""),
        );
        setError("");
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSystem(null);
          setError(message(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) return;
    api
      .runs(selectedId)
      .then((items) => {
        if (!cancelled)
          setRunData({ projectId: selectedId, revision: reload, items });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(message(err));
          setRunData({ projectId: selectedId, revision: reload, items: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, reload]);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await api.createProject(form);
      setProjects((items) => [created, ...items]);
      selectProject(created.id);
      setShowForm(false);
      setForm(blank);
      setView("overview");
      setNotice("项目与需求已保存。可以创建联调任务，查看状态与报告链路。");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  async function createRun() {
    if (!project) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const run = await api.createRun(project.id);
      setRunData((current) => ({
        projectId: project.id,
        revision: reload,
        items: [
          run,
          ...(current.projectId === project.id ? current.items : []),
        ],
      }));
      setActiveRunId(run.id);
      setView("runs");
      setNotice("联调任务已记录。真实验证模块尚未接入，任务已暂停。");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  async function exportReport(run: VerificationRun) {
    setBusy(true);
    setError("");
    try {
      await downloadReport(run.id);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  function selectProject(id: string) {
    if (id === selectedId) return;
    setActiveRunId("");
    setSelectedId(id);
    setNotice("");
  }
  function reconnect() {
    setLoading(true);
    setActiveRunId("");
    setReload((n) => n + 1);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="ReqTest 首页">
          <span className="brand-mark">rt</span>
          <span>
            reqtest<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-label">GROUP 04 / WORKSPACE</div>
        <nav aria-label="工作区导航">
          {views.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <span aria-hidden="true">{item.symbol}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="small-label">REQUIREMENT → EVIDENCE</span>
          <p>
            每一个验证结论，
            <br />
            都有据可循。
          </p>
          <span className="version">ELEC5623 · v0.1.0</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="muted">工作区</span>
            <span className="breadcrumb">/</span>
            {views.find((item) => item.id === view)?.label}
          </div>
          <div className="topbar-right">
            <span className={`connection ${system ? "online" : ""}`}>
              <i />
              {loading ? "连接中" : system ? "API 已连接" : "API 未连接"}
            </span>
            <span className="avatar">G4</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">REQUIREMENT-AWARE VERIFICATION</div>
              <h1>
                {view === "overview"
                  ? "从需求，走向验证。"
                  : views.find((item) => item.id === view)?.label}
              </h1>
              <p className="subtitle">
                {view === "overview"
                  ? "连接需求、代码与测试，让验证缺口清晰可见。"
                  : view === "requirements"
                    ? "保留需求来源，建立后续行为分析的起点。"
                    : view === "runs"
                      ? "追踪每一次决策、执行证据与尚待解决的问题。"
                      : "查看框架能力，以及下一步需要接入的验证模块。"}
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => {
                setShowForm(true);
                setNotice("");
              }}
              disabled={loading || !system || busy}
            >
              ＋ 新建项目
            </button>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <span>{error}</span>
              <button
                className="text-button"
                onClick={reconnect}
                disabled={loading || busy}
              >
                重新连接
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}
          {showForm && (
            <section
              className="panel create-panel"
              aria-labelledby="new-project-heading"
            >
              <div className="section-heading">
                <div>
                  <div className="eyebrow">NEW PROJECT</div>
                  <h2 id="new-project-heading">创建验证项目</h2>
                </div>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setShowForm(false)}
                >
                  取消
                </button>
              </div>
              <form onSubmit={createProject}>
                <div className="form-grid">
                  <label>
                    项目名称 *
                    <input
                      required
                      maxLength={100}
                      placeholder="例如：Shipping service"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    仓库引用
                    <input
                      maxLength={500}
                      placeholder="仓库 URL 或路径（仅保存引用）"
                      value={form.repository_ref}
                      onChange={(e) =>
                        setForm({ ...form, repository_ref: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  项目描述
                  <input
                    maxLength={2000}
                    placeholder="这个项目需要验证什么？"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </label>
                <label>
                  需求原文 *
                  <textarea
                    required
                    rows={5}
                    maxLength={50000}
                    placeholder="粘贴自然语言需求，保留规则、条件、边界和异常约定。"
                    value={form.requirements_text}
                    onChange={(e) =>
                      setForm({ ...form, requirements_text: e.target.value })
                    }
                  />
                </label>
                <div className="form-footer">
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => setForm(example)}
                  >
                    填入运费需求示例
                  </button>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={
                      busy ||
                      !form.name.trim() ||
                      !form.requirements_text.trim()
                    }
                  >
                    {busy ? "保存中…" : "保存项目"}
                  </button>
                </div>
              </form>
            </section>
          )}
          <div className="mode-banner">
            <span className="badge amber">框架阶段</span>
            <p>
              项目与任务数据会真实保存。需求分析、测试执行及变异分析尚未接入，所有验证指标保持未评估。
            </p>
          </div>
          {view !== "integrations" && (
            <div className="project-toolbar">
              <label htmlFor="project-select">当前项目</label>
              <select
                id="project-select"
                value={selectedId}
                disabled={loading || busy || !projects.length}
                onChange={(e) => selectProject(e.target.value)}
              >
                <option value="" disabled>
                  {loading ? "正在加载…" : "选择项目"}
                </option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <span className="muted">{projects.length} 个项目</span>
            </div>
          )}
          {loading ? (
            <section className="panel empty-state" role="status">
              <span className="spinner" />
              <h2>正在连接工作区</h2>
              <p>加载项目与模块状态…</p>
            </section>
          ) : view === "integrations" ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">SYSTEM CAPABILITIES</div>
                  <h2>模块接入状态</h2>
                </div>
                <span className="badge neutral">
                  v{system?.version ?? "0.1.0"}
                </span>
              </div>
              {system?.integrations.map((item) => (
                <div className="integration-row" key={item.key}>
                  <span
                    className={`integration-icon ${item.status === "ready" ? "ready" : ""}`}
                    aria-hidden="true"
                  >
                    {item.status === "ready" ? "✓" : "○"}
                  </span>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                  </div>
                  <span
                    className={`badge ${item.status === "ready" ? "teal" : "neutral"}`}
                  >
                    {item.status === "ready" ? "已就绪" : "待接入"}
                  </span>
                </div>
              ))}
              {!system && <p>连接后端后可查看模块状态。</p>}
            </section>
          ) : !project ? (
            <section className="panel empty-state">
              <div className="empty-symbol" aria-hidden="true">
                ↗
              </div>
              <div className="eyebrow">YOUR FIRST VERIFICATION PROJECT</div>
              <h2>给验证一个清晰的起点</h2>
              <p>
                创建项目并添加需求，开始建立
                <br />
                Requirement → Behavior → Test → Evidence 的关联。
              </p>
              <button
                className="button primary"
                disabled={!system || busy}
                onClick={() => setShowForm(true)}
              >
                创建第一个项目
              </button>
              <span className="empty-note">
                Python / pytest · 需求驱动 · 证据可追溯
              </span>
            </section>
          ) : view === "overview" ? (
            <>
              <div className="metric-grid">
                <Metric label="已拆解行为" value="—" detail="等待需求分析" />
                <Metric
                  label="语义需求覆盖率"
                  value="—"
                  detail="尚无有效执行证据"
                />
                <Metric label="变异分数" value="—" detail="等待变异分析" />
                <Metric
                  label="已记录任务"
                  value={runsLoading ? "…" : String(runs.length)}
                  detail="框架联调记录"
                />
              </div>
              <div className="content-grid">
                <section className="panel project-card">
                  <div className="section-heading">
                    <div className="eyebrow">PROJECT CONTEXT</div>
                    <span className="badge neutral">Python / pytest</span>
                  </div>
                  <h2>{project.name}</h2>
                  <p className="project-description">
                    {project.description || "暂未添加项目描述。"}
                  </p>
                  <div className="repository">
                    <span className="small-label">仓库引用</span>
                    <code>{project.repository_ref || "尚未提供"}</code>
                    <span className="muted">
                      当前仅保存引用，尚未读取仓库。
                    </span>
                  </div>
                  <div className="card-footer">
                    <button
                      className="text-button"
                      onClick={() => setView("requirements")}
                    >
                      查看需求原文 ↗
                    </button>
                    <span className="muted">{date(project.created_at)}</span>
                  </div>
                </section>
                <section className="panel workflow-card">
                  <div className="eyebrow">CLOSED-LOOP WORKFLOW</div>
                  <h2>验证闭环</h2>
                  <div className="workflow">
                    {["Understand", "Measure", "Improve", "Re-measure"].map(
                      (step, i) => (
                        <div className="workflow-step" key={step}>
                          <span>{String(i + 1).padStart(2, "0")}</span>
                          <strong>{step}</strong>
                          <small>待接入</small>
                        </div>
                      ),
                    )}
                  </div>
                  <button
                    className="button primary full"
                    onClick={createRun}
                    disabled={busy || runsLoading || !system}
                  >
                    {busy ? "创建中…" : "创建联调任务 →"}
                  </button>
                  <p className="helper">
                    记录输入并生成待接入报告，不执行代码。
                  </p>
                </section>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">LATEST ACTIVITY</div>
                    <h2>最近任务</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setView("runs")}
                  >
                    查看全部 ↗
                  </button>
                </div>
                {runsLoading ? (
                  <p role="status">正在加载任务…</p>
                ) : latest ? (
                  <button
                    className="run-summary"
                    onClick={() => {
                      setActiveRunId(latest.id);
                      setView("runs");
                    }}
                  >
                    <span className="run-mark">↗</span>
                    <div>
                      <strong>联调任务 · {latest.id.slice(0, 8)}</strong>
                      <small>{date(latest.created_at)}</small>
                    </div>
                    <span className="badge amber">等待模块接入</span>
                  </button>
                ) : (
                  <div className="inline-empty">
                    还没有任务记录。创建联调任务后，状态与报告会显示在这里。
                  </div>
                )}
              </section>
            </>
          ) : view === "requirements" ? (
            <>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">SOURCE OF TRUTH</div>
                    <h2>需求原文</h2>
                  </div>
                  <span className="badge neutral">
                    {project.requirements_text.length} 字符
                  </span>
                </div>
                <pre className="requirements-text">
                  {project.requirements_text}
                </pre>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">BEHAVIOR TRACEABILITY</div>
                    <h2>需求行为映射</h2>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>需求行为</th>
                        <th>代码引用</th>
                        <th>对应测试</th>
                        <th>执行证据</th>
                        <th>验证状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={5} className="table-empty">
                          需求分析模块尚未接入，暂无行为拆解与映射结果。
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="status-legend">
                  <span>● Verified</span>
                  <span>◐ Partially Verified</span>
                  <span>○ Unverified</span>
                  <span>? Uncertain</span>
                </div>
              </section>
            </>
          ) : (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">RUN HISTORY & EVIDENCE</div>
                  <h2>任务与验证报告</h2>
                </div>
                <button
                  className="button secondary"
                  onClick={createRun}
                  disabled={busy || runsLoading || !system}
                >
                  {busy ? "处理中…" : "＋ 创建联调任务"}
                </button>
              </div>
              {runsLoading ? (
                <p role="status" className="inline-empty">
                  正在加载任务…
                </p>
              ) : !runs.length ? (
                <div className="inline-empty">
                  暂无任务。创建联调任务以检查前后端数据链路。
                </div>
              ) : (
                <div className="runs-layout">
                  <div className="run-list" aria-label="任务列表">
                    {runs.map((run) => (
                      <button
                        className={`run-list-item ${activeRun?.id === run.id ? "selected" : ""}`}
                        key={run.id}
                        onClick={() => setActiveRunId(run.id)}
                        aria-pressed={activeRun?.id === run.id}
                      >
                        <strong>任务 {run.id.slice(0, 8)}</strong>
                        <small>{date(run.created_at)}</small>
                        <span className="badge amber">等待模块接入</span>
                      </button>
                    ))}
                  </div>
                  {activeRun && (
                    <article className="report">
                      <div className="section-heading">
                        <h3>联调报告</h3>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => exportReport(activeRun)}
                        >
                          下载 JSON ↓
                        </button>
                      </div>
                      <p>{activeRun.report.summary}</p>
                      <dl className="report-facts">
                        <div>
                          <dt>运行模式</dt>
                          <dd>Scaffold</dd>
                        </div>
                        <div>
                          <dt>实际执行测试</dt>
                          <dd>{activeRun.report.executed_tests}</dd>
                        </div>
                        <div>
                          <dt>语义覆盖率</dt>
                          <dd>
                            {activeRun.report.semantic_coverage === null
                              ? "未评估"
                              : `${activeRun.report.semantic_coverage}%`}
                          </dd>
                        </div>
                      </dl>
                      <h3>事件记录</h3>
                      <ol className="event-list">
                        {activeRun.events.map((event) => (
                          <li key={event.id}>
                            <small>
                              {date(event.created_at)} · {event.stage}
                            </small>
                            <p>{event.message}</p>
                          </li>
                        ))}
                      </ol>
                      <h3>待接入能力</h3>
                      <ul className="issue-list">
                        {activeRun.report.unresolved_issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                      <details>
                        <summary>查看输入指纹</summary>
                        <code className="fingerprint">
                          {activeRun.input_sha256}
                        </code>
                        <p className="helper">
                          SHA-256 绑定保存的项目输入，不代表仓库文件快照。
                        </p>
                      </details>
                    </article>
                  )}
                </div>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>REQTEST / GROUP 04</span>
            <span>Understand → Measure → Improve → Re-measure</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
