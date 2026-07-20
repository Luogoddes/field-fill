<p align="center">
  <img src="./icons/icon128.png" width="96" alt="字段填充图标" />
</p>

<h1 align="center">字段填充 · Universal Field Filler</h1>

<p align="center">
  一款极简、智能、高效的 Chrome / Edge 表单填充扩展
</p>

<p align="center">
  <a href="https://microsoftedge.microsoft.com/addons/detail/%E5%AD%97%E6%AE%B5%E5%A1%AB%E5%85%85/aekjpmdkkenfoclhkmmjjchnebfaopej?hl=zh-CN">
    <img src="https://img.shields.io/badge/Edge%20Add--ons-1.4.6-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white" alt="Edge Add-ons" />
  </a>
  <img src="https://img.shields.io/badge/Chrome%20MV3-1.4.6-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome MV3" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge-4ADE80?style=for-the-badge" alt="Platform" />
</p>

<p align="center">
  <a href="#-功能特性">功能特性</a> •
  <a href="#-安装方法">安装方法</a> •
  <a href="#-使用指南">使用指南</a> •
  <a href="#-项目结构">项目结构</a> •
  <a href="#-更新日志">更新日志</a>
</p>

---

## ✨ 功能特性

| 模块 | 说明 |
| --- | --- |
| 🧩 **多 Profile 管理** | 按项目 / 站点隔离字段与预设，切换自如 |
| 📦 **预设填充** | 一键将预设数据填充到当前页面表单 |
| 🎯 **实时元素拾取** | 鼠标悬停 + 空格确认，自动生成 CSS 选择器 |
| 🤖 **自动化流程** | 配置点击、填充、等待、等待元素等步骤序列 |
| 📝 **智能解析** | 从文本中自动识别字段名与值，快速生成预设 |
| 🌙 **暗黑模式** | 支持浅色 / 深色 / 跟随系统 |
| ⚡ **快捷键 & 右键菜单** | `Ctrl + Shift + F` 快速填充，右键一键执行 |
| 🔄 **导入导出** | 全量备份、单 Profile 导出、JSON 迁移 |
| 🧲 **右侧悬浮球** | 页面内快捷填充入口，支持拖拽与预设面板 |

---

## 🚀 安装方法

### 方法一：Edge 扩展商店（推荐）

<a href="https://microsoftedge.microsoft.com/addons/detail/%E5%AD%97%E6%AE%B5%E5%A1%AB%E5%85%85/aekjpmdkkenfoclhkmmjjchnebfaopej?hl=zh-CN">
  <img src="https://img.shields.io/badge/前往%20Edge%20Add--ons-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white" alt="前往 Edge Add-ons" />
</a>

### 方法二：Chrome Web Store

> 待发布，敬请期待。

### 方法三：手动安装（开发者模式）

1. 下载本仓库 `ZIP` 并解压，或 `git clone` 到本地
2. 打开 Chrome / Edge，访问 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目根目录即可

---

## 📖 使用指南

### 快速开始

1. **配置字段**：切换到「字段配置」标签 → 点击 🎯 拾取 → 悬停目标字段并按空格确认
2. **创建预设**：切换到「预设填充」标签 → 点击右上角 ＋ → 填写字段值并保存
3. **执行填充**：选择预设后点击 ✨ 填充，或按 `Ctrl + Shift + F` 使用全局默认预设
4. **自动填充**：在预设详情中开启「自动填充」，配置 URL 匹配规则即可

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + Shift + F` | 使用全局默认预设填充当前页面 |
| `Space` | 拾取模式下确认选中元素 |
| `Esc` | 取消拾取 |

### 右键菜单

在页面空白处右键，选择「字段填充」即可使用全局默认预设填充当前页面。

---

## 🏗️ 项目结构

```text
field-fill/
├── icons/                  # 扩展图标（16 / 48 / 128）
├── background.js           # Service Worker：热键、右键菜单、消息路由
├── content.js              # 内容脚本：填充、拾取器、悬浮球、自动填充
├── content.css             # 页面注入样式（Toast、拾取高亮）
├── popup.html              # Popup 页面 UI
├── popup.js                # Popup 逻辑与状态管理
├── manifest.json           # MV3 扩展清单
└── README.md               # 项目说明
```

---

## 🛠️ 技术栈

- **前端**：原生 JavaScript + HTML5 + CSS3（无构建工具）
- **扩展框架**：Chrome Extension Manifest V3
- **存储**：Chrome Storage API
- **通信**：Chrome Runtime Messages
- **设计**：Apple Human Interface 风格，卡片式布局，统一圆角与阴影

---

## 📝 更新日志

### v1.4.6 (2026-07-20)

- ✨ **流程步骤支持拖拽排序**：自动化 Tab 中每个步骤左侧新增 `⋮⋮` 手柄，可上下拖动调整执行顺序
- 🐛 **修复 SVG / 内层元素拾取失败**：元素拾取时自动向上查找 `button / a / summary / [role="button"]` 等可点击父元素
- 🐛 **修复运行流程提示“流程无步骤”**：popup 与 content.js 的消息字段统一为 `flow.steps`
- 🐛 **修复运行流程连接错误**：运行前先 `ensureContentScript`，未注入时自动注入 content.js
- ⭐ **支持设置默认自动化流程**：流程卡片右上角新增默认按钮，右侧 Dock 主键优先执行默认流程
- 🔖 **统一版本号**：所有文件版本号统一为 `1.4.6`

### v1.4.5 (2026-07-19)

- 🐛 **修复自动化拾取结果丢失**：拾取前先自动保存流程，popup 重启后可正确回填选择器
- 🐛 **修复拾取竞态问题**：`pickerHover` 与 `pickerEnd` 之间增加确认机制，避免结果提前清理
- 🔧 **优化结果恢复逻辑**：改为轮询等待 DOM 就绪后回填，提升稳定性
- 🔖 **统一版本号**：所有文件版本号统一为 `1.4.5`

### v1.4.4 (2026-05-20)

- 🐛 修复跳转填充 bug：多预设同 URL 点击第二个跳转却填充第一个
- 🔧 改为混合模式：popup 开 tab + background 等加载后 fillDirect

### v1.4.3 (2026-05-13)

- 🐛 修复 SPA 路由跳转后自动填充失效
- 🐛 修复首次打开/刷新时自动填充行为不一致
- 🐛 修复手动填充后自动填充重复覆盖数据
- 🔧 优化跳转填充机制

---

## 📄 许可证

[MIT License](./LICENSE)

---

## 👨‍💻 作者

洛 (Luo)

## 📞 反馈与建议

如有 Bug 或新功能需求，欢迎到 [GitHub Issues](https://github.com/Luogoddes/field-fill/issues) 提出。

<p align="center">
  如果这个项目帮到了你，欢迎给一颗 ⭐
</p>
