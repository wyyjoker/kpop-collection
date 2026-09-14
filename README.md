# K-pop Collection

个人 K-pop 实体专辑收藏管理器。

当前版本：**V0.5B Beta 2**

## 当前状态

项目已经从单页收藏工具升级为完整的个人 K-pop 收藏日记：

- 首页 / 我的收藏 / 专辑图鉴 / 心愿清单 / 关于我五个独立页面
- 团体 → 专辑 → 实体版本 → 收藏状态的完整层级
- 专辑详情页支持实物照片、照片说明、Tracklist、本地音频上传与底栏真实播放
- 本地 Express + SQLite 模式
- Sites 云端模式：D1 数据、R2 图片/音频、公开只读、主人登录后编辑
- JSON / SQLite 备份恢复
- PWA 手机安装体验
- 模块化前端：`public/js/api.js`、`store.js`、`components.js`、`pages.js`、`dialogs.js`、`photos.js`、`audio.js`、`player.js`

## V0.5B：实体版本资料库

SEVENTEEN 是第一套仓库内人工整理并固定版本的完整实体目录样本：

- 32 个团体本体实体发行，覆盖 2015 `17 CARAT` 至 2025 `HAPPY BURSTDAY`
- 291 首曲目
- 每个发行均有实体版本清单，例如 Photobook / CARAT / KiT / Weverse Albums / Deluxe / 日本初回限定盘 / CARAT盘等
- 随机成员封面的 `COMPACT / DEAR / DAREDEVIL` 只按一个实体商品版本管理，不把随机成员内封误拆成多个收藏版本
- 零售商 POB / 店铺特典不作为独立专辑版本，后续可单独建“特典”层
- 条码只在可靠核实时写入；商品编号不冒充条码
- 没有可靠独立版本封面时，前端继续回退到专辑封面，不伪造图片
- 所有预置实体版本第一次导入时默认：`missing + quantity 0`
- 导入器绝不会自动把目录数据标为“已拥有”
- 用户自己编辑过的版本封面、条码、类型、收藏状态、数量和备注不会被目录强制覆盖

数据：

- `public/data/seventeen-catalog.json`：发行 / 封面 / Tracklist
- `public/data/seventeen-versions.json`：实体版本目录

## V0.5B Beta 2：多团实体资料库

本机首次联网启动时，系统会在 SEVENTEEN 之外继续同步下列 14 个团体的实体发行、Tracklist、封面与实体 release 版本：

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

数据由 MusicBrainz 的 Official release metadata 生成，版本封面优先使用 Cover Art Archive 的 release-specific front artwork；Barcode 只在 MusicBrainz 有可靠数字条码时写入，缺失则保持空白。

在线目录默认只同步符合实体收藏定位的 Album / EP / 实体 Single，排除 Digital-only、Live、Remix、Soundtrack、Interview、Spokenword 和 DJ mix。CD、Vinyl、Cassette、KiT 等实体介质都会保留。

第一次同步可能需要几十秒到数分钟。MusicBrainz 网络异常不会阻止网站启动；成功导入的团体会留下 catalog marker，后续启动会直接跳过。手动刷新：

```bash
npm run catalog:sync:force
```

只刷新指定团体：

```bash
node scripts/sync-curated-catalogs.js --only aespa,illit --force
```

详细策略见 `docs/MULTI_GROUP_CATALOG.md`。

### 实体版本详情 UI

专辑详情页的“我的实体版本”现在会突出显示：

- 版本独立封面（有 release-specific artwork 时）
- 版本名称
- 版本类型 / 国家地区
- 已确认 Barcode，或明确显示“未核实”
- 数量
- 当前封面是独立版本封面还是专辑封面回退
- owned / wishlist / missing / preordered 状态

## 通用 Catalog Engine

V0.5B 不再继续堆 `seed-aespa.js`、`seed-ive.js` 这类团体专用脚本。

统一导入器：

```text
scripts/import-catalog.js
```

支持：

```text
Catalog JSON
   ↓
Group
   ↓
Album
   ↓
Track
   ↓
Physical Version
   ↓
Collection (默认 missing)
```

在线资料同步器：

```text
scripts/sync-curated-catalogs.js
```

团体注册表：

```text
public/data/catalog-registry.json
```

SEVENTEEN 的兼容启动入口仍然保留：

```bash
npm run seed:seventeen
```

也可以手工调用通用导入器：

```bash
npm run catalog:import -- \
  --slug aespa \
  --catalog /path/to/aespa-catalog.json \
  --versions /path/to/aespa-versions.json \
  --force
```

导入器是幂等的：重复执行不会重复创建同一团体、发行或版本；目录元数据只补空白，不覆盖用户已经维护的数据。同名但不同发行日期的专辑 / 单曲也会按发行日期精确绑定实体版本，避免错挂。

## Sites 云端版本

已增加 Sites 托管适配：公开浏览、仅主人编辑，D1 收藏与个人资料、R2 图片/音频上传，以及含资源的 JSON / SQLite 备份恢复。保留本机 `npm start`；本地和云端数据独立。

**Beta 2 的 14 团 MusicBrainz 在线同步目前针对本机 SQLite。** Sites 云端不会自动读取你电脑的本地数据库；确认本机目录后，可通过现有 Sites snapshot / 部署流程把目录带入云端。详见 `docs/MULTI_GROUP_CATALOG.md` 和 `docs/SITES.md`。

开发与验证：

```bash
npm ci
npm run check
npm run build
npm test
npm run test:sites:workers
```

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

首次联网启动会导入 SEVENTEEN 固定目录，并尝试补齐注册表中的其他团体；之后根据 catalog marker 跳过已经完成的同步。
