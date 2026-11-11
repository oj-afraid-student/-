# 知识与题目读取

主责：赵景言。提供六单元目录与详情、按发布状态选题、按内部版本 ID 读取题目。王宁岳和赵景言共同确认内部方法签名。公开题目只投影题干和作答结构，答案与判定规则留在服务端。存储字段见 [v2 存储交接](../../../docs/contracts/storage-handoff.md)。

练习服务当前采用 `../practice/contracts.ts` 中的 `PracticeCatalogPort`：`listPublished()` 取每题最新已发布版本，`loadQuestionVersions(versionIds)` 按内部 UUID 原序读取且包含已下架版本。知识列表和详情通过此适配器计算关联题号，与组题保持一致。单元正文从数据库读取，导入命令见[数据库说明](../../../db/README.md)。接入规则见[练习服务交接](../../../docs/practice-handoff.md)。

正式知识接口沿用 v2 契约。未登录返回 401，找不到指定单元时返回 404。
