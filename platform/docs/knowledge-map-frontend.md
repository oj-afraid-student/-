# 知识图谱与正式练习

知识图谱分为立体几何、核心或拓展、15 个单元、39 个细分知识点。节点保留等角布局、平滑切换、缩放、平移和面包屑。编排使用 unit:SG-01、point:G1-01 两类编号，避免单元和知识点重名。

## 从图谱进入练习

1. 按 [数据库说明](../db/README.md) 执行迁移和 pnpm db:import-content。当前发布清单提供 Q01–Q86，原 24 题历史版本继续保留。
2. 登录后打开 /knowledge-map。总览可以创建 86 题整组练习，单元或知识点可以练习该节点关联的题目。按节点与下级知识标签去重，同一个题号在一个节点中只出现一次。
3. 从下拉框选题或切换上一题、下一题，再点「练习此题」。正式练习使用现有 EXPLICIT 接口，作答、提交、解析及历史回看使用同一题目版本。
4. 从结果的「在知识图谱中查看关联知识点」回到该题的一个关联知识节点。图谱链接保存题号和节点，浏览器返回或刷新会恢复选题。若结果中的题已下架，会提示当前没有该关联题，历史答卷照常可查。

Q33 沿用题库的复核规则。学生可以作答，提交后进入待复核，暂不计分。正式数据库暂无题目时，图谱显示空题组。练习创建期间遇到下架等变化，按服务端结果提示刷新。整组练习上限沿用原接口的 100 题。

## 数据来源

公开的 public/content/geometry-knowledge-map.json 提供图谱结构、知识正文、配图及既有版本的内容复核标记。实时题干、选项、分问、题目版本与关联标签均来自需要登录的 GET /api/v1/knowledge-map/questions。此接口复用与正式练习相同的已发布版本查询和公开题目投影。参考答案、评分规则只在原有结果流程中使用。开发样例对应使用 /api/development/knowledge-map/questions。

更新图谱目录后，从 platform 执行：

    node scripts/build-knowledge-map-content.mjs
    pnpm exec prettier --write public/content/geometry-knowledge-map.json
    node scripts/build-knowledge-map-content.mjs --check

验证时检查总览 86 题、全部 15 个单元的关联题号、从细分知识点开始作答并返回、换版及下架对历史结果的影响。全量提交可用 tests/practice-integration.mjs，页面链路可用 tests/frontend-real-browser.mjs。两者使用隔离的本机 PostgreSQL 测试库。

上传题定位、知识链高亮和图谱 AI 问答仍为后续功能。
