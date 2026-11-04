# 真实学生认证交接

本轮实现真实 PostgreSQL 账号与数据库会话。仅使用现有 `app_user`、`app_session` 表，不新增教师、班级或多题型存储设计，不改写已执行的 `001_initial.sql`。

## 保存的信息

- `app_user`：用户编号、规范化用户名、带独立盐的密码哈希、注册时间；不保存明文密码。
- `app_session`：会话编号、用户归属、随机令牌的 SHA-256 哈希、创建时间、过期时间。浏览器仅持有随机令牌，服务端不信任浏览器提供的用户编号。
- 现有知识、题目、练习和提交表仍保留首版结构。新版多题型迁移由穆、王、赵另行确认，本轮不导入业务题库。

## 接口与公共方法

`/api/v1/auth/register`（POST）、`login`（POST）、`logout`（POST）、`me`（GET）遵守现有 `docs/api.md`。注册201且不自动登录；重复用户名409；凭据错误和无会话401；退出幂等200。

其他服务从 `@/server/auth` 导入 `requireCurrentUser(): Promise<CurrentUser>`。成功仅返回 `{ id, username }`；失败抛出统一 `ApiError`。业务仍须根据该用户校验每份练习、结果的归属。

用户名 trim 并转小写，4—20位ASCII字母、数字或下划线；密码不trim，8—64字符。拒绝额外字段、非法JSON、超过1MiB的正文及跨站账号写入请求。返回值不包含密码、密码哈希或会话令牌，并禁止缓存。

密码使用Node.js异步scrypt（N=32768、r=8、p=3，独立16字节盐）。会话令牌由32字节安全随机数生成，数据库仅保存哈希，有效期8小时。重新登录轮换当前浏览器的旧会话，退出删除对应会话；过期会话立即拒绝访问。

Cookie名为 `zhixu_session`，Path=/，HttpOnly，SameSite=Lax；生产环境启用Secure，需HTTPS。开发Cookie与正式Cookie隔离。当前使用数据库随机会话，不使用JWT，也不依赖 `SESSION_SECRET`；环境模板中的该字段仅保留供后续方案使用。

## 本地启动

要求现有Node 24.22.2和pnpm 12.16.1。将真实连接写入不提交的 `platform/.env.local`，设置 `ZHIXU_DEV_FIXTURES=0`。Docker可用时沿用 `compose.yaml`；也可以使用WSL直接安装的PostgreSQL 17，不依赖老师服务器。

```bash
cd ~/projects/-/platform
export PATH="$HOME/.local/bin:$PATH"
pnpm db:check
pnpm db:migrate
pnpm dev
```

`db:seed`只创建三个核心单元元数据，不创建账号、题目或成绩；实际账号通过注册接口创建。健康接口只证明应用进程可访问，数据库连接请用 `db:check` 验证。

真实认证验证不需要知识或练习接口就绪。关闭开发开关后，账号页面可调用真实认证；登录后其他页面若报告未接通业务，按各模块任务继续开发，不回退开发样例冒充成功。

## 验证

常规检查执行 `pnpm check`。另启动本机应用（例如端口3100），执行明确针对真实数据库的认证测试：

```bash
ZHIXU_AUTH_TEST_URL=http://127.0.0.1:3100 node --env-file=.env.local --test tests/auth-integration.mjs
```

测试仅允许本机应用与本机数据库，使用随机命名的测试账号，结束时只清理这批账号和对应会话。覆盖严格输入、注册不自动登录、重复注册、带空格密码、独立盐、会话哈希与轮换、过期、退出、双账号和并发注册。

还须验证：重启应用及PostgreSQL后账号和有效会话仍可读取；数据库暂不可用时接口返回503且不误报成功；生产Cookie设置正确。开发适配测试不代替这些真实认证验证。

参考：Node.js Crypto文档与OWASP Password Storage Cheat Sheet；框架行为按项目安装版本的Next.js文档核对。

- https://nodejs.org/docs/latest-v24.x/api/crypto.html
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

## 本机已完成的验证

2026年11月2日在 Ubuntu 22.04 WSL2、Node 24.22.2、pnpm 12.16.1、PostgreSQL 17.11 上验证：

- `db:check` 与 `001_initial.sql` 的真实迁移通过。
- `pnpm check` 通过，包含26项常规测试（原有25项及真实密码模块测试）与生产构建。
- 真实认证HTTP测试通过，共7项（1项总流程与6组子场景）。
- 应用重启后，同一账号和会话仍可读取；PostgreSQL重启后亦保留。
- 暂停数据库时读取当前用户与登录返回503，登录不签发成功Cookie；恢复后可继续使用。
- 生产Cookie带Secure与HttpOnly；即使误开开发开关，开发接口仍关闭；生产客户端答案边界检查通过。

本机 PostgreSQL 17 main 集群监听5432，项目数据库为 `zhixu_platform`，普通数据库账号为 `zhixu_app`。随机连接密码仅在 `.env.local` 保存，未写入文档或Git。需要时可用 `sudo pg_ctlcluster 17 main start` 启动；也可使用各自已有的PostgreSQL并配置自己的连接。

验证账号已清理。真实账号通过注册页面或接口自行创建。
