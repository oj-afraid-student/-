# 知序 · 立体几何学生端正式工程

本目录是前三周开发使用的独立 Next.js 工程。安装、运行、构建、数据库和测试均以 `platform/` 为工作目录。代码不读取或打包仓库根目录现有 `src/`、`data/`、`index.html` 或构建脚本。

## 首次启动

要求：Node.js **24.22.2**、pnpm **12.16.1**。项目通过 `.node-version`、`.nvmrc`、`packageManager` 和锁文件记录版本。

在 WSL 中，从已克隆的仓库进入正式工程：

```bash
cd ~/projects/-/platform
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

浏览器打开 <http://localhost:3000>，点击“检查服务连接”。成功表示页面与真实应用接口连通，不表示数据库或登录功能已经实现。

如果本机尚未安装 pnpm，可在安装对应 Node.js 后运行：

```bash
npm install --global pnpm@12.16.1
```

本次 WSL 的 Node.js 与 pnpm 安装在当前用户的 `~/.local/bin`。若当前终端找不到命令，先执行：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

其他成员按自己系统安装相同版本。使用 nvm 的成员可在本目录运行 `nvm install`、`nvm use`。Windows PowerShell 复制配置文件使用 `Copy-Item .env.example .env.local`。

首次启动无需数据库、老师服务器、AI 密钥或真实账号。业务页面使用样例的接入由赵景言与王宁岳按契约完成；当前只提供正式工程和真实健康接口。

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
| `src/features/auth/`、`practice/`    | 账号、练习与结果页面         | 赵景言                 |
| `src/features/learning/`、`history/` | 学习与历史页面               | 李梓禾                 |
| `src/server/auth/`、`db/`            | 真实会话、权限与数据库       | 穆泓烨                 |
| `src/server/catalog/`                | 知识与题目版本读取           | 李梓禾                 |
| `src/server/practice/`               | 练习、判题、提交与记录       | 王宁岳                 |
| `src/shared/contracts/`              | 公共请求响应类型             | 王宁岳；穆泓烨复核     |
| `src/shared/ui/`、`api/`             | 界面组件与前端请求封装       | 赵景言                 |
| `public/geometry/`                   | 正式几何配图                 | 李梓禾                 |
| `fixtures/`                          | 开发样例，公开数据与答案分开 | 按业务归属             |
| `db/`、工程配置、锁文件、CI          | 数据结构与公共基础           | 穆泓烨                 |

根布局、全局样式和首日联通组件在本次工程完成后交赵景言维护。

## 下一步从哪里开始

- **穆泓烨**：在 `src/server/auth/` 实现真实注册登录和会话，替换当前明确报 501 的守卫；完成真实数据库联调。
- **王宁岳**：在共享类型与 `docs/api.md` 基线上完善 11 个业务接口、样例及练习服务。
- **李梓禾**：按 `docs/data-model.md` 整理三个单元、配图、题目版本；实现 catalog 及学习、历史页面。
- **赵景言**：建立业务页面、公共组件与请求封装，先按契约接样例，再切换真实接口。

详细规则见 [协作与合入](docs/collaboration.md)、[接口基线](docs/api.md)、[数据模型](docs/data-model.md)、[数据库初始化](db/README.md) 和 [本轮范围与验收](docs/scope-and-handoff.md)、[验证记录](docs/verification.md)。
