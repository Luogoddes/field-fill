# AGENTS.md — 字段填充 (Universal Field Filler)

## 项目概述

**字段填充** 是一个 Chrome/Edge 浏览器扩展（Manifest V3），用于自动/手动填充网页表单字段。主要使用场景为 Redmine Bug 填写等业务表单系统。

## 技术栈

- **前端**：原生 JavaScript + HTML5 + CSS3（无构建工具）
- **存储**：Chrome Storage API (`chrome.storage.local`)
- **通信**：Chrome Runtime Messages (`chrome.runtime.sendMessage` / `onMessage`)
- **扩展框架**：Manifest V3 Service Worker

## 目录结构

```
field-fill/
├── manifest.json       # 扩展清单 (MV3, permissions, content_scripts, commands)
├── background.js       # Service Worker: 热键、右键菜单、存储管理、消息路由
├── content.js          # 内容脚本: 自动填充、手动填充(fillDirect)、字段拾取器
├── content.css         # Toast 通知样式 (注入页面)
├── popup.html          # 弹出页面 (Profile/Preset 管理 UI)
├── popup.js            # 弹出页面逻辑: 状态管理、UI 渲染、填充触发
├── README.md           # 用户文档
└── icons/              # 扩展图标 (16/48/128)
```

## 核心文件说明

### manifest.json
- `manifest_version: 3`
- `permissions`: storage, activeTab, scripting, contextMenus
- `host_permissions`: <all_urls>
- `content_scripts`: content.js + content.css, `run_at: document_idle`
- `commands`: Ctrl+Shift+F → quick-fill
- `background.service_worker`: background.js

### background.js — Service Worker
**职责**：
1. **DEFAULT_PROFILE**: Redmine 默认 Profile 定义
2. **doFillActiveProfile(tabId)**: 热键/右键菜单触发填充 → 读取激活 Profile 的默认 Preset → 注入 content.js → 发送 fillDirect 消息
3. **setupContextMenu()**: 注册/重建右键菜单（纯文字，无 emoji）
4. **Message Router**: 处理 popup ↔ background ↔ content 通信
   - `pickerHover` / `pickerEnd`: 拾取器实时悬停信息
   - `rebuildMenu`: 重建右键菜单
   - `checkUpdate`: 返回版本号
   - `getProfiles` / `saveProfiles`: Profile 读写
   - `getTheme` / `saveTheme`: 主题读写
5. **Data Migration**: `migrateData()` 将旧格式 (fieldConfig/presets/currentConfig) 迁移到新 Profile 格式

### content.js — 内容脚本（注入到每个页面）
**职责**：
1. **样式注入**: Toast 样式 + 拾取器高亮样式（idempotent, `__uff_style__` 检查）
2. **Toast 通知**: `showToast(msg, type)`, `showAutoToast(msg, type)`
3. **选择器生成**: `getSel(el)`, `getElType(el)`, `getLabel(el)`
4. **核心填充 `doFill(config, fieldMap)`**: 遍历 fieldMap，用 setter 设置 value，触发 input/change 事件
5. **拾取器**: `startPicker()` / `stopPicker()` — 鼠标悬停高亮 + 发送 `pickerHover` 到 background
6. **Message Listener**:
   - `fillDirect`: 从 popup/background 接收数据直接填充
   - `fillFields`: 通过存储查找 Profile/Preset 后填充（旧路径）
   - `startPicker` / `stopPicker`: 拾取器控制
7. **自动填充 `initAutoFill()` (IIFE)**: 
   - 页面级状态: `hasFilledInPage`(内存) + `localStorage.__uff_auto_fill_*`(持久化,5秒过期)
   - URL 匹配: exact/contains/prefix/suffix/regex
   - 按延迟分组，`setTimeout` 后执行填充
   - 触发条件: `preset.autoFill.enabled === true` 且有活跃规则

### popup.js — 弹出页面逻辑
**职责**：
1. **State**: profiles, activeProfileId, currentPanel, pickerActive 等
2. **Storage**: `loadAll()`, `saveProfiles()`, `saveTheme()`, `checkAndCleanStorage()`
3. **Fill 触发**:
   - `fillWithData(profile, data)`: 向当前 tab 发送 fillDirect 消息
   - `fillWithPreset(profile, presetId)`: 根据 Preset ID 填充
4. **Presets Panel**: 显示所有 Profile 的 Preset, 全局默认管理, 搜索过滤, 展开详情
5. **Preset Detail**: 编辑/文本双视图, 保存/填充/设为默认/复制/删除
6. **Fields Panel**: Profile 管理, 添加字段, 拾取器触发, 批量扫描
7. **IO Panel**: 导入导出, 存储管理, 右键菜单开关

### popup.html
- 约 69KB 的单文件 HTML
- 包含完整 UI: 顶部导航、Presets Panel、Fields Panel、IO Panel、Toast

## 数据流

### 手动填充流程
```
popup.js: fillWithData(profile, data)
  → chrome.tabs.sendMessage(tabId, {action:'fillDirect', config:data, fieldMap})
  → content.js: onMessage → doFill(config, fieldMap)
  → 遍历 fieldMap → 查找 selector → 设置 value → dispatchEvent(input/change)
```

### 自动填充流程
```
content.js: initAutoFill() IIFE
  → run() 读取 chrome.storage.local profiles
  → 遍历所有 Profile 的所有 Preset
  → 检查 preset.autoFill.enabled 和规则 URL 匹配
  → 按延迟分组，setTimeout 后执行
  → autoFill(config, fieldMap, overwrite)
  → Toast 通知结果
```

### 热键/右键菜单填充流程
```
background.js: doFillActiveProfile(tabId)
  → 读取存储中的 profiles，找激活 Profile 的默认 Preset
  → chrome.tabs.sendMessage(tabId, {action:'fillDirect', config, fieldMap})
  → content.js: fillDirect handler → doFill()
```

## 配置系统说明

### Profile 结构
```js
{
  id: 'profile-xxx', name: '名称', isActive: true/false,
  tags: ['标签'],
  fields: [{ id, name, selector, type:'text'|'select'|'textarea', fullWidth:0|1 }],
  presets: [{ id, name, tags, data:{ fieldId: value }, isDefault, autoFill, createdAt }]
}
```

### autoFill 配置
```js
{
  enabled: true/false,
  rules: [{ mode:'contains'|'exact'|'prefix'|'suffix'|'regex', url, delay, active }],
  delay: 800,        // 全局延迟(ms)
  overwrite: true,   // 是否覆盖已有值
  jumpFill: { enabled: true/false, url }
}
```

### 存储键
- `profiles`: Profile 数组（核心数据）
- `theme`: 'auto' | 'light' | 'dark'
- `contextMenuEnabled`: boolean
- `__pickerHover`: 拾取器临时数据 { selector, type, label, ts }

## 已知注意事项与约束

1. **content.js 双重注入**: `doFillActiveProfile` 在 background.js 中会再次 `executeScript` 注入 content.js，content script manifest 声明的也会注入。通过 `window.__uffContentLoaded` 防止重复初始化。
2. **Service Worker 生命周期**: background.js 可能随时被终止，需通过 `onInstalled` + `onStartup` 双重注册右键菜单。
3. **Storage 容量**: 约 5MB 限制，`checkAndCleanStorage()` 在 80% 时清理。
4. **localStorage 限制**: 在 content script 中可用，用于跨刷新保持自动填充状态。
5. **选择器转义**: `CSS.escape()` 用于 id 选择器（try/catch 兼容旧浏览器）。
6. **事件触发**: 填充后必须触发 `input` 和 `change` 事件（bubbles:true），否则前端框架可能不响应。
7. **SPA 兼容**: 当前不支持（Bug A 待修复）。
