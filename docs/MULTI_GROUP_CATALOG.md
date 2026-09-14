# V0.5B 多团实体专辑资料库

通用 Catalog Engine 当前覆盖以下 14 个团体：

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

SEVENTEEN 继续使用仓库内人工整理的静态完整目录。

## 数据范围

在线同步使用 MusicBrainz Official release metadata，并以 Cover Art Archive 的 release front artwork 作为版本封面来源。

同步范围：

- Album / EP / 有实体介质的 Single
- CD、Vinyl、Cassette、KiT 等非 Digital Media 介质
- Tracklist / Disc
- 每个实体 release 对应的收藏版本
- release-specific front cover
- numeric Barcode（只有来源存在可靠数字条码时）
- edition type 中保留介质和国家/地区，例如 `CD · KR`

默认排除：Digital-only、Live、Remix、Soundtrack、Interview、Spokenword、DJ mix。

## 本地 SQLite

```bash
npm start
```

启动前先导入 SEVENTEEN 静态目录，再检查 14 个在线目录。缺少的团体会依次通过 MusicBrainz 同步；已经有当前 catalog marker 的团体直接跳过。

网络异常采用 best-effort，不阻止本地网站启动。

强制刷新全部：

```bash
npm run catalog:sync:force
```

只刷新指定团体：

```bash
node scripts/sync-curated-catalogs.js --only aespa,illit --force
```

## Sites / D1 云端

V0.5B Beta 3 已经把相同 14 团规则直接接入云端 Worker / D1，不再要求先把本地 SQLite 目录整体迁移到云端。

主人登录 Sites 后打开：

**备份与恢复 → 云端团体资料库**

可以看到每个团：

- 是否已同步
- 当前 D1 发行数量
- 当前实体版本数量
- 最后导入 marker

操作：

- **同步缺少的团体**：仅补没有当前 marker 的团体
- **重新检查全部 14 团**：逐团强制刷新外部资料

每个团单独调用云端 `/api/catalog/sync/:slug`。这是故意的：大团发行较多，MusicBrainz 也有访问节流，不把 14 团合并成一个超长请求。

云端 D1 仍然是独立收藏库。Catalog sync 只补充公开资料元数据，不会把电脑上的 owned / wishlist / 私人备注自动同步过去。个人收藏整库迁移仍使用 JSON / SQLite 备份恢复。

详细见 `docs/CLOUD_CATALOG_SYNC.md`。

## 收藏安全策略

资料库同步只负责补充元数据：

- 新实体版本统一创建为 `missing`
- `quantity = 0`
- 已存在 owned / wishlist / preordered 不重置
- 已有 collection 数量、购买资料和备注不 UPDATE
- 用户上传的版本封面优先
- 用户已经填写的 Barcode / edition type 优先
- MusicBrainz 没有可靠版本封面时回退专辑封面
- MusicBrainz 没有可靠 Barcode 时保持空值
- catalog number 不冒充 Barcode

## 同名发行保护

Album 使用 `group + name + release_date` 精确定位。MusicBrainz release-group 在同名但不同日期时会生成不同专辑记录，避免版本挂到错误发行。

## 页面表现

专辑详情页实体版本卡片显示：

- 版本独立封面
- 版本名称
- 版本类型 / 地区
- Barcode 或“未核实”
- 数量
- 独立封面 / 专辑封面回退提示
- 收藏状态
- 主人编辑入口

## 数据来源边界

MusicBrainz 适合批量获得 release、track、format、country、barcode 等开放音乐元数据；Cover Art Archive 提供 release artwork。

部分官方商店独占版、POB、随机成员内封、刚发售的新版本可能更新更快，后续可以增加人工 verified override。零售店 POB 暂不自动视作独立 album version。
