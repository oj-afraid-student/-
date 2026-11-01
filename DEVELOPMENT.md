# 正式开发入口

立体几何学生端的正式工程位于 **[platform/](platform/README.md)**。

```bash
cd platform
pnpm install --frozen-lockfile
pnpm dev
```

首次启动要求和配置见工程 README。所有业务开发、依赖安装、数据库迁移和构建在 platform 目录执行；根目录现有资源保留原用途。
