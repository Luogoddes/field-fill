# 技术架构文档：Chrome Extension Floating Dock

## 1. 架构设计
前端单页应用（用于演示与开发调试），核心组件可打包为 Chrome Extension content script 注入任意网页。

## 2. 技术栈
- 框架：React 18 + TypeScript
- 构建：Vite
- 样式：Tailwind CSS
- 动画：Framer Motion
- 图标：Lucide React

## 3. 项目结构
```
dock-demo/
├── src/
│   ├── components/
│   │   ├── FloatingDock.tsx    # 悬浮 Dock 容器
│   │   ├── DockItem.tsx        # 单个按钮
│   │   ├── LogoButton.tsx      # Logo/展开收起按钮
│   │   └── Tooltip.tsx         # 可选工具提示
│   ├── hooks/
│   │   └── useDockPosition.ts  # 拖拽与位置缓存
│   ├── styles/
│   │   └── tokens.ts           # 设计 Token
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── tailwind.config.js
└── package.json
```

## 4. 关键实现点
- **拖拽逻辑**：在 FloatingDock 上监听 `mousedown`/`touchstart`，计算鼠标偏移，通过 `requestAnimationFrame` 更新 `top` 位置。
- **边界限制**：使用 `Math.max/min` 限制 Dock 不超出视口。
- **自动吸附**：释放时若距离左侧小于阈值，自动吸附到 `left: 20px`。
- **位置缓存**：使用 `localStorage.setItem('uff-dock-position', topPercent)` 持久化。
- **展开/收起**：Framer Motion `animate` 控制 Dock 宽度与按钮透明度。
- **Hover 动画**：Framer Motion `whileHover={{ scale: 1.02 }}`。

## 5. 扩展集成
演示完成后，组件可直接嵌入 Chrome Extension 的 `content_scripts`，通过 `shadow DOM` 隔离样式。
