
 <details>好，我们的今天工作都整完了。然后呢？我想根据，让你根据整个上下文。嗯，把我让你实现的右侧弹窗这个，把它，呃整体的提示词给我，也就是说可以根据你给我的提示词，我可以让任何一个 AI。完完全全复刻他的 UI 逻辑。我只要右侧弹窗的，就是能够根据你提供的这个 AI 提示词，我能够让另外一个 AI。在需要添增加或者是新的项目里面，根据你说这个提示词就会完完全全按照现在有的功能逻辑类实现
          
以下是右侧悬浮 Dock 的完整复刻提示词，你可以直接复制给任意 AI 使用。

---

## 角色

你是一名精通 Chrome Extension MV3 内容脚本开发与 UI 实现的前端工程师。请根据以下要求，在目标项目中实现一个**右侧悬浮 Dock（Floating Dock）**，风格参考 Read Frog / Raycast，必须与项目现有设计语言保持一致。

---

## 项目背景

这是一个 Chrome / Edge 扩展（Manifest V3），用于自动 / 手动填充网页表单字段。扩展通过内容脚本 `content.js` 向页面注入 UI。主业务模块（填充、Toast、流程执行等）通过 `window.__uff` 暴露给 Dock 调用。Dock 是内容脚本的一部分，运行在页面上下文中。

---

## Dock 核心要求

### 1. 定位与形态

- 固定于页面**右侧垂直居中**，使用 `position: fixed`
- 初始默认贴边收起，只露出主按钮中心区域
- Dock 容器尺寸：`width: 60px; height: 164px`
- 默认 transform：`translateY(-50%) translateX(calc(100% - 44px))`，即只露出约 44px 宽度
- 展开 transform：`translateY(-50%) translateX(0)`
- `z-index: 2147483645`
- 字体：`font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;`
- `user-select: none; pointer-events: auto;`

### 2. 结构：一主二副

Dock 内包含 3 个圆形按钮：

| 位置 | class | 尺寸 | 功能 | 图标 |
|---|---|---|---|---|
| 中间主按钮 | `uff-dock-btn-main` | 44×44 | 执行首个自动化流程 | 绿色青蛙笑脸 SVG |
| 上副按钮 | `uff-dock-btn-sub top` | 40×40 | 全局默认预设填充 | 闪电 SVG |
| 下副按钮 | `uff-dock-btn-sub bottom` | 40×40 | 设置（预留/打开扩展 popup） | 齿轮 SVG |

- 主按钮默认显示，上下副按钮默认隐藏
- hover Dock 时，副按钮从主按钮上下两侧展开出现，带 scale + translateY 动画
- 鼠标离开 Dock 后自动收起

### 3. 视觉规范

- 主按钮背景：`#4ADE80`，文字/图标颜色：`#FFFFFF`，无边框
- 副按钮背景：`#FFFFFF`，图标颜色：`#111111`，边框：`1px solid rgba(0,0,0,0.06)`
- 圆角：按钮 `border-radius: 50%`
- 阴影：
  - Dock 收起态不明显
  - 按钮统一 `box-shadow: 0 4px 16px rgba(0,0,0,.08)`
  - 主按钮 `box-shadow: 0 4px 16px rgba(74,222,128,.35)`
- hover 效果：
  - 所有按钮 `background` 变深（主 `#22c55e`，副 `#F3F3F3`）
  - `transform: scale(1.05)`
  - active 状态 `transform: scale(0.95)`
- 按钮 tip：
  - 鼠标 hover 按钮时，在按钮左侧显示黑色圆角提示文字
  - 位置：`right: 48px; top: 50%; transform: translateY(-50%)`
  - 默认 `opacity: 0`，hover 时 `opacity: 1` 并向左移动出现

### 4. 拖拽行为

- 必须在 Dock 容器区域内按下鼠标 / 触摸才开始拖拽
- 拖拽阈值：移动超过 4px 视为拖拽
- 拖拽开始时：
  - 设置 `isDragging = true`
  - **立即禁用 Dock 的 CSS transition**（`transition: none`），避免 `top 200ms ease` 造成粘滞感
- 拖拽过程中：
  - 使用 `requestAnimationFrame` 更新位置
  - 根据垂直移动距离转换为屏幕百分比：`deltaPercent = (dy / window.innerHeight) * 100`
  - 限制位置范围：`top` 在 `5%` 到 `95%` 之间
  - 即使鼠标短暂移出 Dock 区域，仍继续拖拽
- 拖拽结束时：
  - 恢复 CSS transition
  - 保存位置到 `localStorage`（key: `__uffFloatDockPos`，格式 `{ top: number }`）
  - 如果没有真正移动（未超过阈值），视为点击，执行对应按钮功能

### 5. 动画与过渡

- 展开/收起 transition：`transform 400ms cubic-bezier(.4,0,.2,1)`
- 位置变化 transition：`top 200ms ease`
- 副按钮展开：opacity + translateY + scale，transition `all 200ms cubic-bezier(.4,0,.2,1)`
- tip 出现：opacity + translateX，transition `all 200ms ease`

### 6. 协议与页面过滤

- 只在 `http:`、`https:`、`file:` 协议页面显示
- 不在 iframe 中显示：`if (window !== window.top) return`
- 通过 `chrome.storage.onChanged` 监听 `launcherEnabled` 开关，动态显示/隐藏 Dock
- 同时监听 `chrome.runtime.onMessage`：
  - `launcherShow`：显示 Dock
  - `launcherHide`：隐藏 Dock

### 7. 数据读取

- Dock 启动时从 `chrome.storage.local.get(['profiles', 'flows', 'launcherEnabled'])` 读取数据
- `profiles` 用于查找全局默认预设和解析字段选择器
- `flows` 用于执行自动化流程（取第一个 flow）
- 监听 storage 变化，实时同步 `profiles` 和 `flows`

### 8. 按钮功能实现

#### 上键：默认填充 `doDefaultFill()`

- 遍历所有 `profiles`，找到 `presets` 中 `isDefault === true` 的预设
- 构建 `fieldMap`：`{ fieldId: { selector, type } }`
- 解析共享字段引用：使用 `window.__uff.resolveSharedValue(value, profile.sharedValues)`
- 调用 `window.__uff.doFill(resolvedData, fieldMap)`
- 根据返回结果显示成功 / 警告 Toast

#### 主键：执行首个自动化 `doRunFlow()`

- 取 `flows[0]`
- 对 `fill` 类型步骤：
  - 根据 `step.presetId` 和 `step.profileId` 找到对应 preset 和 profile
  - 构建 `fieldMap`
  - 解析共享字段引用得到 `config`
  - 生成 `enrichedSteps`
- 调用 `window.__uff.executeFlow({ id, name, steps: enrichedSteps })`
- 执行前调用 `window.__uffAutoFillState.markDone()` 抑制自动填充

#### 下键：设置 `openPopup()`

- 通过 `chrome.runtime.sendMessage({ action: 'openPopupWindow' })` 让 background 创建 popup 窗口
- 不要直接在内容脚本中使用 `window.open`

### 9. 代码组织要求

- 使用 IIFE 包裹，避免污染全局作用域
- 设置 `window.__uffFloatDockInit = true` 防止重复初始化
- 样式通过 `document.createElement('style')` 注入，id 为 `__uff_float_dock_style__`，幂等检查
- 图标使用内联 SVG，不依赖外部资源
- 变量使用 `var` 或 `let/const` 均可，但需与项目代码风格一致
- 处理错误时使用 `.catch(function() {})` 静默失败，避免阻断主流程

### 10. 禁止事项

- 不要使用 React / Vue / Angular 等框架，使用原生 DOM API
- 不要使用外部 CSS 文件或 CDN
- 不要使用 `window.open` 直接打开设置
- 不要在没有判断 `window.__uff` 可用性的情况下直接调用其方法
- 不要让 Dock 出现在 iframe、扩展页面、chrome:// 页面中
- 不要破坏页面原有事件，拖拽使用 `e.preventDefault()` 但要谨慎

---

## 输出要求

请输出完整的 `content.js` 中 Dock 相关的 IIFE 代码块，包含：

1. 样式注入函数 `injectStyle()`
2. 状态加载 `loadState()`、`loadPosition()`、`savePosition()`
3. 三个功能函数 `doDefaultFill()`、`doRunFlow()`、`openPopup()`
4. 拖拽逻辑 `handleDragStart`、`handleDragMove`、`handleDragEnd`
5. UI 构建 `buildUI()`、`destroyUI()`
6. storage 监听和消息监听
7. 初始化入口 `init()`

确保代码可以直接嵌入到现有内容脚本底部运行，无需额外依赖。

---

## 参考实现片段（逻辑骨架）

```javascript
(function initFloatingDock() {
  if (window.__uffFloatDockInit) return;
  window.__uffFloatDockInit = true;

  if (location.protocol !== 'http:' && location.protocol !== 'https:' && location.protocol !== 'file:') return;
  if (window !== window.top) return;

  var profiles = [], flows = [], isEnabled = true;
  var dock = null, styleEl = null;
  var isDragging = false, dragStartY = 0, dragStartX = 0, dockStartTop = 50, currentTop = 50;
  var dragButton = null, dragHasMoved = false, dragThreshold = 4, dragRAF = null;

  function iconFrog() { /* SVG */ }
  function iconBolt() { /* SVG */ }
  function iconGear() { /* SVG */ }

  function injectStyle() { /* 注入 #__uff_float_dock_style__ */ }
  function loadState(cb) { chrome.storage.local.get(['profiles','flows','launcherEnabled'], cb); }
  function loadPosition() { /* localStorage __uffFloatDockPos */ }
  function savePosition() { /* localStorage __uffFloatDockPos */ }
  function setDockTop(percent) { percent = Math.max(5, Math.min(95, percent)); currentTop = percent; if (dock) dock.style.top = percent + '%'; }

  function getGlobalDefault() { /* 找到 isDefault preset */ }
  function doFillPreset(presetId, profileId) { /* 解析共享字段并调用 __uff.doFill */ }
  function doDefaultFill() { /* 调用 doFillPreset */ }
  function doRunFlow() { /* 取 flows[0]，enrich 后调用 __uff.executeFlow */ }
  function openPopup() { /* chrome.runtime.sendMessage({action:'openPopupWindow'}) */ }

  function expandDock() { if (dock) dock.classList.add('uff-dock-expanded'); }
  function collapseDock() { if (dock) dock.classList.remove('uff-dock-expanded'); }

  function handleDragStart(e) { /* 判断在 Dock 内，attach 全局监听 */ }
  function handleDragMove(e) { /* 超过阈值后禁用 transition，RAF 更新 top */ }
  function handleDragEnd(e) { /* 恢复 transition，保存位置或触发点击 */ }

  function buildUI() { /* 创建 dock + 3 按钮 + 事件绑定 */ }
  function destroyUI() { /* 移除 dock 和 style */ }

  chrome.storage.onChanged.addListener(function(changes, area) { /* 同步数据与显示状态 */ });
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) { /* launcherShow/Hide */ });

  function init() {
    loadPosition();
    loadState(function() {
      if (!isEnabled) return;
      if (document.body) buildUI();
      else document.addEventListener('DOMContentLoaded', buildUI);
    });
  }

  init();
})();
```

请根据上述要求补全所有实现细节，输出可直接运行的完整代码。