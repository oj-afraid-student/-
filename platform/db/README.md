# PostgreSQL 初始化、迁移和恢复

穆泓烨维护运行环境和迁移。业务模块的存储入口见[存储交接](../docs/contracts/storage-handoff.md)。

## 新环境

1. 使用 Node.js 24.22.2、pnpm 12.16.1 和 PostgreSQL 17。进入 `platform/`，执行 `pnpm install --frozen-lockfile`。
2. 准备项目专用数据库及有迁移权限的账号。开发库、共享联调库和生产库使用各自的凭据。已有本机 PostgreSQL 可直接使用，也可在 Docker 可用时执行 `docker compose up -d db`，使用绑定在 `127.0.0.1:15432` 的本地数据库。
3. 参照 `.env.example` 设置 `DATABASE_URL`，本机保存到未纳入版本控制的 `.env.local`。正式联调设 `ZHIXU_DEV_FIXTURES=0`。共享环境在服务端注入连接和运行配置，通过 HTTPS 访问应用。

```bash
pnpm db:check
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm start
```

`db:check` 检查数据库连接，`/api/v1/health` 检查应用进程。注册新账号、登录、读取当前用户、退出可以单独验证真实认证。种子可重复执行，只补齐三个核心单元的元数据。六单元、题目及配图由赵景言复核后按正式导入流程接入。

## 迁移、备份和恢复演练

迁移按编号执行，使用事务、互斥锁与校验和。已执行的迁移保持原样。002 原地保留旧题、答卷和关联，再写入 v2 结构。部署前暂停目标库的业务写入，记录当前应用版本及迁移编号，使用同一 PostgreSQL 主版本的工具备份。命令通过已经配置好的 PostgreSQL service 别名连接，分别为源库和一份**空的隔离恢复库**设置 `ZHIXU_SOURCE_SERVICE`、`ZHIXU_RESTORE_SERVICE`。

```bash
umask 077
pg_dump --format=custom --no-owner --no-privileges \
  --dbname="service=${ZHIXU_SOURCE_SERVICE:?}" --file=zhixu-backup.dump
pg_restore --list zhixu-backup.dump
pg_restore --exit-on-error --single-transaction --no-owner --no-privileges \
  --dbname="service=${ZHIXU_RESTORE_SERVICE:?}" zhixu-backup.dump
```

对恢复库执行 `db:check`、`db:migrate`，核对账号数量、旧练习题项顺序、提交 ID、答卷及参考解析。正式发布前，用恢复库运行对应应用版本的认证和业务读写检查。迁移失败时先检查事务回滚和迁移日志，再用独立恢复库验证备份及旧版应用，确认后切换连接。备份含账号和作答数据，保存到访问受限的位置。

本地重置用一份新建的空开发库，切换 `.env.local` 后重新迁移和初始化。核验新库后再按需处理原开发库。共享库的重置和数据恢复安排独立窗口。图片资源随版本部署，备份恢复时一并核对旧版本仍可访问。

## 发布检查

1. 确认部署的 Git 提交、Node/pnpm 版本、迁移编号、HTTPS、数据库连接和日志访问。应用、数据库或内容导入报错时记录发生阶段与对应请求，避免在日志打印连接配置、会话令牌或学生原文。
2. 用正式数据验收 24 题组题、提交、历史分页与回看。记录代表性请求耗时、数据库数据量和并发数，再核对重启和恢复后的同一份记录。环境或数据不同时，分别记录条件和结果。
3. `pnpm check` 使用 PGlite 测试迁移和约束。真实数据库的认证测试见[认证交接](../docs/auth-handoff.md)，整轮验收见[开发交接](../docs/student-practice-handoff-v0.2.md)。
