# V0.5B-2 多团实体专辑资料库

本阶段把通用 Catalog Engine 扩展到以下 14 个团体：

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

SEVENTEEN 继续使用仓库内已经人工整理的静态目录。

## 数据范围

在线同步使用 MusicBrainz 的 Official release metadata，并用 Cover Art Archive 的 release front artwork 作为版本独立封面来源。

同步范围：

- Album / EP / 有实体介质的 Single
- CD、Vinyl、Cassette、KiT 等非 Digital Media 介质
- Tracklist / Disc
- 每个实体 release 对应一个收藏版本
- release-specific front cover（有则使用）
- numeric Barcode（MusicBrainz 已记录并可确认时才导入）
- edition type 中保留介质和国家/地区，例如 `CD · KR`

默认排除：

- Digital-only release
- Live
- Remix
- Soundtrack
- Interview / Spokenword / DJ mix

这些规则是为了让网站保持“实体 K-pop 专辑收藏”定位，而不是变成所有流媒体单曲的音乐数据库。

## 首次启动

本机执行：

```bash
npm start
```

启动前会先导入 SEVENTEEN 静态目录，然后检查 14 个在线目录是否已经导入。缺少的团体会通过 MusicBrainz 依次同步。同步遵守 MusicBrainz 请求节流，第一次启动可能需要几十秒到数分钟；后续启动检测到导入标记后会直接跳过。

网络异常不会阻止网站启动：`--best-effort` 会保留已经成功导入的数据，并在下一次启动继续补缺。

手动刷新所有在线目录：

```bash
npm run catalog:sync:force
```

只刷新指定团体：

```bash
node scripts/sync-curated-catalogs.js --only aespa,illit --force
```

## 收藏安全策略

目录同步只负责补充资料库，不代替用户的收藏判断：

- 新实体版本统一创建为 `missing`
- `quantity = 0`
- 已存在的 owned / wishlist / preordered 状态不会被强制重置
- 用户自己上传的版本封面、Barcode、版本类型优先，不会被目录覆盖
- MusicBrainz 没有可靠版本封面时，版本卡片沿用专辑封面
- MusicBrainz 没有可靠 Barcode 时保持空值，绝不猜测

## 页面表现

专辑详情页的“我的实体版本”升级为实体版本卡片：

- 更大的独立版本封面
- 版本名称
- 版本类型 / 地区
- Barcode
- 数量
- 独立封面 / 专辑封面回退提示
- 收藏状态
- 主人编辑入口

## Sites 云端版

当前在线 MusicBrainz 同步针对本机 SQLite。Sites 的 D1 / R2 与本机数据库仍是独立数据源。

需要把本机同步后的完整目录带到 Sites 时，应在确认本机收藏数据正确后使用现有 `sites:snapshot` / 部署流程生成新的 bootstrap。不要在不确认数据的情况下用快照覆盖云端个人收藏。

## 数据来源与边界

MusicBrainz 适合大规模获得 release、track、format、country、barcode 等开放音乐元数据；Cover Art Archive 用于 release artwork URL。部分 K-pop 官方商店独占版本、POB、随机成员内封或刚发布的新版本可能比 MusicBrainz 更新更快，因此后续可以在对应团体目录上继续加入人工 verified override。零售店 POB 不自动视作独立 album version。
