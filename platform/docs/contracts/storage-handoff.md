# v2 题库与答卷存储交接

穆泓烨维护迁移。运行 `pnpm db:migrate` 顺序应用 `001_initial.sql` 和 `002_practice_v2.sql`。旧记录原地升级，题目、练习、题项和提交 ID 保持不变。旧单选映射为 `SINGLE_CHOICE`，原五题总数继续保留。旧题缺少标题和难度时，以题号为显示标题、`BASIC` 为兼容值。

| 数据           | 写入约定                                                                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 知识目录和详情 | 赵景言负责导入与读取。现有 `knowledge_point` 按单元 ID 保存单元，内容字段可保存 v2 目录与详情所需的 sections 等结构。细分知识点用内容和题目中的稳定编码关联。                                                                                                                                          |
| 题目版本       | `question_version.id` 是内部 UUID，`question_key` 和 `version` 对应公开题号及版本。分别写 `public_question`、`reference_answer`、`grading` 和 `source`。题目跨单元和知识点的 ID 数组存于不可变的 `public_question`，导入时检查这些 ID 对应已知目录。旧列用于保留已迁移的数据，新版本写入 v2 字段即可。 |
| 发布和历史     | 草稿保持 `is_published = false`。内容修改新增版本。历史按 `practice_item.question_version_id` 读取固定版本，图片换内容时使用新地址并保留旧资源。公开读题只投影 `public_question`。                                                                                                                     |
| 练习           | `practice` 写登录用户及 v2 `selection` 快照。每个 `practice_item` 引用内部题目版本 UUID，题序从 1 开始，最大 100。                                                                                                                                                                                     |
| 提交           | `submission` 写 `practice_id`、`total_count`、`graded_count`、`correct_count`。数据库生成 `pending_count`、`grading_status`、`score`。DTO 的 `maxScore` 取 `total_count`。                                                                                                                             |
| 逐题作答       | `submission_answer` 写提交、练习、题项、v2 `answer` 和可空的 `is_correct`。数据库生成 `evaluation_status` 和 `score`。`true` 表示正确，`false` 表示错误，`NULL` 表示待复核。                                                                                                                           |

王宁岳使用 `withTransaction()` 锁定目标练习，校验归属、题项、作答结构和数量，再写入提交、逐题作答及练习状态。数据库约束保护每练习唯一正式提交、题项归属和汇总边界。完整答卷覆盖、真实判题、重试语义与版本选择由业务服务实现。若提交已存在，按 v2 规则比较作答并返回原提交或冲突。

赵景言和王宁岳用同一份真实题核对 catalog 的已发布查询和固定版本读取签名、题目换版或下架的规则。独立迁移测试使用真实题样验证存储形状，无需在正式题库发布这些样例。
