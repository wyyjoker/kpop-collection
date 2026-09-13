# K-pop Collection

个人 K-pop 实体专辑收藏管理器。

当前版本：**V0.2**

## 已实现

- 团体 / 专辑 / 专辑版本分层管理
- 团体、专辑、版本新增 / 编辑 / 删除
- 专辑与版本封面上传
- 收藏状态：已拥有 / 缺少 / Wishlist / 已预购
- 购买详情：数量、日期、价格、货币、渠道、拆封状态、备注
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
- 版本详情在桌面端改为右侧抽屉，手机端改为底部 Sheet
- 手机端底部导航与悬浮添加按钮，更接近原生 App
- 保持 V0.1B CRUD / 备份逻辑不变，V0.2 作为独立体验增强层加载

## 技术栈

Node.js + Express + SQLite + HTML/CSS/JavaScript

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
