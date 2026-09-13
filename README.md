# K-pop Collection

个人 K-pop 实体专辑收藏管理器。

当前版本：**V0.5A Alpha 4**

## Sites 云端版本

已增加 Sites 托管适配：公开浏览、仅主人编辑，D1 收藏与个人资料、R2 图片上传、含图片的 JSON / SQLite 备份恢复。保留本机 `npm start`；本地和云端数据独立。构建与验证先运行 `npm run build`，再运行 `npm test`。开发、迁移与限制见 [Sites 说明](docs/SITES.md)。

## 当前工作区：五页手账重构（2026-09-13）

已按用户补充的五张高清效果图统一首页、我的收藏、专辑图鉴、心愿清单、关于我，以及团体页和编辑弹窗。下面 V0.2～V0.5A 章节保留为历史说明，当前界面以本节和 [实施记录](docs/DESIGN_IMPLEMENTATION_PLAN.md) 为准。

- 顶部五个入口是独立视图，支持地址直达、刷新和前进后退。
- 图鉴支持搜索、团体／年份／类型／状态筛选、排序、网格／列表和加载更多。
- 点击专辑进入独立子页面：上传多张实物照片，每张照片都有可编辑的多行文字描述，也可查看实体版本和曲目。
- 首页横幅的“更换横幅照片”支持上传自己的图片，或恢复参考图中的默认女团照片；标题和两侧装饰保留。
- 关于我可保存昵称、简介、头像、首页照片、本命团和笔记；数据存储于 SQLite。
- 收藏编辑支持版本、数量、渠道、拆封、备注及可选购买日期／价格／币种，不统计示例预算。
- JSON 备份升级为 schema 4，包含实物照片及描述、曲目、导入标记、个人资料；兼容 schema 1／2／3。旧备份没有个人资料或实物照片时恢复为空。
- 生产入口仅加载 `public/app.js`、`public/js/` 和 `public/scrapbook.css`，不再加载旧版叠加脚本。旧文件暂留以便比对。
- `npm run check` 检查语法，`npm test` 使用临时数据库执行回归，不修改个人收藏库。

启动：`npm install` 后 `npm start`，访问 http://127.0.0.1:3000 。预置目录有 32 张发行、291 首曲目，但没有虚构的实体版本：请在图鉴中添加实际收藏的版本，收藏／心愿页才会出现对应记录。

设计原图位于 [docs/design-target/originals](docs/design-target/originals)。AI 生成的收藏角氛围素材及提示词见 [素材说明](docs/design-target/ASSET_PROVENANCE.md)。未接入真实音乐播放，底栏有明确提示。

## 已实现

- 团体 / 专辑 / 专辑版本分层管理
- 团体、专辑、版本新增 / 编辑 / 删除
- 专辑与版本封面上传
- 收藏状态：已拥有 / 缺少 / Wishlist / 已预购
- 收藏信息：数量、购买渠道、拆封状态、备注
- 按年份、状态、名称搜索与排序
- 团体和专辑收藏完成度统计
- JSON 数据导入 / 导出
- SQLite 数据库备份 / 恢复
- GitHub Actions 语法检查与启动烟测

## SEVENTEEN 预置专辑目录

V0.5A Alpha 4 先加入一套 SEVENTEEN 实体发行目录，作为后续自动专辑资料库的第一组真实数据：

- 32 个 SEVENTEEN 团体实体发行，覆盖韩国正规 / 迷你 / 特别 / 再版 / 精选，以及日本 Mini Album / EP / Single / Best Album
- 收录时间范围：2015 `17 CARAT` 至 2025 `HAPPY BURSTDAY`
- 每个发行包含：专辑名、发行日期、类型、地区、封面、Disc / Tracklist
- 封面使用 SEVENTEEN Japan Official Site / Cover Art Archive 的公开图片地址，不把第三方版权图片二进制复制进仓库
- 曲目只保存歌曲名称和 Disc / Track 序号，不保存歌词或音频文件
- 不混入 BSS、JxW、HOSHI X WOOZI、个人 Solo 等独立小分队 / Solo 发行
- 不收纯数字单曲；网站定位仍是实体专辑收藏
- `npm start` / `npm run dev` 会执行一次幂等导入：已有同名同发行日专辑不会重复创建，已有用户封面 / 类型不会被覆盖
- 需要重新同步预置目录时可运行：`npm run seed:seventeen`
- SEVENTEEN 团体详情的每张已收录专辑下面新增可展开的 `TRACKLIST` 手账区

数据文件：`public/data/seventeen-catalog.json`

导入器：`scripts/seed-seventeen.js`

## V0.2 UI / UX

- 首页收藏概览：缺少、Wishlist、已预购一眼可见
- 团体卡片和团体 Hero 视觉升级
- 专辑自动按发行年份分区展示
- 收藏状态快捷 Chips，与原筛选器实时同步
- 筛选工具栏吸顶，长列表操作更顺手
- 版本详情在桌面端为右侧抽屉，手机端为底部 Sheet
- 手机端底部导航与悬浮添加按钮

## V0.3 Wishlist + 收藏统计中心

- 独立收藏中心入口
- Wishlist 总览，可直接标记为已拥有
- 缺失版本总览，可直接标记为已拥有
- 团体收藏完成度排行
- 按专辑发行年份统计版本收藏完成度
- 已拥有 / Wishlist / 已预购 / 缺少状态分布
- 支持按团体和关键词筛选
- 首页与手机底部导航接入收藏中心
- 不统计购买金额，不要求填写购买日期
- 价格、货币、购买日期字段仅在数据库中保留用于旧备份兼容，当前界面不展示

## V0.4 PWA + 手机 App 化

- Web App Manifest，支持 Android / 桌面浏览器安装
- iPhone / iPad “添加到主屏幕”适配与操作引导
- 192 / 512 / Maskable / Apple Touch 四套应用图标
- Service Worker 离线应用壳
- API 收藏数据和用户上传封面保持 network-only，不缓存旧数据
- 手机刘海 / 灵动岛 / 底部 Home Indicator 安全区适配
- 独立 App 窗口（standalone）状态下优化顶部和底部导航
- 网络断开时显示离线提示
- PWA 快捷入口：Wishlist / 缺失版本

## V0.5A K-pop 收藏日记首页

- 首页从深色 Dashboard 重构为粉彩 scrapbook / 手账拼贴风
- Hero 改为“K-pop 收藏日记 / Album Today, A Happier Me”主视觉
- Hero 自动使用你已经上传的团体 / 专辑封面拼成 Polaroid 拼贴
- 新增手绘爱心、星星、兔子、网格纸等自制 SVG 装饰资源
- 新增“我喜欢的团”横向头像入口
- 首页主区域升级为左侧收藏分类 / 中间专辑卡片 / 右侧手账便签三栏布局
- 回归专辑按真实专辑数据和收藏状态展示
- 限定版区域从版本名称 / edition type 自动识别 Limited / Special / Digipack / POB 等版本
- 右侧新增“小小日常 / 最近收录 / 心愿清单”手账卡片
- 顶部加入首页导航和跨团体专辑搜索
- 底部加入装饰性粉色音乐播放器条，暂不接真实音频播放
- 手机端自动折叠成单栏、横滑团体和双列专辑卡片
- 保留 V0.1B ~ V0.4 的 CRUD、收藏中心、备份和 PWA 逻辑

> V0.5A 目前只重构首页。团体详情页与收藏中心仍沿用 V0.4 的界面，后续 V0.5B / V0.5C 再统一成同一套 scrapbook 视觉。

> PWA 的 Service Worker 与“安装 App”能力要求安全上下文。电脑本机的 `http://127.0.0.1` / `localhost` 可用于开发；手机通过局域网 HTTP IP 访问时，通常需要 HTTPS 才能完整启用安装和离线能力。

## 技术栈

Node.js + Express + SQLite + HTML/CSS/JavaScript + PWA

## 本地运行

```bash
npm install
cp .env.example .env
npm start
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
npm install
npm start
```

打开：`http://127.0.0.1:3000`

详细说明见 `docs/GETTING_STARTED.md`。
