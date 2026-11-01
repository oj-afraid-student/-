# 接口基线：供王宁岳继续完善

这是首日工程交接基线。当前真实可调用接口仅为 `GET /api/v1/health`；11 个业务接口属于后续实现，不能按已完成汇报。共享业务 DTO 和完整 JSON 样例由王宁岳继续补齐并与调用方确认。

## 公共返回

前缀 `/api/v1`，JSON，ID 为字符串，时间为带时区 ISO 8601。成功使用 `{ data: ..., error: null }`；失败使用 `{ data: null, error: { code, message } }` 并匹配 HTTP 状态。

| 错误码              | 状态                                |
| ------------------- | ----------------------------------- |
| VALIDATION_ERROR    | 400                                 |
| UNAUTHENTICATED     | 401                                 |
| NOT_FOUND           | 404；也用于他人的个人练习和结果     |
| CONFLICT            | 409；重复用户名或已提交后试图改答案 |
| NOT_IMPLEMENTED     | 501；明确未实现的基础入口           |
| SERVICE_UNAVAILABLE | 503；所需数据库尚未配置或服务不可用 |
| INTERNAL_ERROR      | 500；不向前端泄露内部异常           |

`health` 仅检查应用进程，不连接数据库，也不表示用户已登录。示例：

```json
{
  "data": {
    "status": "ok",
    "service": "zhixu-platform",
    "timestamp": "2026-11-01T03:00:00.000Z"
  },
  "error": null
}
```

## 11 个业务接口

| 方法与路径（省略前缀）     | 输入与结果                                                 | 实现人 |
| -------------------------- | ---------------------------------------------------------- | ------ |
| POST /auth/register        | username、password → 用户基本信息；注册后不自动登录        | 穆泓烨 |
| POST /auth/login           | username、password → 用户基本信息并建立会话                | 穆泓烨 |
| POST /auth/logout          | 当前会话 → `{ success: true }`                             | 穆泓烨 |
| GET /auth/me               | 当前会话 → `{ id, username }`                              | 穆泓烨 |
| GET /knowledge-points      | 三单元列表：编号、标题、简介、顺序                         | 李梓禾 |
| GET /knowledge-points/:id  | 单元内容、条件、图形、例题、易错提醒                       | 李梓禾 |
| POST /practices            | `{ knowledgePointId }` → practiceId、OPEN、五个题项        | 王宁岳 |
| GET /practices/:id         | 本人练习的题目与状态；已提交提供结果标识                   | 王宁岳 |
| POST /practices/:id/submit | 五个 `{ practiceItemId, selectedOptionId }` → submissionId | 王宁岳 |
| GET /me/submissions        | page=1、pageSize=20 → 本人记录列表与总数                   | 王宁岳 |
| GET /me/submissions/:id    | 本人结果：时间、得分、逐题选择、正误、解析                 | 王宁岳 |

## 状态与安全边界

- 学生端仅用户名密码注册；用户名统一转小写，4—20 位字母、数字、下划线；密码长度 8—64，服务端再次验证。
- 练习状态 `OPEN` → `SUBMITTED`，一次练习最多一个最终结果；重做创建新 practiceId。
- 相同答案重复提交返回已存结果，不同答案覆盖请求返回 409；并发唯一性由数据库约束兜底。
- 提交前校验恰好五个不同题项、属于该练习、选项存在且无空答；判题、作答保存、提交状态变更放在同一事务。
- 提交前的题目只公开题号、版本、单元、题干、选项与图形。正确答案和解析从服务端白名单响应中排除，结果接口再返回。
- 本轮不做服务端答题草稿。未提交刷新会清空选择；已提交结果持久保存。

## 内部方法

- 穆泓烨提供 `requireCurrentUser(): Promise<CurrentUser>`。首日实现明确抛出 501，不返回虚构用户；AUTH-01 接入真实会话后替换。
- 李梓禾提供 `loadQuestionVersionsForUnit(unitId)`，返回五道服务端题目版本。需包含判题依据，但不得直接序列化为公开响应。
- 王宁岳通过这两个边界实现练习服务；单元测试可在模块边界注入替身，正式代码不能跳过真实认证。

## 样例交接

王宁岳在 `fixtures/api/` 补齐成功、未登录、空历史、参数错误、提交失败和冲突样例；赵景言在 `src/shared/api/` 统一接入。开发样例只服务本工程开发和验证，不作为真实账号或学习记录。
