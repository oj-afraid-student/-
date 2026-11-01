# 练习、判题与记录

主责：王宁岳。当前交付契约定义，不是已实现服务。
contracts.ts 定义服务端题目版本与 catalog 读取边界；共享请求/响应位于 shared/contracts。
新版支持全部 24 题和多题型，详见 docs/api.md。依赖真实 requireCurrentUser、catalog 与新版数据库迁移。
后续实现创建、提交、结果和历史时，需要校验本人归属、实际题量、所有分问、提交去重与事务保存；不能沿用固定五题单选假设。
