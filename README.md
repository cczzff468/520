# AppleAI Web — 仿 iOS AI 聊天系统

在浏览器里复刻一台「iPhone」：锁屏、主屏、App、负一屏……所有数据只存在你自己的浏览器 IndexedDB 里，不上传云端、无需登录，关掉再打开数据都在。

![tech](https://img.shields.io/badge/Next.js-外壳-black) ![ios](https://img.shields.io/badge/%E4%BB%BFiOS-%E5%8E%9F%E7%94%9FHTML%2FCSS%2FJS-999)

## ✨ 功能亮点

- **系统级仿真**：锁屏（壁纸/时间/通知）、主屏图标与文件夹、下拉搜索、控制中心、负一屏小组件、亮暗主题、壁纸自定义（支持手机上传并永久保存）
- **消息 Messages**：会话列表、气泡聊天、AI 回复（接入自有大模型 API 后生效）、图片/语音消息
- **微信 WeChat**：消息/通讯录/发现/我 四 Tab、朋友圈（发图文、点赞、评论、回复@、封面上传）、扫一扫（自绘扫描动画）、联系人详情、群聊
- **其他 App**：照片（相册/上传）、音乐、备忘录（富文本+待办）、日历、通讯录、时钟、天气、浏览器、设置（API 配置/预设/备份导出）等
- **数据全本机**：IndexedDB 单库 14 张表，设置中心支持 JSON 备份导出/导入

## 🚀 快速开始

```bash
bun install        # 或 npm install
bun run dev        # 或 npm run dev
# 打开 http://localhost:3000
```

首次启动即带示例数据（联系人、歌曲、备忘录、欢迎消息）。想启用真实 AI 对话：进入 **设置 → API 配置**，填入你自己的大模型接口地址与 Key（仅存于本机浏览器）。

## 📁 目录结构

```
public/ios/          # 仿 iOS 系统（原生 HTML/CSS/JS，无框架）
  index.html         # 系统入口
  css/               # 全局样式、主题变量、各 App 样式
  js/
    core/            # db.js(IndexedDB 封装) seed.js(示例数据) applayer.js(App窗口管理)
    modules/         # 消息、微信、照片、音乐、备忘录、设置等各 App
    apps/            # 通讯录、朋友圈等独立模块
src/app/page.tsx     # Next.js 外壳：iframe 承载 /ios/index.html
prisma/schema.prisma # Next.js 侧数据模型（外壳脚手架）
```

## 🧱 技术说明

- iOS 界面为**零依赖原生三件套**（HTML + CSS + JS ES Modules），可脱离 Next.js 独立部署（任意静态服务器托管 `public/ios/` 即可）
- Next.js 仅作为外壳与开发服务器；生产构建 `bun run build && bun run start`
- 图片上传统一经 canvas 压缩（长边 ≤1440）后入库，控制 IndexedDB 体积
- 状态栏颜色随壁纸亮度自适应采样

## ⚠️ 数据与隐私

- 一切用户数据（对话、联系人、朋友圈、壁纸、API Key 配置）均存于浏览器 IndexedDB，**不会**出现在服务器或代码仓库中
- 换浏览器 / 清除站点数据 = 恢复出厂，请善用「设置 → 备份」导出 JSON

## License

MIT
