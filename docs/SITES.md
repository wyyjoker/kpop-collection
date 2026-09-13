# Sites 云端运行

保留原来的 `npm start`（Express + 本机 SQLite），新增单独的 Sites Worker。两种环境共用 `public/` 手账界面、五个页面与参考图中的女团横幅，不自动同步数据库。

## 数据和访问

- 默认仅站点所有者可访问；站点平台处理登录和访问范围，Worker 检查登录身份并拒绝跨站写请求。
- 云端收藏、曲目和个人资料使用 D1；上传图片使用 R2。不会向公开静态目录写入用户图片。
- `sites/bootstrap.json` 是这次发布的本地迁移快照（32 张专辑、291 首曲目）。仅首次初始化时导入；再次部署、删除或清空收藏不会重新覆盖云端数据。
- 迁移快照进入私有 Sites 源码库。不要把未来含有私人资料的快照推送到公开 GitHub 仓库。
- `db/schema.ts` 定义结构，`drizzle/` 保存正式迁移。生成新迁移用 `npm run db:generate`，不要修改已经部署的迁移。

## 备份与图片

在设置 → 备份与恢复中，云端 JSON 和 SQLite 导出均包含数据库记录、个人资料，以及被引用的上传图片。SQLite 使用纯 JavaScript SQLite 引擎打包，不依赖 Worker 本地文件系统或动态 WebAssembly 编译。

单张上传图片上限 8 MB；完整备份中图片总量上限 12 MB；上传恢复文件上限 24 MB。超过限制会明确报错，不会静默遗漏图片。支持 PNG、JPEG、WebP、GIF、AVIF 上传。

恢复前校验记录和关联，保存云端安全快照到 R2 的 `backups/` 前缀，然后在一次数据库事务内替换。图片写入全新对象名，不覆盖现有图片；失败会回滚数据库并清理本次新对象。未被引用的旧图片保留，以免破坏旧备份；不会自动批量删除。

本地旧版 JSON/SQLite 备份也能导入；如果引用了仅保存在本机的上传图片，需要使用包含这些图片的完整备份，或先迁移原图。云端与本地的导出可以交换数据，但本地旧后端不会自动展开云端备份中的图片附件。

## 开发与验证

开发与 CI 使用 Node.js 22 或更新版本（Workers 测试运行时的要求）。

1. `npm ci`
2. `npm run build`
3. `npm run sites:preview`：独立的 Workers 预览，默认 `http://127.0.0.1:3002`，数据位于 `.sites-runtime/`，不改动本机收藏库。
4. `npm test`：33 项原有前端/备份回归和云端登录、CRUD、对象存储接口、JSON/SQLite 恢复测试。云端接口通过 Node / SQLite 兼容测试器运行，不等同于原生 Workers 验证。需要先构建，测试使用临时存储。
5. `npm run test:sites:workers`：通过原生 Workers 执行同一套云端集成测试；CI 在 Linux 上运行此额外步骤。

预览使用本机 Workers 运行时；Windows 若提示 access violation，应更新 Microsoft Visual C++ 运行库。不要因此关闭云端身份校验。

本次 Windows 的原生运行时无法启动，已在兼容测试器中通过全部 33 项测试，并在浏览器检查五个页面和三个 WebMCP 工具的有效／无效输入。需要临时兼容预览时，在 PowerShell 设置 `$env:SITES_TEST_RUNTIME='node'` 后启动 `npm run sites:preview`；此模式的图片仅保存在内存中，不能作为真实收藏存储。正式云端使用持久化 R2，不受此本机预览限制。

`npm run sites:snapshot` 只在明确需要重新采集本地数据时运行（本地服务需在 3000 端口）。更新快照不会覆盖已经初始化的云端站点；后续数据转移应使用备份恢复。

发布产物是 `dist/server/index.js`、`dist/client/` 和 `dist/.openai/`。Sites 凭证只在单次 Git 推送命令中使用，不写入项目文件或 Git 配置。发布只推送 Sites 私有源码库，不自动推送原 GitHub 仓库。

本机 Sites 构建包装脚本遇到 Windows npm.cmd 路径解析错误时，使用项目原生 `npm run build` 完成同一构建。打包仍使用 Sites 官方打包器；Git Bash 下为 tar 设置 `TAR_OPTIONS=--force-local`，避免把 Windows 盘符识别为远端地址。

现有本地 Express / sqlite3 依赖树仍有 npm audit 告警，未在本次发布中强制升级这些历史依赖；它们不进入云端 Worker 包。后续升级本地依赖应单独运行备份与 SQLite 回归测试。
