-- 仅创建单元元数据；不插入虚构账号、成绩或未经复核的题目。
INSERT INTO knowledge_point (id, topic_id, title, summary, sort_order)
VALUES
  ('SG-01', 'solid-geometry-basics', '空间位置关系', '认识空间中的线线与线面位置关系。', 1),
  ('SG-02', 'solid-geometry-basics', '直线与平面平行', '学习线面平行的基础判定、性质和条件。', 2),
  ('SG-03', 'solid-geometry-basics', '直线与平面垂直', '学习线面垂直的基础判定、性质和条件。', 3)
ON CONFLICT (id) DO NOTHING;
