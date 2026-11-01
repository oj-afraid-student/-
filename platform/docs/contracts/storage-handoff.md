# 全量题库持久化适配交接

交接给穆泓烨与练习模块实现人。此文件是迁移设计需求，尚未执行迁移；不修改已存在的 001_initial.sql。

| 当前基线                                             | 契约 v2 需要的变化                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| question_version 只含四选项和一个正确选项            | 增加 type、difficulty、公开题目结构、服务端判定规则；非选择题允许没有 options/correct_option_id |
| 一个 knowledge_point_id                              | 题目关联多个细分知识点和多个单元；增加 E1/E2/E3 及 G 编码映射                                   |
| practice 固定一个 knowledge_point_id                 | 保存 selection 快照；ALL/EXPLICIT 可跨单元，不能强塞某个主单元                                  |
| practice_item.position 限制 1—5                      | 改为本版允许 1—100；保留练习内题序和版本唯一约束                                                |
| submission.total_count 固定 5                        | 实际总题数、已判数、待复核数；汇总数必须一致                                                    |
| correct_count 限制 0—5                               | 0≤correct_count≤graded_count≤total_count                                                        |
| submission_answer 只有 selected_option_id/is_correct | 保存 type 对应结构化 answer；状态枚举；待复核 score/is_correct 可空                             |
| 没有待复核结果语义                                   | 支持 score 为 null；结果 reference 必须引用原题版本                                             |
| 版本不可变触发器保护旧字段                           | 新增的题型、题干结构和判定规则也必须进入不可变保护                                              |

继续保留用户归属、submission.practice_id 唯一、跨练习题项外键、不可变版本及事务原子性。
选择题旧数据可转换为 SINGLE_CHOICE；历史五题记录的 totalCount 仍为 5，不改为 24。
新增迁移前共同确认存储字段与兼容策略；迁移应测试旧记录保留、24题保存、多选/多空/分问往返、重复提交与待复核空值约束。

认证、业务路由、批改实现、迁移、真实数据库验证不在本次“接口定义”交付中，不能拿开发样例代替上述验收。
