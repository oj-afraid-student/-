# PostgreSQL 初始化与迁移

维护人：穆泓烨。连接采用 `pg`；SQL 用参数占位符，多个保存操作通过同一事务连接执行。

## 本地数据库

已有 PostgreSQL 时，创建本项目专用数据库，在 `platform/.env.local` 填写 DATABASE_URL。开发数据库与共享或生产数据库分别配置。

也可在 Docker 可用时，于 `platform/` 执行：

```bash
docker compose up -d db
```

此配置启动本机专用 PostgreSQL 17，绑定 `127.0.0.1:15432`。示例凭据仅供本地开发；`.env.local` 对应填写：

```dotenv
DATABASE_URL=postgresql://zhixu:zhixu_local_only@127.0.0.1:15432/zhixu
```

WSL 使用 Docker Desktop 时，先在 Docker Desktop 启用对应发行版的 WSL Integration。没有 Docker / PostgreSQL 时，首页、health、格式、类型、构建与数据库内存测试仍可运行。

## 顺序执行

```bash
pnpm db:check
pnpm db:migrate
pnpm db:seed
```

种子可重复执行，仅补齐 SG-01、SG-02、SG-03 的单元元数据，不覆盖已有内容。正式题目由李梓禾提供并复核后再导入。

迁移使用事务、互斥锁和校验和。已经执行的文件禁止修改，结构变更新增 `002_...sql` 等后续迁移。迁移失败整体回滚；重复执行跳过已完成文件。

结构删除、重置和生产数据迁移需要单独评估，本工程不提供自动删除数据库的命令。

## 约束测试与真实连接

`pnpm test` 在 PGlite 的 PostgreSQL 引擎运行迁移、约束和回滚检查，不需要系统级数据库服务。PGlite 仅是开发依赖，不在应用内使用。

真实 PostgreSQL 的网络、认证、并发与部署仍通过 `db:check` 和后续接口联调验证。health 只检查应用进程，数据库不可用时它仍可能返回 ok。
