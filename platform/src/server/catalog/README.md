# 知识与题目读取

主责：赵景言。提供六单元目录与详情、按发布状态选题、按内部版本 ID 读取题目。王宁岳和赵景言共同确认内部方法签名。公开题目只投影题干和作答结构，答案与判定规则留在服务端。存储字段见 [v2 存储交接](../../../docs/contracts/storage-handoff.md)。

练习服务当前采用 `../practice/contracts.ts` 中的 `PracticeCatalogPort`：`listPublished()` 取每题最新已发布版本，`loadQuestionVersions(versionIds)` 按内部 UUID 原序读取且包含已下架版本。当前 `../practice/catalog.ts` 提供002存储的最小事务内SQL适配，内容导入/发布和知识接口仍由本模块维护。接入规则见[练习服务交接](../../../docs/practice-handoff.md)。

上述签名已在本分支实现并验证，待按团队v0.2与赵景言、穆泓烨共同核对；不表示已经获得队友确认。
