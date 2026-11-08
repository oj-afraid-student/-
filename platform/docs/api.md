# 业务接口契约 v2：全量 24 题

维护：王宁岳。依据 `../../docs/李梓禾_知识点文档/详细版/` 三份 DOCX。
本契约包含接口定义、共享类型、可追溯数据与开发样例；当前本地已实现 health 与四个真实学生认证接口。
本契约替代原先固定五道单选题的业务契约；多题型数据库迁移见[存储交接](contracts/storage-handoff.md)，知识、练习、结果和历史业务路由及人工批改后台仍待实现。真实认证说明见 [auth-handoff.md](auth-handoff.md)。

## 统一规则

- 前缀 `/api/v1`，JSON；成功 `{ data, error: null }`，失败 `{ data: null, error: { code, message } }`。
- ID 是不透明字符串，题号 Q01—Q24 与知识点 G1-01 等是业务编码；fixture-* 仅为样例，不是生产 UUID。
- 时间为带时区 ISO 8601。正文、公式以 Unicode 纯文本传递，不包含可执行 HTML。
- 除注册、登录外均需会话；退出允许无会话并幂等返回成功。Cookie 由认证模块设置，DTO 不返回令牌或密码。
- 注册用户名 trim 后转小写，4—20 位 ASCII 字母、数字、下划线；密码不 trim，8—64 字符。客户端与服务端双重校验。
- 资源归属仅由登录用户判断，个人练习、结果的越权和不存在均返回 404。拒绝请求中的 userId、score、correctAnswer 等额外字段。
- 以下请求列出的可选字段之外均必填；未列出的字段拒绝。无请求体接口不发送 JSON body。
- 数组的题号、题项、空号、分问编号不可重复；数字参数为整数。文本答案 trim 后非空，每个值最多 200 字符；理由和每问过程最多 10000 字符；提交 JSON 最多 1 MiB，超出返回 400。

## 11 个接口

共享类型位于 `src/shared/contracts/learning.ts`，下面响应类型指 data，均套 ApiResponse。

| 方法与路径                 | 请求                         | 成功响应                       | HTTP                   | 实现负责人 |
| -------------------------- | ---------------------------- | ------------------------------ | ---------------------- | ---------- |
| POST /auth/register        | Credentials                  | CurrentUser；不自动登录        | 201                    | 穆泓烨     |
| POST /auth/login           | Credentials                  | CurrentUser；建立会话          | 200                    | 穆泓烨     |
| POST /auth/logout          | 无                           | LogoutResult                   | 200                    | 穆泓烨     |
| GET /auth/me               | 无                           | CurrentUser                    | 200                    | 穆泓烨     |
| GET /knowledge-points      | 无                           | KnowledgeSummary[]，order 升序 | 200                    | 赵景言     |
| GET /knowledge-points/:id  | 单元 ID：SG-01/02/03、E1/2/3 | KnowledgeDetail                | 200                    | 赵景言     |
| POST /practices            | CreatePracticeRequest        | Practice                       | 201                    | 王宁岳     |
| GET /practices/:id         | 本人 practice ID             | Practice                       | 200                    | 王宁岳     |
| POST /practices/:id/submit | SubmitPracticeRequest        | SubmitPracticeResult           | 首次 201、相同重试 200 | 王宁岳     |
| GET /me/submissions        | page、pageSize               | HistoryPage                    | 200                    | 王宁岳     |
| GET /me/submissions/:id    | 本人 submission ID           | SubmissionDetail               | 200                    | 王宁岳     |

每个入口都有请求/响应配对样例：`fixtures/api/scenarios.json`。样例是目标行为；当前真实认证路由已实现，其余业务路由仍待接通。
知识单元返回 3 个核心单元与 3 个拓展单元；15 个细分知识点位于 sections。学习例题属于学习内容，不重复作为额外练习编号。
知识内容允许讲解例题；未提交练习响应不得包含参考答案、解析或判题规则。不能在学生端通过题号导入服务端答案库。

## 创建练习：取消五题限制

```json
{ "mode": "ALL" }
```

返回当前已发布题库的全部题目，按 Q 编号排序；本次完整开发样例为 24 题。

```json
{ "mode": "FILTERED", "knowledgePointId": "SG-02", "difficulty": "INTERMEDIATE", "count": 3 }
```

FILTERED 的单元、难度、questionTypes、count 均可选，筛选条件之间为 AND，questionTypes 内为 OR；不设置 count 返回全部匹配题。
单元筛选按 question.unitIds 成员关系，跨单元题去重；不按单一主知识点丢弃交叉题。
设置 count 时取按题号排序的前 count 题，不隐式随机。count 为 1—100 的整数；题量不足返回 409，空匹配返回 404。

```json
{ "mode": "EXPLICIT", "questionIds": ["Q02", "Q06", "Q14", "Q24"] }
```

EXPLICIT 指定 1—100 个不重复题号，按请求顺序返回；不存在或未发布题返回 404，不能静默省略。
ALL/FILTERED 匹配超过 100 题时返回 400，要求缩小范围，不截断；100 是本版接口上限，不是题库总量上限。
不接受旧版只有 knowledgePointId 的请求，不默认退回五题。ALL 不接受任何筛选字段。
创建时保存题序和不可变题目版本，totalCount = items.length；提交时不重新抽题或读取新版答案。

## 题目与作答结构

PublicQuestion.type 与 Answer.type 必须一致；完整逐题映射见 [question-matrix.md](contracts/question-matrix.md)。

| 类型              | 作答字段                                | 校验与判定                                                           |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------- |
| SINGLE_CHOICE     | selectedOptionId                        | 必须是该题的一个选项；确定性判题                                     |
| MULTIPLE_CHOICE   | selectedOptionIds[]                     | 非空、无重复、均为合法选项；忽略顺序，完全相同集合才正确；不计部分分 |
| FILL_BLANK        | blanks[{blankId, values[]}]             | 恰好覆盖所有空，值数量与 valueCount 一致；按下述规则匹配             |
| JUDGMENT_REASON   | judgments[{statementId, value, reason}] | 两条判断各有布尔值及理由，整体待复核；不能仅看布尔值算整题正确       |
| PROOF             | parts[{partId,text}]                    | 按该题 parts 完整提交推理过程，待复核                                |
| PROOF_CALCULATION | 同上                                    | 证明/识别与计算分别保存，待复核                                      |
| EXPLORATION_PROOF | 同上                                    | 位置结论与证明分别保存，待复核                                       |
| COMPREHENSIVE     | 同上                                    | Q24 三问全部保留，待复核                                             |

提交请求为 `{ answers: [{ practiceItemId, answer }] }`，必须恰好覆盖本次练习全部题项，不能把 Q01 当成 practiceItemId。
空答、漏题、多题、无效选项、类型错配、遗漏分问均返回 400，整次不保存。本轮不支持跳过题目或服务端草稿。
Q06 三个空分别存交线、交线、关系；Q14 一个空内存两个距离，unordered=true，不能只写一个可能值。
单位由 blank.unit 给出，输入值不带单位。根式可输入 `√3/3` 或 `sqrt(3)/3`；不要求浏览器求值。

填空样例的服务端 acceptedValues 是明确的等价写法列表。规范化仅执行 Unicode NFKC、去首尾与内部空白、将全角斜线转为 `/`；保留大小写，不运行 eval 或任意数学表达式。
每个 values 元素必须一一匹配一个 acceptedValues 组；unordered=true 使用不重复的一一集合匹配。全部空匹配才 CORRECT。
未匹配的合法表达式进入 PENDING_REVIEW，而非直接判错，避免把未枚举的等价式当错。数学表达式引擎不在此次交付范围。

## 状态、分数与重试

- practice.status：OPEN → SUBMITTED，只表示提交是否完成。
- submission.gradingStatus：GRADED 或 PENDING_REVIEW，与练习状态独立。
- 单题 evaluation 为 CORRECT/INCORRECT/PENDING_REVIEW。待复核的 isCorrect 和 score 都为 null。
- 暂定按题计数：每道完整题 1 分，无分问权重或部分分。maxScore=totalCount。
- gradedCount+pendingCount=totalCount；correctCount 只统计已判正确题，不把待复核计错。
- 有待复核题时总 score=null；全部判完才 score=correctCount。页面显示“已判 11 题、待复核 13 题”，不能显示“11/24 最终成绩”。
- 全量示例故意给出 11 道客观题匹配答案，13 道需要推理过程的题保持待复核；这些数据不是实际学生成绩。
- 证明、判断理由等仅保存、展示参考解析供复核；此次未提供教师批改接口，也不声称待复核会自动完成。人工复核录入与权限留给后续独立任务。
- 相同答案重试返回同一 submissionId。题项/分问数组按 ID 比较，多选与无序填空按集合比较；文本使用上述规范化后比较，不用数学等价性判断是否同一次提交。
- 已提交且答案改变返回 409；重做创建新 practice。并发提交靠事务和 practice_id 唯一约束保证只有一个结果。
- 校验、判题、答案保存、结果保存、状态更新必须在同一事务内完成；失败不部分保存。客户端不确定是否保存成功时用原答案重试。
- 已提交的 GET practice 仍返回无答案题目和 submissionId，解析仅从本人结果接口读取。

## 历史与错误

page 默认 1、pageSize 默认 20，page≥1，1≤pageSize≤100；不接受小数、负数、非数字字符串和额外查询参数。
按 submittedAt 降序，再按 id 降序稳定排序。越界页或空历史返回 200、items=[]、真实 total。OPEN 练习不进入提交历史。

| 错误码              | HTTP | 典型情况                                      |
| ------------------- | ---- | --------------------------------------------- |
| VALIDATION_ERROR    | 400  | 非法字段、空数组、漏答、无效题型、超限        |
| UNAUTHENTICATED     | 401  | 未登录或登录凭据错误；不区分账号是否存在      |
| NOT_FOUND           | 404  | 单元/题目不存在、筛选无结果、个人记录不可访问 |
| CONFLICT            | 409  | 用户名重复、已提交后改答案、匹配题量不足      |
| NOT_IMPLEMENTED     | 501  | 业务入口尚未实现                              |
| SERVICE_UNAVAILABLE | 503  | 数据库不可用或暂时无法保存                    |
| INTERNAL_ERROR      | 500  | 未分类异常，不泄露内部堆栈                    |

完整异常响应见 `fixtures/api/errors.json`。类型只描述结构，实际路由仍须增加运行时校验。

## 数据与上下游

- 赵景言：提供按题号读取不可变版本的 catalog；source-manifest 保留原文件哈希；24 题均是 DRAFT，发布前复核。原图 A 已从 DOCX 无改动提取到 public/geometry，保持 A₁ 等标记，不套用旧 ABCD-EFGH 命名。
- 穆泓烨：提供 requireCurrentUser、事务与新版持久化结构；迁移需求见 [storage-handoff.md](contracts/storage-handoff.md)。现有 001 不能存本契约，禁止将全量 JSON 直接塞入旧 schema。
- 李梓禾：按 type 渲染不同作答控件，使用 fixtures/api 的样例；只导入 shared/contracts，不能导入 fixtures/server。提交后显示待复核状态，最终结果不能只呈现分数。
- 王宁岳：维护契约与样例，并在认证/题库/数据层接齐后实现练习业务；`src/server/practice/contracts.ts` 仅是服务端题目边界，不是已完成服务。
