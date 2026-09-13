# 本地运行

## 环境

- Node.js 20+
- npm

## 启动

```bash
npm install
cp .env.example .env
npm start
```

Windows PowerShell 可以使用：

```powershell
Copy-Item .env.example .env
npm install
npm start
```

默认访问地址：

```text
http://127.0.0.1:3000
```

## 数据位置

- SQLite 数据库：`data/kpop-collection.db`
- 上传图片：`public/uploads/`

这两个目录默认不会提交到 Git。

## V0.1B 使用顺序

1. 添加团体。
2. 进入团体主页并添加专辑。
3. 为专辑添加实体版本。
4. 点击版本名称或“详情”，记录收藏状态、数量、购买日期、购买价格、货币、购买渠道、拆封状态和备注。
5. 团体、专辑、版本均可编辑或删除；删除上级数据时，关联数据会级联删除。
6. 使用年份、状态、搜索和排序查看收藏。
7. 顶部“备份”按钮可导出或恢复 JSON / SQLite 收藏数据。

## 备份说明

V0.1B 提供两类数据备份：

- JSON：适合查看、迁移和恢复结构化收藏数据。
- SQLite：数据库原始快照，适合同一项目直接恢复。

注意：这两类备份保存的是数据库数据。上传的专辑和版本封面位于 `public/uploads/`，如果要跨电脑完整迁移，请同时备份该目录。

恢复 SQLite 前，服务会在数据库目录留下一个 `kpop-collection.db.before-restore` 安全副本，防止误恢复后完全没有回退文件。

## 局域网访问

项目默认只监听 `127.0.0.1`。如果后续需要让同一 Wi-Fi 下的手机访问，可以把 `.env` 中的 `HOST` 改成 `0.0.0.0`。

在增加登录/鉴权之前，不建议把当前版本直接暴露到公网。
