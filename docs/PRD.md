# 产品需求文档：Chrome Extension Floating Dock

## 1. 产品概述
为 Chrome 扩展开发一个可固定于网页左侧的悬浮 Dock，采用极简、AI 产品风格设计语言，提供快速入口、可拖拽定位、自动吸附与位置缓存能力，提升用户在任意网页中的操作效率。

目标用户：使用 Chrome 扩展进行阅读、AI 辅助、效率办公的用户。

## 2. 核心功能

### 2.1 功能模块
1. **悬浮 Dock**：固定在网页左侧，宽度 64px，垂直居中，圆角 999px，白色背景，柔和阴影。
2. **功能入口**：Logo、主页、AI、历史、设置五个入口按钮。
3. **拖拽定位**：支持鼠标拖动 Dock，自动吸附到左侧边缘，位置缓存到 localStorage。
4. **展开/收起**：点击 Logo 可展开/收起 Dock，hover 提供微动画反馈。

### 2.2 页面/组件设计
| 组件 | 功能描述 |
|------|---------|
| FloatingDock | 悬浮容器，管理位置、展开/收起、拖拽 |
| DockItem | 单个 Dock 按钮，处理 hover、active、点击 |
| LogoButton | 品牌入口，同时作为展开/收起触发器 |
| useDockPosition | 自定义 Hook，处理拖拽逻辑与 localStorage 缓存 |

## 3. 核心流程
用户打开网页 → Dock 从左侧滑入 → hover 按钮微放大 → 拖动 Dock 调整垂直位置 → 松开后自动吸附左侧 → 位置写入 localStorage → 刷新页面后恢复位置 → 点击 Logo 展开/收起 → 点击功能按钮触发对应面板。

## 4. 用户界面设计

### 4.1 设计风格
- 极简、苹果 Human Interface、Notion + Raycast + Read Frog 风格
- 大面积留白，圆角统一 16px（Dock 999px 药丸形）
- 卡片悬浮、柔和阴影、轻拟物、高级感、AI 产品风格
- 所有动画 200ms ease，hover scale(1.02)
- 禁止 Material / Ant Design / Element Plus / 后台管理风格

### 4.2 颜色规范
- 背景：`#FFFFFF`
- 一级背景：`#F8F8F8`
- Hover：`#F3F3F3`
- 边框：`rgba(0,0,0,0.06)`
- 一级文字：`#111111`
- 二级文字：`#666666`
- 三级文字：`#999999`
- 品牌色：`#4ADE80`
- 危险色：`#EF4444`

### 4.3 组件规范
- Dock 宽度 64px，padding 8px，gap 16px
- 按钮 48×48px，圆角 12px（Logo 可品牌化）
- hover 背景 `#F3F3F3`，active 状态显示绿色圆点指示器
- 弹窗阴影：`0 8px 40px rgba(0,0,0,.12)`
- Dock 阴影：`0 10px 40px rgba(0,0,0,.12)`

### 4.4 响应式
桌面优先。Dock 始终固定左侧，拖拽范围限制在可视窗口内。
