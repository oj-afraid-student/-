# 知序 · 立体几何学生端正式工程 v2.0

当前工作分支：`feature/practice-v2-storage`；团队基础分支：`feature/platform-init`。`v2.0` 是本阶段版本标识。

本目录是独立 Next.js 正式工程。中期准备已结束，本轮按契约 v2 推进完整项目的学生端前端，覆盖六个知识单元、24 题与八种题型。安装、运行、构建、数据库和测试均以 `platform/` 为工作目录。代码不读取或打包仓库根目录现有 `src/`、`data/`、`index.html` 或构建脚本。

前端功能与联调说明见 [前端交接](docs/frontend-handoff.md)。默认请求 `/api/v1`，四个真实学生认证接口已接通，五个练习/提交/结果/历史接口已实现，知识接口、正式内容导入及发布仍待对应负责人完成。实现和验证见[练习服务交接](docs/practice-handoff.md)。真实数据库启动、认证与验证方式见 [认证交接](docs/auth-handoff.md)。先进行本地页面开发时，显式启用 `ZHIXU_DEV_FIXTURES=1` 后运行 `pnpm dev`，在注册页自行创建开发账号。此模式的数据仅在内存中保存，重启后清空，生产环境始终禁用。

## 2026-11-08 前端接入进展

李梓禾基于 `cfede3e` 完成前端接入与恢复增强：真实账号、24 题八题型、三种组题、原答案重试、手动查询提交状态、固定版本原题回看、换版/下架重练和手机操作已在隔离 PostgreSQL 验收。开发样例回归另行通过。知识接口、内容复核导入与发布、共享部署及人工复核后台仍待完成，当前没有传题功能。

见 [使用说明与操作步骤](docs/frontend-user-guide.md) 和 [本轮验收记录与截图](docs/frontend-integration-verification.md)。

## v2.0 完成情况与实现缺口

当前完成的是正式学生端的前端和隔离开发环境流程：注册/登录/退出、六单元学习、24 题八题型作答、三种选题模式、本机草稿、提交恢复、结果三态、历史分页及当前结果错题重练。接口调用按契约 v2 封装；开发服务中的记录刷新和重登可保留，服务重启后清空。

当前正式工程**没有上传题目入口**，历史 V1.0 的伪上传与预设解析未迁入本工程。真实学生认证与 PostgreSQL 账号、会话持久化已接通；多题型存储由 002 迁移提供，五个练习业务 API 与真实答卷持久化已接通；知识 API、内容导入及 DRAFT 内容审核发布仍待完成。题目上传与 OCR/解析、条件确认和个人资料库、交互模型重构、知识画像及个性化测验也尚未完成。

v2.0 是当前开发成果归档，不能等同于完整产品上线。完整的已完成范围、理想目标缺口、体验命令与验证边界见 [仓库根 README](../README.md)。

## 首次启动

要求：Node.js **24.22.2**、pnpm **12.16.1**。项目通过 `.node-version`、`.nvmrc`、`packageManager` 和锁文件记录版本。

在 WSL 中，从已克隆的仓库进入正式工程：

```bash
cd ~/projects/-/platform
pnpm install --frozen-lockfile
test -f .env.local || cp .env.example .env.local
pnpm dev
```

浏览器打开 <http://localhost:3000> 进入学生端。健康接口位于 `/api/v1/health`；该接口成功只表示应用服务可访问，不表示数据库或真实业务已经实现。

如果本机尚未安装 pnpm，可在安装对应 Node.js 后运行：

```bash
npm install --global pnpm@12.16.1
```

本次 WSL 的 Node.js 与 pnpm 安装在当前用户的 `~/.local/bin`。若当前终端找不到命令，先执行：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

其他成员按自己系统安装相同版本。使用 nvm 的成员可在本目录运行 `nvm install`、`nvm use`。Windows PowerShell 复制配置文件使用 `Copy-Item .env.example .env.local`。

开发样例模式无需数据库、老师服务器或 AI 密钥。真实认证及练习服务使用 PostgreSQL，关闭开发开关后可注册、登录并访问五个练习接口；完整学习流程仍需知识接口与正式已发布内容。health 不检查数据库。

## 常用命令

| 命令                | 用途                                          |
| ------------------- | --------------------------------------------- |
| `pnpm dev`          | 本地开发                                      |
| `pnpm lint`         | 代码检查与导入边界检查                        |
| `pnpm typecheck`    | 生成 Next.js 路由类型，再执行 TypeScript 检查 |
| `pnpm format`       | 格式化本工程                                  |
| `pnpm format:check` | 检查格式                                      |
| `pnpm test`         | PostgreSQL 约束、迁移与回滚测试，无需本地服务 |
| `pnpm build`        | 生产构建                                      |
| `pnpm start`        | 运行已构建应用                                |
| `pnpm check`        | 顺序执行格式、代码、类型、测试、构建检查      |
| `pnpm db:check`     | 检查真实 PostgreSQL 连接                      |
| `pnpm db:migrate`   | 执行版本化 SQL 迁移                           |
| `pnpm db:seed`      | 幂等导入三个单元的元数据                      |

## 分工与接入

以[学生端开发交接 v0.2](docs/student-practice-handoff-v0.2.md)和《学生端后续开发完整分工表》为准。

| 成员   | 当前维护范围                                    |
| ------ | ----------------------------------------------- |
| 穆泓烨 | 工程、CI、认证、数据库迁移、部署及运行交付      |
| 王宁岳 | v2 契约和类型、练习、判题、提交、结果和历史服务 |
| 赵景言 | 内容与题库、知识服务、学习与历史页面            |
| 李梓禾 | 公共前端、账号、练习和结果页面                  |

接入前阅读[协作约定](docs/collaboration.md)、[接口契约](docs/api.md)、[存储交接](docs/contracts/storage-handoff.md)和[数据库运行说明](db/README.md)。现有页面和样例可独立开发，正式验收时关闭开发样例。
