# 李梓禾前端接入与验收记录

日期：2026-11-08（Asia/Shanghai）。依据《学生端后续开发完整分工表》和 [student-practice-handoff-v0.2](student-practice-handoff-v0.2.md)。

## 基线及修改范围

用户所说的 `feature/practice-v2` 在核验时没有同名远端分支。实际最新为 `feature/practice-v2-storage` 的 `cfede3e`（wny24，练习判题与持久化服务），已包含真实认证 `a2a1283` 和迁移 `28b92e2`。本轮以此创建 `codex/lizihe-frontend-integration`，交付前再次 fetch，基线未改变。

李梓禾负责公共 UI/统一请求、账号、选题/作答/结果、恢复和使用证据。复用既有八题型与 11 个调用；没有重写王宁岳的 DTO、练习服务，或穆泓烨的认证、数据库、迁移及检查配置，没有修改赵景言的学习/历史页面和内容。

本轮增量：

- 登录状态在回到页面时重新确认；401 返回登录并保留草稿；503/断网提示但不卸载正在填写的页面。当前 Cookie 用户变化时，按用户 ID 重建受保护页面，避免沿用前一账号缓存。
- 知识目录读取失败时仍保留选题表单，可用 ALL、题型/难度 FILTERED、EXPLICIT；已指定单元 ID 不被悄悄丢弃。创建与重练用同步锁阻止重复点击。
- 提交前把确切请求快照与草稿一起保存；兼容旧 v2 锁定草稿。提交不确定可重新查询状态；原快照损坏时阻止拼出不同请求，保留查询和新练习入口。
- 原答案重试、登录恢复、已保存但响应丢失的恢复继续使用同一 submissionId。400 才允许修正；其他不确定失败保留原内容。
- 结果页补全固定版本的原题选项、判断条目与分问，标明题号/版本。重练明确使用最新已发布版本；全部下架有清晰提示，旧结果保留。
- 新增四项草稿恢复测试、真实 PostgreSQL/浏览器自动验收、使用说明和证据。

## 实际验证

环境：Windows、Node 24.22.2、pnpm 12.16.1、本机 Edge 无头浏览器；桌面 1440×1000，手机 390×844。

| 检查                                         | 实际结果                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm check`                                 | 格式、ESLint、类型、41 项测试、生产构建通过（原 37 项全部保留，新增 4 项恢复测试） |
| `node scripts/check-contract-types.mjs`      | 38 份实际 JSON 样例严格类型检查通过                                                |
| `node scripts/check-frontend-boundaries.mjs` | 生产客户端无服务端答案规则/开发密码；源码无禁止导入和禁用界面文案                  |
| `node --test tests/frontend-integration.mjs` | 开发 HTTP 闭环 1 项通过                                                            |
| `node tests/frontend-browser.mjs`            | 开发样例 16 组桌面/手机场景通过，无脚本异常                                        |
| `node tests/frontend-real-browser.mjs`       | 真实认证、练习、答卷与分页使用 PostgreSQL 17.11 通过；详见机器记录                 |

真实验收独立创建随机 `frontend_test_*` schema，应用以**生产构建**运行，`ZHIXU_DEV_FIXTURES=0`。临时装入既有 24 题测试数据供服务选题，不拦截知识 API，不启用产品样例接口；结束后删除该测试 schema 并关闭测试应用。401/404/409、发布/退役与结果持久化走实际服务；网络中断和 503 使用浏览器网络拦截注入，不能据此宣称已模拟数据库故障或完成压力测试。

已通过的真实操作包括注册不自动登录、Cookie 登录、三种组题、显式题序、五题 3/5、24 题全部输入、Q05 的 false 与理由、Q06 三空、Q14 无序双值、Q24 三问、立即刷新、未答定位、断网后锁定、会话过期重登、相同快照重试、响应丢失后恢复唯一结果、11 已判/13 待复核及空分数、错题/整组重练、换版/全下架和原结果回看、双账号隔离、真实历史分页、手机提交及应用重启。

开发回归期间发现旧 `.next/dev` 缓存造成 `HMR hash mismatch` 连续刷新，备份并重建**本项目开发缓存**后通过回归；未修改依赖、Next 配置、检查规则或扩大忽略清单。若开发者遇到同样问题，先停止本项目 dev 进程，再重建其生成缓存。

## 复现真实浏览器验收

先按锁文件安装并 `pnpm build`。另外准备 Playwright 1.58.2 与本机 Edge（QA 工具，未加入应用依赖）。只指定一份本机隔离测试库，不使用共享或生产库。

```powershell
$env:ZHIXU_FRONTEND_TEST_DATABASE_URL='postgresql://测试账号:测试密码@127.0.0.1:15432/隔离测试库'
$env:ZHIXU_PLAYWRIGHT_MODULE='D:\工具\node_modules\playwright\index.mjs'
$env:ZHIXU_QA_OUTPUT='D:\前端验收输出'
node tests/frontend-real-browser.mjs
```

默认应用端口 4318，可用 `ZHIXU_FRONTEND_TEST_PORT` 指定；可用 `ZHIXU_BROWSER_EXECUTABLE` 指定浏览器。脚本只接受本机数据库地址，在新建 schema 执行 001/002，最后清理自身测试数据；运行前确认本机数据库账号具备创建 schema 权限。数据库连接、Cookie、密码、运行库和依赖不入库。

开发回归需先独立运行 `ZHIXU_DEV_FIXTURES=1 pnpm dev`，设置 `ZHIXU_TEST_URL`、`ZHIXU_PLAYWRIGHT_MODULE`、仓库外 `ZHIXU_QA_OUTPUT` 后执行对应脚本。开发与生产服务不要同时使用相同构建输出跑检查。

## 截图证据与复核边界

[真实浏览器机器记录](screenshots/frontend-2026-11-08/real-browser-results.json)、[开发浏览器机器记录](screenshots/frontend-2026-11-08/development-browser-results.json)。截图中的账号和文本均为隔离测试数据，未包含真实用户资料。

| 文件                                                                 | 场景与边界                             |
| -------------------------------------------------------------------- | -------------------------------------- |
| [01](screenshots/frontend-2026-11-08/01-真实选题-知识目录未接入.png) | 真接口选题；知识目录尚缺，其他入口可用 |
| [02](screenshots/frontend-2026-11-08/02-真实判题-五题三分.png)       | 五题 3 对 2 错，真实判题与固定原题     |
| [03](screenshots/frontend-2026-11-08/03-真实作答-三问.png)           | Q24 分问、草稿与 24 题导航             |
| [04](screenshots/frontend-2026-11-08/04-真实结果-待复核.png)         | 24 题三态、本人作答与解析              |
| [05](screenshots/frontend-2026-11-08/05-真实结果-下架提示.png)       | 全部下架重练失败，旧答卷仍可读         |
| [06](screenshots/frontend-2026-11-08/06-真实历史-分页.png)           | 复用历史页接真实分页                   |
| [07](screenshots/frontend-2026-11-08/07-手机真实三问.png)            | 390px 手机完整三问输入                 |
| [08](screenshots/frontend-2026-11-08/08-手机真实结果.png)            | 手机待复核结果与原文                   |
| [09](screenshots/frontend-2026-11-08/09-开发样例知识详情.png)        | 知识公式/定理/原图，仅开发样例         |
| [10](screenshots/frontend-2026-11-08/10-开发样例手机目录.png)        | 手机学习入口，仅开发样例               |

本轮没有确认正式内容复核、正式导入发布、知识 API、共享部署、真实数据库备份恢复、多人并发性能或人工复核后台已完成。数据库重启/恢复由穆泓烨继续验收；本轮验证的是**应用重启**后记录和会话仍可读。完整学习主线仍等待赵景言交付知识服务与复核后的已发布题库。对王宁岳的输入仍为原 v2 请求，不新增字段；共享公式/图片/错误组件可供赵景言直接复用。

使用路径和异常恢复见 [学生端使用说明](frontend-user-guide.md)。
