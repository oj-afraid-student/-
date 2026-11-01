# 正式开发入口

立体几何学生端的正式工程位于 **[platform/](platform/README.md)**。

```bash
cd platform
pnpm install --frozen-lockfile
pnpm dev
```

首次启动要求和配置见工程 README。所有业务开发、依赖安装、数据库迁移和构建在 platform 目录执行；根目录现有资源保留原用途。

本轮已按契约 v2 完成学生端前端与全题型输入，细节见 [前端交接](platform/docs/frontend-handoff.md)。默认请求真实 `/api/v1`；业务服务尚待接通时，可显式设置 `ZHIXU_DEV_FIXTURES=1` 运行开发样例环境（仅 `pnpm dev` 有效，内存数据重启清空）。真实后端、数据库迁移及复核流程仍按分工推进，开发模式通过不代表它们已经完成。
