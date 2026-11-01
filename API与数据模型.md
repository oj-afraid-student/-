# API 与数据模型

所有 API 位于 `/api/`。除会话查询、健康检查、注册、登录外均要求已登录的学生会话。POST 使用 JSON 与当前 CSRF token；不接收客户端指定的用户 ID 作为授权依据。

| 方法与路径 | 用途 |
| --- | --- |
| GET session | 当前用户；未登录返回 null，并准备 CSRF cookie |
| POST register | username、password、password_confirm、可选 name；仅学生 |
| POST login / logout | 账号会话登录与退出 |
| GET units | 学习单元列表及本人的阅读状态 |
| GET units/{slug} | 概念、条件、配图标识、例题 |
| POST units/{slug} | 标记本人完成该单元阅读 |
| GET dashboard | 本人的阅读、提交题数、最近练习与未完成练习 |
| POST practices | unit_id 创建固定五题；mode=retry_wrong 与 source_id 创建本人的本次错题重练 |
| GET practices/{uuid} | 本人答卷；未提交时不返回答案解析 |
| POST practices/{uuid}/submit | answers 为题号到答案字符串的映射；服务端计算并保存结果 |
| GET history | 本人已提交练习；可按 unit、wrong=1 筛选 |
| GET sample-question | 固定样例题图对应的整理数据 |
| GET / POST materials | 三份共享学习资料与本人新增资料；确认后导入固定样例 |
| GET materials/{id} | 共享资料或本人资料详情 |
| GET health | 服务标识与版本 |

## 主要数据

- Django User：学生用户名、密码哈希和可选称呼。注册不授予 staff/superuser。
- Unit：知识点、顺序、内容 JSON。
- Question：所属单元、固定顺序与题目完整定义。只经安全序列化返回题干。
- UnitProgress：用户与单元唯一关联，重复标记不会重复计数。
- Practice：UUID、本人用户、知识点、模式、可选来源、题目快照、答案、逐题结果、提交时间。
- Material：本人用户、样例标识、标题、分类、备注、固定解析、时间；用户与样例唯一，避免重复入库。

## 关键业务规则

固定练习由服务端选择恰好五题。数值题使用 Decimal 和固定绝对容差，非有限或非法数值判错。提交时忽略客户端声称的正确数或结果。

Practice 创建时保存完整题目快照。第一次提交通过数据库条件更新写入结果，后续提交返回原结果，不覆盖成绩。历史记录包含当时的题目、用户答案、标准答案与解析，不因以后修改题库而变化。

错题重练只从当前学生自己的已提交答卷提取当时答错或未答题，形成独立新答卷，并关联原答卷。允许题量小于五题，界面标注“本次错题重练”；常规知识点练习始终五题。

资料题图为公开样例；个人标题与备注归属于用户。查阅或提交其他账号答卷、读取其他账号新增资料均被拒绝。服务器不暴露 catalog 或 runtime 目录作为静态资源。
