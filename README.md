# K-pop Collection

个人 K-pop 实体专辑收藏管理器。

当前版本：**V0.4**

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
