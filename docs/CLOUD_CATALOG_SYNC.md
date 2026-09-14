# Sites / D1 多团资料库同步

V0.5B Beta 3 把本地 14 团实体资料库能力直接接入 Sites Worker / D1。

## 目标

云端站点不再依赖“先在电脑 SQLite 同步，再整库恢复到 D1”这种高风险流程。主人可以直接在云端按团同步官方实体发行元数据，同时保留已经维护的个人收藏数据。

支持团体来自 `public/data/catalog-registry.json`：

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

## 数据来源与范围

Worker 通过 MusicBrainz Web Service 读取 Official releases，并使用 Cover Art Archive 的 release-specific front artwork。

默认保留：

- Album
- EP
- 实体 Single
- CD / Vinyl / Cassette / KiT 等实体介质

默认排除：

- Digital Media only
- Live
- Remix
- Soundtrack
- Interview
- Spokenword
- DJ mix

同步字段：发行名、发行日期、类型、Tracklist、Disc 顺序、专辑封面、实体 release 版本、版本封面、可确认数字 Barcode。

商业歌曲音频和歌词不从外部复制。

## 云端接口

### `GET /api/catalog/status`

返回注册表版本、catalog 版本和 14 个团体的云端同步状态：

- `slug`
- `name`
- `synced`
- `imported_at`
- `albums`
- `versions`

状态读取不写数据库。

### `POST /api/catalog/sync/:slug`

只允许 Sites 主人调用。

请求：

```json
{
  "force": false
}
```

`force=false` 时，已存在当前 catalog marker 的团体直接跳过；`force=true` 会重新读取 MusicBrainz 并补充/刷新可替换的远程元数据。

接口仍受原 Sites 安全策略保护：

- 必须通过主人身份校验
- 必须同源写入
- 跨站 POST 被拒绝
- 未注册 slug 返回 404

## 数据保护规则

云端同步是“补资料”，不是“覆盖个人收藏”。

### Group

只补空白的韩文名、出道日期、公司。封面只有在为空或本身来自 Cover Art Archive 时才允许被新的 Cover Art Archive 图替换。

### Album

使用 `group + name + release_date` 精确匹配，避免同名不同发行错挂。

只补空白类型、notes；专辑封面只在为空或旧值是 Cover Art Archive 时替换。

### Track

只清理并重建当前 slug 的 catalog-source Track；用户自己维护、其他来源的 Track 不会被删除。

### Physical Version

使用 `album + version_name` 匹配。

已有版本只补空白 Barcode / edition type。版本封面只有为空或旧值来自 Cover Art Archive 时才更新。

### Collection

新版本创建后仅执行：

```text
status = missing
quantity = 0
```

已有 collection 行不做 UPDATE，因此不会把 `owned / wishlist / preordered`、数量、购买渠道、备注等重置。

## UI

主人登录 Sites 后打开“备份与恢复”，会出现 **云端团体资料库** 面板：

- 显示 `已同步 / 总数`
- 每个团显示发行数和实体版本数
- “同步缺少的团体”：只执行尚未有 marker 的团
- “重新检查全部 14 团”：逐团 `force=true`
- 单团失败会记录错误并继续下一个团

逐团执行是故意设计的：MusicBrainz 有请求频率限制，而且大团体发行量较多，不把 14 个团塞进一个超长 Worker 请求。

## 失败行为

MusicBrainz 429 / 5xx 会进行有限次数退避重试。仍失败时当前团返回错误，已有 D1 数据保持不变；其他团可以继续同步。

如果 MusicBrainz 的某个 release 没有可信数字 Barcode，系统保持空白，不使用 catalog number 冒充 Barcode。

## 本地和云端关系

本地 SQLite 与云端 D1 仍是两个独立收藏库。它们共享同一套团体注册表和筛选规则，但不会双向自动同步你的个人收藏状态。

这意味着：

- 资料库元数据可以分别在本地和云端补齐
- 个人 owned / wishlist / notes 等仍以各自数据库为准
- 需要整库迁移个人数据时仍使用 JSON / SQLite 备份恢复

这样可以避免打开网页时后台偷偷覆盖另一端数据。

## 验证

```bash
npm run check
npm run build
npm test
npm run test:sites:workers
```

测试覆盖：

- 14 团注册表
- physical release 过滤
- Barcode 验证
- release-specific artwork
- 同名不同 release-group 不串库
- 云端 status 路由
- 游客无法调用同步写接口
- 未注册团体被拒绝
- 原生 Workers runtime 仍可运行现有 CRUD / D1 / R2 / 备份功能
