# 知序 · 立体几何学生端正式工程 v2.0

当前协作分支：`feature/platform-init`。`v2.0` 是本阶段版本标识。

本目录是独立 Next.js 正式工程。中期准备已结束，本轮按契约 v2 推进完整项目的学生端前端，覆盖六个知识单元、24 题与八种题型。安装、运行、构建、数据库和测试均以 `platform/` 为工作目录。代码不读取或打包仓库根目录现有 `src/`、`data/`、`index.html` 或构建脚本。

前端功能与联调说明见 [前端交接](docs/frontend-handoff.md)。默认请求 `/api/v1`，四个真实学生认证接口已接通，知识、练习、结果与历史接口仍待对应负责人实现。真实数据库启动、认证与验证方式见 [认证交接](docs/auth-handoff.md)。先进行本地页面开发时，显式启用 `ZHIXU_DEV_FIXTURES=1` 后运行 `pnpm dev`，在注册页自行创建开发账号。此模式的数据仅在内存中保存，重启后清空，生产环境始终禁用。

## v2.0 完成情况与实现缺口

当前完成的是正式学生端的前端和隔离开发环境流程：注册/登录/退出、六单元学习、24 题八题型作答、三种选题模式、本机草稿、提交恢复、结果三态、历史分页及当前结果错题重练。接口调用按契约 v2 封装；开发服务中的记录刷新和重登可保留，服务重启后清空。

当前正式工程**没有上传题目入口**，历史 V1.0 的伪上传与预设解析未迁入本工程。真实学生认证与 PostgreSQL 账号、会话持久化已接通；多题型数据库迁移、知识与练习等业务 API、业务数据持久化、DRAFT 内容发布及人工复核仍待接通。题目上传与 OCR/解析、条件确认和个人资料库、交互模型重构、知识画像及个性化测验也尚未完成。

v2.0 是当前开发成果归档，不能等同于完整产品上线。完整的已完成范围、理想目标缺口、体验命令与验证边界见 [仓库根 README](../README.md)。

## 首次启动

要求：Node.js **24.22.2**、pnpm **12.16.1**。项目通过 `.node-version`、`.nvmrc`、`packageManager` 和锁文件记录版本。

在 WSL 中，从已克隆的仓库进入正式工程：

```bash
cd ~/projects/-/platform
pnpm install --frozen-lockfile
cp .env.example .env.local
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

开发样例模式无需数据库、老师服务器或 AI 密钥。真实认证使用本机 PostgreSQL，关闭开发开关后可注册和登录；学习练习完整流程仍需其余业务服务接通。health 不检查数据库。

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

## 目录与维护人

| 目录                                 | 内容                         | 维护人                 |
| ------------------------------------ | ---------------------------- | ---------------------- |
| `src/app/`                           | 薄页面与 HTTP 接口入口       | 按业务归属，见协作说明 |
| `src/features/auth/`、`practice/`    | 账号、练习与结果页面         | 穆泓烨                 |
| `src/features/learning/`、`history/` | 本轮前端接入，内容后续维护   | 穆泓烨 / 李梓禾        |
| `src/server/auth/`、`db/`            | 真实会话、权限与数据库       | 赵景言                 |
| `src/server/catalog/`                | 知识与题目版本读取           | 李梓禾                 |
| `src/server/practice/`               | 练习、判题、提交与记录       | 王宁岳                 |
| `src/shared/contracts/`              | 公共请求响应类型             | 王宁岳；赵景言复核     |
| `src/shared/ui/`、`api/`             | 界面组件与前端请求封装       | 穆泓烨                 |
| `public/geometry/`                   | 正式几何配图                 | 李梓禾                 |
| `fixtures/`                          | 开发样例，公开数据与答案分开 | 按业务归属             |
| `db/`、工程配置、锁文件、CI          | 数据结构与公共基础           | 赵景言                 |

根布局、全局样式和公共前端组件由穆泓烨维护。

## 下一步从哪里开始

- **赵景言**：在 `src/server/auth/` 实现真实注册登录和会话，替换当前明确报 501 的守卫；完成真实数据库联调。
- **王宁岳**：按既有 v2 契约实现练习、判题、结果和历史服务，接入认证与新版持久化结构。
- **李梓禾**：复核六单元、24 题和配图，实现 catalog；在已有组件上继续维护学习内容。
- **穆泓烨**：在本轮前端基线上逐个联调真实 API，验证提交恢复、持久化及跨账号隔离。

详细规则见 [协作与合入](docs/collaboration.md)、[接口基线](docs/api.md)、[数据模型](docs/data-model.md)、[数据库初始化](db/README.md) 和 [本轮范围与验收](docs/scope-and-handoff.md)、[验证记录](docs/verification.md)。

## 本轮交接状态

已按任务交换更新负责人。学习/历史页面已由穆泓烨完成本轮统一前端接入，李梓禾继续维护内容与 catalog，可在此组件基线上继续推进。具体已实现页面、开发开关、测试入口与上游依赖见 [前端交接](docs/frontend-handoff.md) 和 [本轮验证](docs/frontend-verification.md)。
