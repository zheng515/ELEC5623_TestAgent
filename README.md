# ReqTest — Requirement-aware Verification Agent

USYD ELEC5623 Group 04：从自然语言需求到可追溯测试证据的验证工作台。

当前是**可运行的前后端框架**：创建项目、保存需求、创建联调任务、查看事件与下载报告已接通。真实 LLM、代码检查、pytest 沙箱和 mutation testing 尚未接入；系统不会将框架联调标记为成功验证。

## 技术栈

- 前端：React 19 + TypeScript + vinext / Vite，中文响应式工作台。
- 后端：FastAPI + Pydantic，版本化 REST API 与自动 OpenAPI 文档。
- 存储：SQLite，项目、任务、输入指纹、事件及报告持久化。
- 检查：pytest、Ruff、TypeScript、ESLint、生产构建；GitHub Actions 配置已提供。

## 本地启动

需要 Python 3.11+、Node.js 22.13+（推荐使用 `.nvmrc` 中的版本）。当前面向本地单用户开发，无需 LLM API Key。

本次搭建环境未预装 Node，因此已在被 Git 忽略的 `.tools/node` 中放置官方 Node 运行时。根目录脚本会自动使用它，不修改系统全局配置；其他成员新克隆仓库时仍需安装 Node。

在仓库根目录执行：

```bash
# 如使用 nvm：nvm install && nvm use
bash scripts/setup.sh
bash scripts/dev.sh
```

- 前端：http://localhost:3000
- 后端 API：http://127.0.0.1:8000/api/v1
- 接口文档：http://127.0.0.1:8000/docs

`Ctrl+C` 停止两端服务。启动脚本会检查端口占用，不会终止已有服务。Windows 用户可在 WSL 中运行脚本。

也可以分别在两个终端启动（方便后端热更新）：

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
cd frontend
npm run dev
```

前端通过 `/api` 开发代理访问后端。可将两端 `.env.example` 复制为各自目录中的 `.env` 后修改配置；默认值无需配置即可运行。数据库默认保存在 `backend/data/reqtest.db`（被 Git 忽略）。

## 可以体验的流程

1. 点击“新建项目”，填写项目名称、需求原文和可选仓库引用。
2. 也可以点击“填入运费需求示例”，再保存；示例是输入素材，不是伪造的验证结果。
3. 在“需求与行为”查看保存的需求。
4. 点击“创建联调任务”，后端保存输入指纹和任务记录。
5. 在“任务与报告”查看事件、待接入能力，下载 JSON 报告。
6. 刷新页面或重启后端，已保存的数据仍在。

联调任务状态为 `blocked`、模式为 `scaffold`，实际测试数为 `0`；行为列表为空，覆盖率和变异分数为 `null`（未评估）。仓库路径或 URL 仅保存为文本，尚不读取、克隆或执行代码。

## 项目结构

```text
backend/
  app/
    main.py                   # 应用工厂、生命周期、CORS
    schemas.py                # 需求、行为、任务、报告协议
    api/routes.py             # /api/v1 路由
    core/config.py            # 环境配置
    core/database.py          # SQLite 存取层
    services/orchestrator.py  # Agent 接口与诚实的 scaffold 实现
  tests/test_api.py           # 接口、持久化、输入验证、证据约束
  pyproject.toml
  requirements-dev.lock       # 已验证的完整开发依赖版本
frontend/
  app/page.tsx                # 工作台和四个功能视图
  app/layout.tsx              # 应用布局与元信息
  app/globals.css             # 响应式样式
  lib/api.ts                 # 统一请求、错误处理、报告下载
  lib/types.ts               # 前后端数据契约
  vite.config.ts             # 本地代理与构建
scripts/
  setup.sh                   # 安装依赖
  dev.sh                     # 启动两端
  check.sh                   # 完整检查
docs/architecture.md         # 接口与后续 Agent 接入约定
.github/workflows/ci.yml
```

前端沿用 Sites 提供的 vinext 工程结构；`frontend/.openai/hosting.json` 是模板元数据，当前未创建线上站点。此交付是前后端开发框架，服务均在本地运行。

## 验证

```bash
bash scripts/check.sh
```

检查包含后端 API 流程与持久化测试、静态检查、前端类型检查、Lint 和构建。前端 `npm test` 目前运行类型检查与 Lint，不代表浏览器端到端测试。

## 后续接入

先按 `docs/architecture.md` 固定数据契约，再将 `ScaffoldOrchestrator` 替换成真实工作流。需求分析、测试生成、失败诊断可逐步接入，执行代码前必须先完成隔离 Runner。耗时任务接入时，将当前同步联调接口升级为后台任务和状态查询。

当前没有账号体系、上传解析、后台队列、自动测试执行或线上部署。若后续分开部署前后端，需要配置 `VITE_API_BASE_URL`、后端 CORS、身份验证与安全的执行环境；开发代理不属于生产 API 网关。

参考：[Vite 官方文档](https://vite.dev/guide/)、[FastAPI 应用生命周期](https://fastapi.tiangolo.com/advanced/events/)。
