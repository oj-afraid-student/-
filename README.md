# 知序用户端 Version 1.0

中期答辩的最小用户端：**登录 → 查看已有资料 → 模拟上传预置题图 → 解析核对 → 添加到资料库 → 重新查看**。

## 开始体验

双击 [index.html](index.html)。所有样式、脚本、演示数据和题图已内嵌，不需要联网、启动服务器或安装依赖；也可以单独分享这个 HTML。

- 演示账号：`student01`
- 演示密码：`zhixu123`
- 登录页点击“填入账号”，再点击“登录并进入资料库”。

这是固定账号和浏览器本地保存方案，已由团队确认用于本轮答辩演示。未接入真实认证、后台数据库、文件上传、OCR 或 AI 服务。

## 演示资料

- [3 分钟演示步骤](答辩演示步骤.md)
- [功能范围与验收](功能范围与验收.md)
- [预置题图 PNG](assets/三棱柱_演示题.png)
- [题图矢量源文件](assets/三棱柱_演示题.svg)
- [登录页面截图](screenshots/01-login.png)
- [解析核对截图](screenshots/07-review.png)
- [新增资料后截图](screenshots/11-library-added.png)

资料库最初有 3 份原创资料。首次入库后有 4 份；同一道预置题再次入库不会创建重复记录，也不会覆盖已保存的标题和备注。

## 修改与构建

编辑 `src/` 或 `data/seed.json` 后，在本目录运行：

```sh
python build.py
```

`assets/三棱柱_演示题.png` 会重新内嵌到 HTML。只体验页面不需要 Python。

可选的核心行为与几何核验：

```sh
node tests/user-flow.cjs
```

浏览器验证摘要见 `validation/`。历史 V0.1/V0.2 作为独立版本保留，本目录只提供本次最小用户端。

## 历史资料

[V0.2 展示版](https://github.com/oj-afraid-student/-/tree/fe8550528c8e066234e14f3f1275c7501f15b098)保存在 Git 历史中。`docs/报告用原型截图_V0.1/` 是原版报告资料；本版用户端流程请使用根目录说明和 `screenshots/` 中的新截图。
