# Sites 云端运行

Sites Worker 与本地 `npm start` 共用 `public/` 手账界面，但使用独立的数据存储：

- 本地：Express + SQLite + `public/uploads/`
- 云端：Worker + D1 + R2

个人收藏状态不会在两端后台自动双向覆盖；需要整库迁移时仍使用 JSON / SQLite 备份恢复。

## 数据和访问

- 站点允许公开浏览；访客只能查看。
- 上传、修改、删除、完整备份、恢复、云端资料库同步仅主人可操作。
- Worker 同时验证平台身份与秘密环境变量 `OWNER_EMAIL`；未正确配置时云端写入失败关闭。
- 写接口拒绝跨站请求。
- 公开 `/api/library` 不返回购买价格、购买日期、购买渠道和私人收藏备注。
- D1 保存团体、专辑、实体版本、Tracklist、收藏状态、照片/音频记录和个人资料。
- R2 保存上传图片、实物照片、本地音频和安全备份文件。

`sites/bootstrap.json` 仍只用于全新 D1 的首次初始化。已经初始化的云端站点不会因重新部署而被 bootstrap 覆盖。

## V0.5B Beta 3：14 团云端资料库

Sites / D1 已直接接入与本地一致的 14 团在线资料库：

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

主人登录后打开 **备份与恢复 → 云端团体资料库**，可以：

- 查看 14 团各自是否已经同步
- 查看当前 D1 中的发行数 / 实体版本数
- 同步缺少的团体
- 重新检查全部 14 团的新发行

云端资料来自 MusicBrainz + Cover Art Archive，按团逐个同步，避免一个 Worker 请求同时处理全部团体。

同步会写入：

- Physical Album / EP / Single
- Tracklist / Disc 顺序
- 专辑封面
- 实体 release 版本
- release-specific 版本封面
- 可确认的数字 Barcode

不会下载商业音频或歌词。

### 云端资料库不会覆盖什么

已有的以下用户数据会保留：

- owned / wishlist / missing / preordered
- 数量
- 购买信息
- 收藏备注
- 用户自定义版本封面
- 已填写 Barcode / edition type

新创建的实体版本默认 `missing + quantity 0`。

详细规则见 `docs/CLOUD_CATALOG_SYNC.md`。

## 备份与资源

云端 JSON 和 SQLite 导出会包含数据库记录、个人资料、实物照片及描述、本地音频记录，以及当前备份引用到的 R2 文件。

- 单张图片上限：8 MB
- 单段音频上限：20 MB
- 单份完整备份资源合计上限：48 MB
- 上传恢复文件上限：64 MB

恢复前会校验记录与外键关系，并在 R2 保存 `backups/before-restore-*` 安全快照；资源使用新对象名写入，不覆盖已有文件。失败时清理本次新增对象并保持现有数据库。

## 实物照片与本地音频

专辑子页支持：

- 多张实物照片
- 每张照片独立描述
- 保存后再次编辑描述
- 大图查看
- 本地 MP3 / M4A / WAV / OGG / FLAC 等音频上传
- 底栏真实播放

照片和音频资源当前可被站点访客读取，因此不要上传包含隐私信息的照片或不适合公开提供的文件。

## 开发与验证

开发 / CI 使用 Node.js 22 或更新版本。

```bash
npm ci
npm run check
npm run build
npm test
npm run test:sites:workers
```

`npm run sites:preview` 启动独立 Workers 预览，默认 `http://127.0.0.1:3002`，持久化预览数据位于 `.sites-runtime/`，不会修改你的本地 SQLite 收藏库。

CI 同时执行：

- JS 语法检查
- Sites Worker build
- 前端 / 备份 / catalog 回归测试
- 原生 Workers 集成测试
- 云端 catalog status / 写权限测试
- PWA / 静态资源检查
- SEVENTEEN 固定目录 seed
- 本地服务器 smoke test

## 数据迁移原则

本地 SQLite 与云端 D1 是两个独立个人收藏库。

现在 14 团“资料库元数据”可以分别直接同步，不需要把本机整库覆盖到云端；但是你自己标记的拥有状态和个人备注仍不会后台双向同步。

如果你明确要把某一端作为主库并迁移个人收藏：

1. 先在源端导出 JSON 或 SQLite；
2. 在目标端先导出一份安全备份；
3. 再执行恢复；
4. 确认 owned / wishlist / 图片 / 音频后再继续编辑。

不要用 catalog sync 代替个人收藏迁移。
