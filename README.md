# K-pop Collection

个人 K-pop 实体专辑收藏管理器。

当前版本：**V0.5B Beta 3**

## 当前能力

- 首页 / 我的收藏 / 专辑图鉴 / 心愿清单 / 关于我五个页面
- 团体 → 专辑 → 实体版本 → 收藏状态完整层级
- 专辑封面、版本独立封面、Tracklist、Barcode、实物照片与备注
- owned / wishlist / missing / preordered 状态和数量管理
- 本地音频上传与底栏播放器
- JSON / SQLite 备份恢复
- PWA 手机安装体验
- 本地模式：Express + SQLite
- 云端 Sites 模式：Worker + D1 + R2，公开只读、主人登录后编辑

## V0.5B 实体版本资料库

SEVENTEEN 是仓库内人工整理并固定的完整实体目录样本：

- 32 个团体本体实体发行，覆盖 2015 `17 CARAT` 至 2025 `HAPPY BURSTDAY`
- 291 首曲目
- 100+ 实体版本，覆盖 Photobook / CARAT / KiT / Weverse Albums / Deluxe / 日本初回限定盘 / CARAT盘等
- 随机成员包装只作为一个实体商品版本管理
- 零售商 POB / 店铺特典暂不作为独立专辑版本
- Barcode 只在可靠核实时写入；商品编号不冒充 Barcode
- 没有可靠独立版本封面时回退到专辑封面，不伪造图片
- 所有资料库版本第一次导入默认 `missing + quantity 0`
- 用户自己编辑过的收藏状态、数量、备注、自定义封面、Barcode 和类型不会被资料库强制覆盖

固定数据：

- `public/data/seventeen-catalog.json`
- `public/data/seventeen-versions.json`

## 14 团在线实体资料库

除 SEVENTEEN 外，系统支持下列 14 个团体：

- TOMORROW X TOGETHER
- EXO
- ILLIT
- NMIXX
- ENHYPEN
- Red Velvet
- Hearts2Hearts
- TWICE
- LE SSERAFIM
- aespa
- RESCENE
- ITZY
- BLACKPINK
- KiiiKiii

资料由 MusicBrainz Official release metadata + Cover Art Archive 生成，范围为实体 Album / EP / Single；默认排除 Digital-only、Live、Remix、Soundtrack、Interview、Spokenword、DJ mix。CD、Vinyl、Cassette、KiT 等实体介质保留。

导入内容：

- 发行名称 / 日期 / 类型
- Tracklist 和 Disc 顺序
- 专辑封面
- release-specific 实体版本
- 有独立 artwork 时的版本独立封面
- MusicBrainz 可确认的数字 Barcode

商业歌曲音频和歌词不会被复制；歌曲部分只保存标题与曲序。

### 本地 SQLite

首次联网启动会自动尝试补齐缺少的注册团体。手动刷新全部：

```bash
npm run catalog:sync:force
```

只刷新指定团体：

```bash
node scripts/sync-curated-catalogs.js --only aespa,illit --force
```

### Sites / D1 云端

Beta 3 已把同一套 14 团资料库直接接入 Sites Worker 和 D1，不再需要先把本机 SQLite 整库覆盖到云端。

主人登录云端站点后：

1. 打开 **备份与恢复**；
2. 找到 **云端团体资料库**；
3. 可查看每个团的同步状态、发行数、实体版本数；
4. 选择 **同步缺少的团体**，或 **重新检查全部 14 团**。

云端按团逐个请求 `/api/catalog/sync/:slug`，所以某一个团网络失败不会阻止其他团；失败项会在面板中列出，可单独重试。

安全与数据规则：

- `/api/catalog/status` 可读取同步状态；真正写 D1 的同步接口仅主人可调用
- 同步写请求继续受 Sites 身份校验和同源检查保护
- 不从本机 SQLite 静默覆盖 D1
- 新实体版本默认 `missing + quantity 0`
- 已有 owned / wishlist / preordered、数量、收藏备注和用户自定义资料保留
- 自定义本地/R2封面不会被 Cover Art Archive 强制覆盖
- Barcode 缺失时保持空白并在 UI 显示“未核实”
- MusicBrainz 暂时不可用时返回可重试错误，不破坏已存在云端收藏

详细说明：`docs/CLOUD_CATALOG_SYNC.md`。

## 通用 Catalog Engine

本地统一导入器：

```text
scripts/import-catalog.js
```

本地 MusicBrainz 同步器：

```text
scripts/sync-curated-catalogs.js
```

云端 D1 同步核心：

```text
sites/catalog-sync.mjs
```

团体注册表：

```text
public/data/catalog-registry.json
```

以后增加新团优先扩注册表和通用规则，不再堆 `seed-aespa.js`、`seed-ive.js` 之类的团体专用脚本。

## 实体版本详情 UI

专辑详情页的实体版本会显示：

- 版本独立封面，缺失时回退专辑封面
- 版本名称
- 版本类型 / 国家地区
- 已确认 Barcode 或“未核实”
- 数量
- owned / wishlist / missing / preordered
- 编辑入口

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

## 开发验证

```bash
npm ci
npm run check
npm run build
npm test
npm run test:sites:workers
```

CI 同时验证本地目录导入、Sites Worker 构建、原生 Workers 权限、云端 catalog status 路由、PWA 静态资源和服务器 smoke test。

更多文档：

- `docs/MULTI_GROUP_CATALOG.md`
- `docs/CLOUD_CATALOG_SYNC.md`
- `docs/SITES.md`
- `docs/CATALOG_SOURCE_POLICY.md`
