# 服务端题目依据

内容负责人：李梓禾；契约与提取：王宁岳。
question-bank.json 包含 Q01—Q24 原题、参考答案、解析、来源、拟定判定规则，样例文件保留 DRAFT 状态。正式导入使用已复核的发布清单，见[内容复核记录](../../docs/catalog-content-review.md)。
source-manifest.json 保存三份原文档的 SHA-256 及题号覆盖记录。
禁止客户端导入、禁止复制到 public；填空别名不声称穷尽所有数学等价写法，未匹配应待复核。
运行 `python scripts/import-question-contracts.py` 从仓库 DOCX 重建样例；重新生成后运行检查并格式化。
