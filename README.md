# K-pop Collection

个人 K-pop 实体专辑收藏管理器。

当前版本：**V0.5B Beta 1**

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

SEVENTEEN 作为第一套完整实体目录样本：

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

SEVENTEEN 的兼容启动入口仍然保留：

```bash
npm run seed:seventeen
```

以后新增其他团体时，可以直接调用：

```bash
npm run catalog:import -- \
  --slug aespa \
  --catalog public/data/aespa-catalog.json \
  --versions public/data/aespa-versions.json \
  --force
```

导入器是幂等的：重复执行不会重复创建同一团体、发行或版本；目录元数据只补空白，不覆盖用户已经维护的数据。

## Sites 云端版本

已增加 Sites 托管适配：公开浏览、仅主人编辑，D1 收藏与个人资料、R2 图片/音频上传，以及含资源的 JSON / SQLite 备份恢复。保留本机 `npm start`；本地和云端数据独立。

开发与验证：

```bash
npm ci
npm run check
npm run build
npm test
npm run test:sites:workers
```

详细说明见 `docs/SITES.md`。

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

打开：

```text
http://127.0.0.1:3000
```

第一次启动会幂等导入 SEVENTEEN 发行、曲目和实体版本目录。

## 收藏模型

```text
Group
  └─ Album
      ├─ Track
      ├─ Album Photo
      ├─ Local Audio
      └─ Album Version
          └─ Collection
              ├─ owned
              ├─ wishlist
              ├─ missing
              └─ preordered
```

数据库仍保留旧购买日期 / 金额 / 货币字段用于兼容旧备份，但产品核心不做消费金额统计。

## 数据与版权边界

- 预置目录只保存发行元数据、封面 URL、曲名、版本名、可靠条码等资料。
- 不把商业歌曲音频预置进仓库。
- 本地音频播放仅用于用户自行上传的文件。
- SEVENTEEN 封面来源以官方 Discography / Weverse Shop 等公开资料为主，Cover Art Archive / MusicBrainz 用于辅助核实。
- 用户上传的实物照片与音频应由用户自己确保有权使用。

## 主要目录

```text
public/
  js/                  当前生产前端模块
  data/                目录数据
  uploads/             本地用户资源
sites/                  云端 Worker / D1 / R2 适配
db/                     Drizzle schema
scripts/                构建、目录导入、Sites 工具
tests/                  回归与云端集成测试
```

历史 V0.2～V0.5A 说明及五页手账设计实施记录见 `docs/`。
