# 立体几何工作台：架构审计与第一阶段交付

## 仓库审计（2026-11-18）

需求来源为仓库 `docs/立体几何交互设计文档/` 下的 PRD 与开发任务指令，两份文件不在根目录顶层。正式应用位于 `platform/`；根目录 `src/`、`index.html`、`data/` 和 `build.py` 是历史原型，不引用其状态或伪识别流程。

| 层次       | 当前代码与职责                                                                                 | 复用方式                                                            |
| ---------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 前端       | Next.js 16.4.3 App Router、React 19.3.1、TypeScript、Tailwind 4 与全局 CSS                     | 新增学生路由 `/geometry`，局部样式、客户端懒加载三维渲染            |
| 页面与登录 | `app/(student)/layout.tsx`、`features/auth/session.tsx`、`shared/ui/app-shell.tsx`             | 沿用 RequireUser、Cookie 会话与主导航                               |
| UI         | `shared/ui/common.tsx` 的 PageHead、状态、公式文本、题图组件；`globals.css` 的按钮、卡片、字段 | 复用 PageHead、btn、field、tag；工作台 CSS 用 geo 前缀              |
| 前端请求   | `shared/api/client.ts`、`learning-api.ts`、`timeouts.ts`                                       | 第二阶段沿用超时、错误和请求封装                                    |
| 后端       | 同工程 Route Handlers → `server/auth` / `catalog` / `practice` → `server/db` / PostgreSQL      | 第一阶段不改接口、鉴权、判题、答案库、迁移                          |
| 开发测试   | `/api/development` 显式内存 fixture、Node test、PGlite、外部 Playwright                        | 第一阶段不依赖 AI 或数据库，登录可用原开发模式                      |
| 图片输入   | `features/practice/answer-photo.tsx`                                                           | 当前是学生**作答照片**，不是新题上传；下一阶段提取复用 preparePhoto |
| AI         | `server/ai/model.ts`、`learning.ts`、`hint-template.ts`、`scope.ts`、`publish.ts`              | 复用 modelJson 与服务端凭据，不把模型放进高频交互路径               |

### 实际图片与 AI 数据流

`AnswerPhoto` → MIME/15MB 校验 → createImageBitmap → Canvas 缩放最长边至 1800 → JPEG 压缩至 data URL ≤950000 字符 → `/api/v1/practices/[id]/hint` → 身份、练习归属、提交状态、小问校验 → `requestHint()` 校验 JPEG data URL → `modelJson()` 多模态 JSON 请求 → 长度/类型校验 → 用户编辑转录文字 → 填入原作答框。

照片目前以请求数据传给模型，没有独立图片资源 ID、上传对象存储、题图区域证据、Geometry ProblemIR 或几何场景持久化。AI 还支持基于已有知识点生成候选题、审核/发布，以及文字提示。README 的“没有上传/OCR”描述落后于当前代码；准确边界是已有作答照片转录，但没有新题照片到几何模型的链路。第一阶段保留这些路径。

## 架构与文件清单

| 文件                                  | 变化 / 责任                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/app/(student)/geometry/page.tsx` | 新增学生工作台入口                                                                                  |
| `src/features/geometry/scene.ts`      | 版本化 GeometryScene、Zod strict schema、ProblemIR 初始类型；大小预算与操作白名单                   |
| `geometry.ts`                         | 双精度向量、平面投影、Rodrigues 刚体旋转纯函数                                                      |
| `constraints.ts`                      | Schema、ID/引用、退化/凸性/共面、固定点与刚体全点对残差验证；原子求值                               |
| `metrics.ts`                          | 点点距离、点面距离、两直线最小夹角；未定义量返回原因                                                |
| `fixtures.ts`                         | Demo A；B/C 静态协议 fixture                                                                        |
| `interactions.ts`                     | 学生辅助构造独立层；重复连线校验；有界撤销/重做历史                                                 |
| `scene-renderer.tsx`                  | React Three Fiber / Three.js；OrbitControls、正交相机、点标签、点线选择、遮挡虚线、折前虚影、垂足 H |
| `workbench.tsx`、`workbench.css`      | 题设 / 三维 / 探索 / 底部角度控制，响应式布局与 WebGL 失败提示                                      |
| `src/shared/ui/app-shell.tsx`         | 增加导航链接与当前页面标识                                                                          |
| `next.config.ts`                      | 按 R3F 文档增加 three 转译，保证开发模式依赖适配                                                    |
| `package.json`、`pnpm-lock.yaml`      | 增加 three、fiber、drei、zod 与 Three.js 类型；不升级原有框架                                       |
| `tests/geometry.test.mjs`             | 数学、拒绝非法输入、构造与历史的单元测试                                                            |
| `tests/geometry-browser.mjs`          | 桌面/手机实际页面验收，可输出截图                                                                   |

React Three Fiber 版本配对依据：[官方安装文档](https://r3f.docs.pmnd.rs/getting-started/installation)；相机控制生命周期依据：[drei 官方文档](https://drei.docs.pmnd.rs/controls/introduction)。遵循本地 Next.js 文档的客户端边界与 dynamic ssr:false 用法。

### 确定性与状态边界

- GeometryScene 描述初始几何、题设约束和白名单铰链运动；场景状态只有 θ 与独立学生辅助线引用，不储存模型猜测的动态坐标。
- 每次更新：合法参数 → 从 initial 坐标刚体旋转 → 校验硬约束 → 同一次求值产生坐标与量测 → 更新 UI。无 LLM/网络逐帧请求。
- 轴取 D→E，符号为 -1，保证 A′ 向 z≥0 翻起；内部弧度，UI 角度。
- `initial_midpoint` 只校验初始坐标，绝不在折后误用 E=(A′+B)/2。
- 刚体检查所有点对而不只检查边；长度归一化残差容差 1e-9。范围外参数拒绝更新；退化量测给原因，不显示 NaN。
- 三维渲染是几何真值的消费者；没有自由拖点，A′ 仅由合法 θ 控制。选固定点不能移动它。
- 线线角定义为 0°–90° 最小夹角，不标成题目二面角。H 为 A′ 到 BCD 的正交投影。
- 辅助线用端点 ID 随场景刷新；原有边与反向重复连线均拒绝。撤销不改题设，恢复初始清除学生构造并重置视图。
- 第一阶段 Schema 是受限离线协议，支持凸三角形/四边形、单铰链。没有开放不可信 AI JSON 导入端点；第二阶段仍需证据确认、模板编译、动态全域采样和失败降级，不能把通过 Schema 当成数学验证完成。

## 阶段计划与边界

1. Sprint 0：审计、受限协议、三份静态 fixture；已实施。
2. Sprint 1：不依赖 AI 的 Demo A；刚体数学、交互、量测、辅助线、历史和测试；本次交付范围。
3. Sprint 2：复用图片预处理和 modelJson，新建可编辑 ProblemIR；Planner 给出 recommended_level、reason、task_type、driving_parameters、highlight_entities、suggested_metrics、verification_status、fallback_level。先支持 L0/L1/L3，等级不得超过模板编译器与 Validator 的能力。图像不清/条件不足/矛盾时保留原题并降级。没有图片资源持久化时应先明确接口/存储契约。
4. Sprint 3：边上点、动态垂足、中点、曲线、视角与条件联动、教学步骤。Demo B/C 的完整交互在后续扩展，不宣称已完成三个交互 Demo。
5. Sprint 4：授权评测集、性能与学习效果测量；依据结果决定是否引入通用数值约束求解器。

第一阶段不实现 AI 识题、Planner 推理、照片到场景、自由 CAD、场景保存、通用约束求解器及手机底部抽屉。PRD 中涉及 AI 的验收项 1/7/8/12 属于第二阶段，不能以离线 Demo 冒充通过。没有执行完整 50–100 题质量评测或目标设备 FPS 基准。

## 运行

按项目要求使用 Node 24.22.2、pnpm 12.16.1：

```sh
cd platform
pnpm install --frozen-lockfile
ZHIXU_DEV_FIXTURES=1 pnpm dev
```

浏览器注册/登录开发账号后访问 `/geometry`，或点击“几何实验室”。模型密钥、数据库均非 Demo 的前提。真实环境继续使用已有登录流程。开发 fixture 服务重启后清空测试账号。参数/辅助构造只存在当前页面内存，刷新恢复初始。

验证命令：

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm build
# 单独运行数学测试
node --test tests/geometry.test.mjs
# 外部 QA 安装的 Playwright，不引入应用依赖
ZHIXU_TEST_URL=http://127.0.0.1:3100 \
ZHIXU_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
ZHIXU_BROWSER_EXECUTABLE=/absolute/path/to/chrome \
ZHIXU_QA_OUTPUT=/tmp/geometry-qa \
node tests/geometry-browser.mjs
```

## 验证记录

单元测试覆盖 0° 至 90°、每 0.1° 的采样，以及明确的 0/15/30/45/60/75/90°。独立解析公式：h=4/√5·sinθ，A′B=√(9.6+6.4cosθ)。30° 高度约 0.8944，75° 高度约 1.7279。其余检查包括：固定点、正 z 分支、错误 schema/引用/重复 ID、初始中点错误、非法参数、自交面、零轴/退化平面、线线最小夹角、重复辅助线、撤销/重做与重置。

- `pnpm check` 中的格式检查、ESLint、Next 路由类型生成与 TypeScript、56/56 测试通过。最终构建被下述 Next.js 安全提醒中断后，单独重跑 `pnpm build` 成功；`/geometry` 已进入构建路由。此前也完成过一次完整 `pnpm check` 成功运行。
- ESLint 无错误；保留原有 `server/catalog/service.ts`、`tests/practice-integration.mjs` 的 4 条未使用变量警告，未扩大本次改动范围。
- 桌面 1600px / 手机 390px 的浏览器验收覆盖真实 WebGL、场景标签点选、辅助线实时随动、30°/75°/90° 数值、撤销/重做、重复连线拒绝、底面显示、播放/暂停、视角切换与重置；未触发 AI 请求。
- 相机旋转、滚轮缩放、右键平移已实际操作；手机点选使用触摸事件。相机预设和重置复用同一 Canvas，在布局阶段更新相机，避免重建画布时旧标签投影短暂滞留。
- 初次浏览器验收发现 drei Html 在严格模式下丢失标签，已改为同一 DOM React 根内的标签层，按真实相机投影同步位置；初始缩放按画布尺寸适配。
- 构建期间 Next.js 16.4.3 提示现有版本安全问题，首次命令被提醒中断；再次运行后构建成功。没有在本次功能开发中升级原框架，部署前应另行核对并处理该依赖提示。
- Three.js 库内部使用 Clock 产生弃用提示；没有页面异常，未声称达到生产设备性能指标。

截图见 [桌面](geometry-qa/desktop.png)、[手机](geometry-qa/mobile.png)。本次只修改工作区，未提交、推送或部署。
