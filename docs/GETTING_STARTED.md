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

## V0.1 使用顺序

1. 添加团体。
2. 进入团体主页。
3. 添加专辑和发行日期。
4. 为专辑添加不同版本。
5. 把版本状态设置为：已拥有、缺少、Wishlist 或已预购。
6. 使用年份、状态、搜索和排序查看收藏。

## 局域网访问

项目默认只监听 `127.0.0.1`。如果后续需要让同一 Wi-Fi 下的手机访问，可以把 `.env` 中的 `HOST` 改成 `0.0.0.0`。

在增加登录/鉴权之前，不建议把当前 V0.1 直接暴露到公网。
