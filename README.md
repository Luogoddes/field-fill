# 字段填充 (Universal Field Filler)

通用表单字段填充工具，支持多 Profile、实时拾取、批量管理、暗黑模式与导入导出。

## 📋 项目介绍

**字段填充** 是一个 Chrome/Edge 浏览器扩展，用于快速填充网页表单字段。它可以帮助你：
- 一键填充多个表单字段
- 管理多个配置文件（Profile）
- 实时拾取网页字段（悬停选择）
- 智能解析文本内容到字段
- 导入导出配置，方便备份和迁移

## 🎯 核心功能

### 1. 预设填充
- 支持创建多个预设（Preset）
- 一键填充预设到当前页面
- 支持标签管理和搜索
- 全局默认预设（快捷键和右键菜单使用）
- **自动填充**：配置URL规则后，页面加载时自动填充（支持 SPA 路由跳转，具备重试机制确保稳定性）
- **跳转填充**：点击跳转按钮，自动打开目标URL并填充字段

### 2. 字段配置
- 支持文本输入框、下拉选择框、多行文本框
- 实时字段拾取（鼠标悬停自动识别）
- 批量扫描页面表单字段
- 拖拽排序字段

### 3. 智能解析
- 自动识别文本中的字段值
- 支持别名匹配（如 "SOC" → "SoC 版本"）
- 一键保存解析结果为预设

### 4. 导入导出
- 全量备份/恢复配置
- 单个 Profile 导入导出
- 预设导出为 JSON 文件

### 5. 其他特性
- 暗黑模式支持
- 快捷键支持（Ctrl+Shift+F）
- 右键菜单支持
- 实时存储容量管理

## 🚀 安装方法

### 方法一：从 Edge 扩展商店安装（推荐）
已上架 Microsoft Edge Add-ons，扩展名称为 **字段填充**。

[![Edge Add-ons](https://img.shields.io/badge/Edge-Add--ons-0078D7?logo=microsoftedge)](https://microsoftedge.microsoft.com/addons/detail/%E5%AD%97%E6%AE%B5%E5%A1%AB%E5%85%85/aekjpmdkkenfoclhkmmjjchnebfaopej?hl=zh-CN)

👉 [前往 Edge 扩展商店安装](https://microsoftedge.microsoft.com/addons/detail/%E5%AD%97%E6%AE%B5%E5%A1%AB%E5%85%85/aekjpmdkkenfoclhkmmjjchnebfaopej?hl=zh-CN)

### 方法二：从 Chrome Web Store 安装
（待发布）

### 方法三：手动安装（开发者模式）
1. 下载本项目的 ZIP 包并解压
2. 打开 Chrome/Edge 浏览器，访问 `chrome://extensions/`
3. 开启 "开发者模式"
4. 点击 "加载已解压的扩展程序"
5. 选择解压后的文件夹

## 🎮 使用说明

### 基本操作
1. **添加字段**：在 "字段配置" 标签页中，点击 "🎯 拾取" 按钮，鼠标悬停到目标字段自动识别
2. **创建预设**：在 "预设填充" 标签页中，点击 "+" 按钮创建新预设
3. **填充表单**：在 "预设填充" 标签页中选择预设并点击 "✨ 填充"，或使用快捷键 Ctrl+Shift+F
4. **智能解析**：在 "智能解析" 标签页中粘贴包含字段数据的文本，点击 "🔍 解析文本"

### 快捷键
- **Ctrl+Shift+F**：填充当前页面（使用全局默认预设）
- **Ctrl+Enter**：在智能解析页面快速解析文本

### 右键菜单
右键点击页面空白处，选择 "字段填充" 即可使用全局默认预设填充当前页面。

## 📁 项目结构

```
redmine-filler/
├── icons/                # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── background.js         # 后台服务（Service Worker）
├── content.js            # 内容脚本（注入页面）
├── content.css           # 内容样式
├── popup.html            # 弹出页面
├── popup.js              # 弹出页面脚本
├── manifest.json         # 扩展配置
└── README.md             # 项目说明
```

## 🔧 技术栈

- **前端**：原生 JavaScript + HTML5 + CSS3
- **存储**：Chrome Storage API
- **通信**：Chrome Runtime Messages
- **构建**：无构建工具，纯静态文件

## 📄 许可证

MIT License

## 👨‍💻 作者

洛 (Luo)

## 📞 联系方式

- GitHub: [github.com/Luogoddes/field-fill](https://github.com/Luogoddes/field-fill)

---

## 💬 反馈与建议

如有 Bug 或新功能需求，欢迎到 [GitHub Issues](https://github.com/Luogoddes/field-fill/issues) 提出。

## Changelog

### v1.4.3 (2026-05-13)
- 🐛 修复 Bug A：SPA 路由跳转后自动填充失效（添加 history.pushState/replaceState 拦截 + popstate 监听）
- 🐛 修复 Bug B：首次打开/刷新时自动填充行为不一致（添加 MutationObserver 重试机制，最多重试 10 次）
- 🐛 修复 Bug C：手动填充后自动填充重复覆盖数据（共享填充状态，手动填充时抑制后续自动填充）
- 🐛 修复自动填充 Toast 提示为英文的问题（恢复中文 + 🤖 图标）
- 🐛 修复导入 Profile 缺少结构校验（导入畸形数据可能导致异常）
- 🔧 优化跳转填充机制（从硬编码 1.5s 改为监听页面加载完成 + 超时降级）
- ✨ 新增加 GitHub Issues 反馈入口（关于弹窗中可一键跳转）