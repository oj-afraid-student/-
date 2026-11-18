# 立体几何图片测试素材

保存用户提供的两张原始 JPEG 附件，不裁剪、不重新压缩，用于题干转录、图示关系补全与三维交互回归测试。

| 文件 | 题目与关键验收点 | 体验入口 |
| --- | --- | --- |
| [rectangle-ratio-fold.jpg](rectangle-ratio-fold.jpg) | AB=2、AD=3；从图中识别 E∈AB、F∈CD；BE=2DF；沿 EF 同步折叠 A、D；测量 C 到直线 A′D′ 的距离。不能把图上投影相交视为空间关联。 | `/geometry?example=ratio` |
| [rectangle-midpoint-trace.jpg](rectangle-midpoint-trace.jpg) | AB=4、BC=2；E、F 为 AB、CD 中点；绕 DE 将 A 翻折为 P，P 从 A 到 F；G 为 CP 中点，其轨迹长度为 π/√2。 | `/geometry?example=trajectory` |

自动数学验证见 `platform/tests/verified-folds.test.mjs`，浏览器验证见 `platform/tests/two-folds-browser.mjs`。完整说明见 [两题验收文档](../../../platform/docs/geometry-two-folds.md)。

可在 `/study` 上传这些文件，体验识别、图示复核和进入几何实验室的流程。当前真实模型接口脚本 `platform/tests/fold-photo-live.mjs` 针对比例折叠题；从 `platform` 运行时设置 `ZHIXU_TEST_IMAGE=../doc/test/geometry/rectangle-ratio-fold.jpg`。该脚本需要正在运行的服务、已配置模型和 Playwright，会创建临时测试账号并产生模型调用。
