# 契约 v2 开发样例

维护：王宁岳。scenarios.json 覆盖全部 11 个业务入口，包含 method、path、request、status、response。
errors.json 包含未登录、无效输入、越权隐藏、冲突和提交失败。practice/ 提供完整 24 题创建、读取、提交、结果与历史，及空历史。

样例只有固定测试标识，不是真实账号或数据库记录。结果含参考答案，只能在模拟“提交后查看结果”时使用；禁止把完整 scenarios.json 静态嵌入生产客户端。
前端可用 content/questions.json 构建作答界面，提交后的结果在开发 mock 层单独加载。
完整字段规则见 docs/api.md；题量取 totalCount，控件由 question.type 决定。

2026-11-08：五个正式练习/提交/查询接口保持上述 DTO；同答案重试使用同一份 submit-response（首次201、重试200），不同答案返回 errors.json 中409。实际 PostgreSQL/HTTP 验证见 [练习服务交接](../../docs/practice-handoff.md)。样例仍是开发数据，不表示24题已正式发布。
