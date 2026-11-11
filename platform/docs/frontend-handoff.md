# 学生端前端交接（契约 v2）

日期：2026-11-08（Asia/Shanghai）。中期准备已结束，当前面向完整项目开发。

## 实现范围与负责人

现有学生端页面是本轮接入的起点。李梓禾负责公共布局、账号、选题、作答和结果，赵景言负责内容、知识、学习与历史。穆泓烨负责工程、认证、数据库和部署，王宁岳维护契约与练习服务。完整任务见[学生端开发交接 v0.2](student-practice-handoff-v0.2.md)。

## 本轮接入更新

以 `feature/practice-v2-storage` 的 `cfede3e` 为基线，已关闭开发样例验证真实认证、24 题八题型、提交恢复、版本与下架重练、双账号隔离和应用重启。新增非阻塞会话检查、目录失败仍可选题、持久化原提交快照、手动查询恢复，以及结果页完整原选项/分问。知识 API 和正式内容复核发布仍待赵景言接通，不能把隔离测试库装入 fixture 当作正式题库发布。

交付：[使用说明与操作步骤](frontend-user-guide.md)、[本轮验收记录及截图](frontend-integration-verification.md)。

## 路由与代码入口

| 路由              | 组件                               | 数据                             |
| ----------------- | ---------------------------------- | -------------------------------- |
| /                 | 转到 /learn                        | 无                               |
| /register、/login | features/auth/auth-form            | register、login、me              |
| /learn            | features/learning/learning-view    | knowledge-points                 |
| /learn/[id]       | 同上 KnowledgeView                 | knowledge-points/:id             |
| /practice/new     | features/practice/practice-builder | knowledge-points、createPractice |
| /practice/[id]    | features/practice/practice-view    | practice、submit                 |
| /results/[id]     | features/practice/result-view      | submission（id 是 submissionId） |
| /history          | features/history/history-view      | history                          |

src/shared/api/learning-api.ts 是 11 个方法的唯一业务请求入口，页面不散写 URL。默认使用 /api/v1，Cookie 同源发送，GET/退出不附带 JSON body。加载、401、404、409、501、503、无效响应和断网有独立处理；不会因真实接口失败而回退成功样例。读取失败与空列表不是同一状态。

src/shared/ui 提供布局、图标、公式文本、原图、状态、错误和空数据组件。src/app/(student)/layout.tsx 统一执行登录门禁。前端门禁仅控制导航，真实资源授权仍由后端完成。

## 八题型与提交

- 单选、多选、多空、判断说明、分问过程共五组控件，覆盖 24 题的八种 type。
- 多选完整集合、Q06 三空、Q14 一空两个值、Q24 三问分别保存。false 是已选择的判断值，不能当作未答。
- 文本值 trim 后最多 200 字符，理由/分问过程最多 10000 字符，提交按 UTF-8 计算不超过 1 MiB。
- 作答状态和提交键均为 practiceItemId。全部题项填写完整后才允许确认提交，不提交 userId、score、reference 等额外字段。
- ALL、FILTERED、EXPLICIT 三种创建模式均有界面。题数、题序从 Practice 读取，不设五题限制；筛选不随机，题量不足显示服务端冲突信息。
- 前端只校验结构，不求值数学表达式、不判断证明正误。Unicode 文本通过 React 转义呈现，未使用 eval 或 HTML 注入。

## 草稿、提交与恢复

草稿保存在浏览器 localStorage，按用户 ID、练习 ID 与题目版本隔离。输入事件内立即保存，立即刷新仍可恢复。浏览器存储禁用或写满会明确提示；本机草稿不是服务端保存成功。退出账号成功后清除该账号的本机草稿。

提交前显示确认；发送中禁用重复提交。网络不确定、503 或冲突时保留并锁定原快照，先读取练习状态：已提交就恢复同一结果，否则提供原答案重试。400 结构校验失败允许修改。刷新锁定的草稿仍使用原内容重试，提交成功按 submissionId 进入结果页。正式练习后端已实现事务、行锁和幂等；页面按钮禁用仍用于防止误操作。

结果按 CORRECT / INCORRECT / PENDING_REVIEW 三态处理。存在待复核题时 score=null，只显示已判、已判正确和待复核题数。错误筛选不包含待复核；重练错题或同一题组均通过 EXPLICIT 新建练习，旧结果不覆盖。历史调用服务端分页，按契约返回顺序呈现。

## 两种运行模式

默认模式不启用样例：按 .env.example 配置，运行 pnpm dev，客户端访问 /api/v1。上游已提供 health 和四个真实认证接口，五个练习/提交/结果/历史正式接口也已实现；知识接口与正式内容导入发布待接通。详见[练习服务交接](practice-handoff.md)。

开发模式仅供本地 UI、接口结构和回归使用：

```powershell
$env:ZHIXU_DEV_FIXTURES='1'
pnpm dev
```

```bash
ZHIXU_DEV_FIXTURES=1 pnpm dev
```

也可在不提交的 .env.local 中设置。自行在注册页创建满足格式要求的账号，无固定账号或预填答案。开发 Cookie 与正式认证分离；开发账号、练习和记录只保存在进程内存，刷新与重登可回看，重启后清空。开发页顶部始终有环境说明。

独立入口 /api/development/[...segments] 只有 NODE_ENV=development 且显式开启开关时可用，生产环境始终返回 404。它使用服务器端 fixture 校验和计分，不把正确答案样例导入浏览器；DRAFT 题只用于此开发模式。正式 /api/v1、认证守卫和数据库结构没有被替换。

## 联调顺序与未完成依赖

1. 李梓禾验证现有四个正式认证接口及 Cookie；注册成功不自动登录，CurrentUser 只含 id、username。
2. 赵景言接入六个知识单元的目录、详情与不可变题目版本，完成 DRAFT 内容复核。
3. 穆泓烨提供 002 迁移及存储验证。王宁岳已接入创建、读取、提交、结果和历史，现有页面可按原DTO联调。
4. 关闭开发开关，逐个验证真实接口，检查刷新、重启、重登和双账号权限。前端组件无需改变 DTO。
5. 人工复核的角色、权限、录入接口另行定义；本轮不模拟复核自动完成。

资料上传、AI 解析、物理与知识画像没有本轮业务接口，继续保留在历史原型中；本轮没有虚构这些功能已实现。

## 验证命令

使用 Node 24.22.2、pnpm 12.16.1；不修改版本约束、锁文件或 ESLint 边界。

```text
pnpm install --frozen-lockfile
pnpm check
node scripts/check-contract-types.mjs
node scripts/check-frontend-boundaries.mjs
```

开发服务器运行时，在另一个终端执行：

```text
node --test tests/frontend-integration.mjs
```

生产构建后以 `pnpm start --port 3001` 运行，另执行 `node --test tests/frontend-production.mjs`；可故意设 `ZHIXU_DEV_FIXTURES=1` 验证生产强制关闭开发接口。不要将生产自测服务当作已接通真实业务的版本。

可选浏览器验收位于 tests/frontend-browser.mjs，使用单独安装的 Playwright 1.58.2 与本机 Edge/Chrome，不改变项目依赖。将 ZHIXU_PLAYWRIGHT_MODULE 指向该工具的 playwright/index.mjs；非默认浏览器可设置 ZHIXU_BROWSER_EXECUTABLE。ZHIXU_TEST_URL 默认 http://127.0.0.1:3000，ZHIXU_QA_OUTPUT 可设为仓库外截图目录。执行 node tests/frontend-browser.mjs。

完整检查、HTTP 和浏览器测试各有验证边界；开发模式通过不代表真实数据库、正式认证和判题服务通过。旧开发样例记录见 frontend-verification.md；本轮真实 PostgreSQL 与页面证据见 [前端接入验收](frontend-integration-verification.md)。
