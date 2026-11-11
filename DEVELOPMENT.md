# 正式开发入口

立体几何学生端的正式工程位于 **[platform/](platform/README.md)**。

```bash
cd platform
pnpm install --frozen-lockfile
pnpm dev
```

首次启动要求和配置见工程 README。所有业务开发、依赖安装、数据库迁移和构建在 platform 目录执行；根目录现有资源保留原用途。

本轮已按契约 v2 完成学生端前端与全题型输入，细节见 [前端交接](platform/docs/frontend-handoff.md)。默认请求真实 `/api/v1`；业务服务尚待接通时，可显式设置 `ZHIXU_DEV_FIXTURES=1` 运行开发样例环境（仅 `pnpm dev` 有效，内存数据重启清空）。五个正式练习/提交/查询接口已接入真实认证与001/002迁移；正式知识与题库从 PostgreSQL 读取，按[数据库说明](platform/db/README.md)执行内容导入并关闭开发样例。

王宁岳本轮交付、题库端口和验证方法见[练习服务交接](platform/docs/practice-handoff.md)。关闭开发样例后 `/api/v1` 只从数据库选已发布题，不会把 DRAFT fixtures 自动导入或发布。
