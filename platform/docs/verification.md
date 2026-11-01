# 首日工程验证记录

验证日期：2026-11-01（Asia/Tokyo）。环境：Ubuntu 22.04 WSL2，Node.js 24.22.2、pnpm 12.16.1。

## 已通过

- 从 Git 暂存树导出干净工程，清除数据库与会话环境变量后，使用锁文件离线安装成功；不依赖旧 node_modules 或本地配置。
- `pnpm check` 通过：格式、代码、路由类型、TypeScript、7 项数据库测试和生产构建。
- 临时生产服务启动成功；首页与真实 health 接口均可访问。
- 正式服务请求仓库原有 /src/core.js、/data/demo-data.json 和 /index.html 均返回 404。
- 数据库未配置时 db:check 明确提示配置，首页、health 与构建仍正常。
- 原有已跟踪文件保持不变；本次只新增 platform、DEVELOPMENT.md 与正式工程 CI。
- 依赖 peer 检查无冲突。ESLint 9.39.5 与当前 Next.js 配套插件声明的支持范围匹配。

## 数据库测试

PGlite 使用 PostgreSQL 引擎执行相同 SQL，验证：迁移及种子幂等、非法选项拒绝、题目版本不可覆盖、同练习提交唯一、跨练习题项引用拒绝、迁移校验和、失败迁移整体回滚。题目取消发布后仍不可覆盖内容。

## 后续验证

本机尚无可用 PostgreSQL 服务，Docker Desktop 的当前 WSL 集成未启用。因此真实数据库的 TCP 连接、容器启动及部署不记为通过，配置后按 db/README.md 验证。

真实注册登录、个人数据授权、五题提交与结果保存属于后续业务任务，本次工程检查不代表这些功能已经完成。
