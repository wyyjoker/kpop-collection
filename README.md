# K-pop Collection

个人 K-pop 实体专辑收藏管理器。

当前版本：**V0.1B**

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
- 响应式手机界面
- GitHub Actions 语法检查与启动烟测

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
