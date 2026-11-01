# 王宁岳：接口定义与全量题库交付

## 从这里阅读

1. [接口文档](../api.md)：11 个业务接口的请求、响应、错误、状态、选题与判定规则。
2. [逐题矩阵](question-matrix.md)：Q01—Q24 的题型、知识点、空位/分问结构与判定策略。
3. `src/shared/contracts/learning.ts`：前后端共同使用的 TypeScript 类型；`index.ts` 统一导出。
4. `fixtures/api/scenarios.json`：11 个入口的请求/响应；`fixtures/api/practice/`：全量练习完整流程。
5. [数据库交接](storage-handoff.md)：固定五题单选 schema 到多题型契约的适配清单。

## 覆盖清单

- 24 道独立练习：基础 8、进阶 10、综合 6；保留原题号、题干、选项、答案、解析与逐题来源。
- 8 种题型：单选 3、多选 2、填空 6、判断说明 2、证明 7、证明计算 2、探究证明 1、综合解答 1。
- 15 个知识点：G1/G2/G3 各 4 个及 E1/E2/E3，组织为 6 个学习单元。知识文档例题保留在知识内容。
- 公开题目与服务端答案分开存放；原图 A 从 DOCX 无修改提取，维持 ABCD—A₁B₁C₁D₁ 标记。
- 全量练习不再写死五题；支持全部、筛选、显式选题。Q06 三空、Q14 两值、Q24 三问均有结构化样例。
- 11 道客观题的样例匹配判定依据；13 道含推理过程的题待复核，score 为 null。填空未识别的等价式也应待复核。
- 源文档哈希与学生版逐题核对，不将提取成功当作内容审核；题库状态仍为 DRAFT。

## 文件归属与交接

| 成员   | 可直接使用的成果                     | 下一步                                                |
| ------ | ------------------------------------ | ----------------------------------------------------- |
| 赵景言 | shared/contracts、公开题目、API 样例 | 按题型渲染输入，按状态展示待复核，替换模拟请求        |
| 李梓禾 | 知识单元、题目矩阵、服务端题库、原图 | 复核内容及别名，维护发布状态，实现 catalog 和知识读取 |
| 穆泓烨 | 接口认证约定、storage-handoff        | 实现真实会话，协调新增迁移与事务存储                  |
| 王宁岳 | 全部契约、服务端题目边界、检查脚本   | 在上游就绪后实现练习、提交、结果和历史接口            |

## 验证与重建

在 platform 目录：

```sh
python scripts/import-question-contracts.py
node --test tests/contracts.test.mjs
node scripts/check-contract-types.mjs
```

最后一条需要工程的 TypeScript 依赖。也可传入临时安装的 `typescript/bin/tsc` 路径。
导入脚本不改源 DOCX；重建后请按工程 Prettier 规则格式化生成的 JSON 和 Markdown。

数据测试覆盖来源哈希、24题完整性、答案不泄露、各题型作答结构、结果与历史一致、题目知识关联及无效样例识别。
类型脚本把真实 JSON 字面量逐项对照共享类型，避免仅用类型断言掩盖错误。
这些检查不替代真实 HTTP、登录、事务、并发和持久化测试。

## 当前实现边界

这是已落盘的契约与样例交付。没有新增真实业务 route、认证、数据库迁移、评分引擎或人工复核后台；health 仍是唯一现有真实业务工程接口。
旧五题数据库不能直接存入这份全量题库。用户提交的主观题可按约定保存并展示参考解析，但正式评分需要后续有权限的复核流程。

## 本次验证结果

- `node --test tests/contracts.test.mjs`：6 项通过。
- `node scripts/check-contract-types.mjs <临时 TypeScript 路径>`：38 个真实 JSON 样例通过严格类型检查。
- 本次新增及修改的 TypeScript、JSON、Markdown、JavaScript 文件通过 Prettier 检查。
- `git diff --check` 通过。
- 完整 `pnpm check` 未能运行：本机未安装 pnpm，工程也没有 node_modules；当前 Node 为 22.23.2，而项目要求 24.22.2 以上的 24.x。未宣称 Next.js 构建或数据库集成测试通过。

临时 TypeScript/Prettier 安装于 `/tmp/wny-contract-check`，未更改工程依赖或锁文件。
源 DOCX 保持原样；本次未执行 git commit 或推送。
