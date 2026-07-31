# MdToMindmap - 思源笔记文档思维导图

## 简介

MdToMindmap 是一款思源笔记插件，可将当前文档中的标题（`#`/`##`/`###`）和多层无序列表（`-`）渲染为可交互的思维导图。后续将支持在思维导图中直接编辑、增删节点，并通过"保存到文档"按钮将修改同步回思源文档，实现文档与思维导图之间的双向编辑，且不丢失标题/列表的格式层级。

## 功能特性

- ✅ `/mindmap` 斜杆命令一键打开思维导图
- ✅ 支持 h1-h6 标题层级结构（上限 h6，超出降级为列表项）
- ✅ 支持多层无序列表嵌套（与 api-func-test-case-generator 测试用例格式对齐）
- ✅ simple-mind-map 渲染：标题 + 列表正确呈现为思维导图（含嵌套子项）
- 🔲 思维导图中编辑节点文本，保存后更新对应文档块（Phase 3）
- 🔲 思维导图中新增/删除节点，保存后同步到文档（Phase 3）
- 🔲 保存策略：全量 diff（遍历导图节点，与映射表对比，执行增/删/改）（Phase 3）
- ✅ 渲染方式：直接 DOM 渲染（无需 iframe，性能更优）

## 转换范围约定（与测试用例 skill 对齐）

转换范围与 `api-func-test-case-generator` skill 的输出格式严格对齐：仅处理
**多级标题**和**多层无序列表**两种元素，其余块在思维导图中跳过、保存时原样保留。

| 元素 | 转换行为 |
|------|----------|
| 多级标题（h1-h6） | 转为导图节点，保留层级；超过 h6 的层级降级为列表项 |
| 多层无序列表（`-`） | 转为导图节点，保留嵌套层级 |
| 段落 / 表格 / 代码块 / 有序列表 / 引用等 | 不进入导图；保存时原样保留，不参与 diff |

其他约定：

- 节点文本中的内联 Markdown（`**加粗**`、`` `代码` ``、链接等）以源码原样显示与回写，MVP 不渲染富文本（后续迭代支持）
- 手动编辑文档时请尽可能使用多级标题与无序列表，保持格式一致，避免结构错乱

## 局限（MVP 范围）

当前版本聚焦 MVP，以下功能暂不支持：

- ❌ 代码块、表格、图片等复杂块类型
- ❌ 非标题/列表块（段落、表格、代码块、有序列表、引用等）不进入导图，保存时原样保留
- ❌ 富文本渲染：导图节点中 `**加粗**` 等内联格式显示源码，不渲染
- ❌ 拖拽节点改变排序
- ❌ 实时同步（文档变更后导图不会自动刷新，需关闭重开）
- ❌ 移动端
- ❌ 导出为图片

## 开发进度

### Phase 1（脚手架与核心数据流）— ✅ 已完成

- [x] 项目初始化：修改 plugin.json、package.json，安装 simple-mind-map 0.14.0-fix.3 依赖
- [x] `api.ts` — 封装思源内核 API（getChildBlocks / getBlockInfo / updateBlock / insertBlock / deleteBlock）
- [x] `block-tree.ts` — DOM 遍历提取标题（h1-h6）与列表项（li）层级结构，其他块跳过
- [x] 注册 `/mindmap` 斜杆命令

### Phase 2（文档→导图渲染）— ✅ 已完成

- [x] 修复 `NodeListItem` 文本提取：正文从子 `NodeParagraph` 提取（真实 DOM 中列表项自身无文本）
- [x] 修复标题层级塌平：思源 wysiwyg DOM 中标题与列表为**兄弟平级**，用标题栈算法重建章节归属
- [x] `mindmap-view.ts` — 模态框浮层 UI，初始化 simple-mind-map 实例（替换文本验证对话框）
- [x] `simple-mind-map.d.ts` — 补充最小类型声明（包发布物无 types 目录）
- [x] 集成验证：`scripts/verify-block-tree.mjs` 18 项断言全过（假 DOM 对齐真实平铺结构）

### Phase 3（导图→文档同步）— 🔲 待开发

- [ ] 编辑节点文本 → updateBlock
- [ ] 新增子节点/兄弟节点 → insertBlock（上下文类型继承规则）
- [ ] 删除节点 → deleteBlock
- [ ] "保存到文档"按钮：全量 diff 执行增删改
- [ ] 循环更新防护

### Phase 4（完善与发布）— 🔲 待开发

- [ ] 交互优化（加载提示、保存反馈、错误处理）
- [ ] 打包构建、发布 Release

## 架构与实现方法

### 1. 文档→导图渲染（block-tree.ts）

思源 Protyle 渲染后的 `protyle.wysiwyg.element` 即完整块树 DOM，直接遍历即可同时获得正确的顺序、结构和文本：

```
wysiwyg 根的直接子节点（⚠️ 平铺，NodeHeading 与 NodeList 是兄弟）：
  NodeHeading/h2 "1. 选择指定运营商"
  NodeHeading/h3 "1.1 一般调度策略"
  NodeList/u
    NodeListItem "目标运营商单线路"
      NodeParagraph "目标运营商单线路"   ← 列表项正文（自身无文本）
      NodeList/u "预期：..."             ← 嵌套列表（真实 DOM 嵌套）
        NodeListItem "预期：..."
```

两个关键事实（实测确认）：

1. **标题与列表平铺**：`NodeHeading` 与其后的 `NodeList` 在 DOM 中是兄弟平级，标题下的列表归属由**标题栈算法**重建（遍历时维护标题栈：hN 开启新章节、其后的 NodeList 挂到当前栈顶标题下）。
2. **列表项正文在子 NodeParagraph**：`NodeListItem` 自身的 textContent 是所有子块文本的拼接，不可直接用；正文必须从子 `NodeParagraph` 提取。

> 为什么不用 SQL/getChildBlocks：blocks 表索引不完整（缺嵌套列表块），parent_id 链断裂；getChildBlocks 返回层级与真实嵌套不符。DOM 遍历为唯一权威结构。

### 2. 导图渲染（mindmap-view.ts）

- 模态框浮层：工具栏（适应视图 / 保存到文档）+ 画布容器
- 初始化 `new MindMap({el, data, fit: true, layout: "logicalStructure"})`
- 节点元数据 `data.blockId` / `data.blockType` 保留在 simple-mind-map 节点中，供 Phase 3 保存时映射回文档块

### 3. 新增节点类型判定（标题 vs 列表）— Phase 3 用

节点类型由其上下文决定，规则如下（优先级从高到低）：

1. **有同级节点** → 取同级节点的 blockType
2. **无同级有父节点** → 看父节点的子节点：
   - 有子节点 → 取最后一个子节点的 blockType
   - 无子节点 → 父节点是标题则默认 li，父节点是 li 则 li，父节点是文档根则 h1
3. **标题类型且是子节点** → 自动降级一级（h1→h2，h2→h3，...）
4. **超过 h6** → 降级为 li

> 对比现有插件（如 simplemindmap 将所有标题转列表），本方案能保留原始格式类型。

### 4. 导图→文档同步（全量 diff）— Phase 3 规划

```typescript
function syncToDocument(mindmapRoot, mapping) {
    // 1. 遍历导图所有节点，收集当前节点列表
    const currentNodes = flatten(mindmapRoot)

    // 2. 对比上次的映射表
    for each node in currentNodes:
        if node.blockId exists && text changed → updateBlock(node.blockId, node.text)
        if !node.blockId (新增节点) → insertBlock / appendBlock → 获取新 blockId 更新映射

    // 3. 检测删除
    for each entry in mapping:
        if entry.blockId not in currentNodes → deleteBlock(blockId)

    // 4. 更新映射表
    saveMapping(newMapping)
}
```

### 5. 保存按钮 vs 实时同步

MVP 采用"显式保存"而非实时同步：

- 用户编辑思维导图后，点击右上角"保存到文档"按钮
- 插件执行全量 diff，批量调用思源 API
- 保存完成后提示"保存成功，共更新 X 个节点"
- 文档变更后，导图不会自动刷新（用户关闭重开即可加载最新内容）

## 技术栈

| 组件 | 选型 |
|------|------|
| 思维导图引擎 | simple-mind-map（npm） |
| 插件框架 | 思源 Plugin API（TypeScript） |
| 构建工具 | Webpack 5 |
| 渲染方式 | 直接 DOM 渲染（非 iframe） |

## 开发环境

```bash
pnpm dev          # 开发模式（产物输出到项目根目录，符号链接指向开发目录）
pnpm build        # 生产构建（产物在 dist/，发布用）
node scripts/verify-block-tree.mjs   # 逻辑层验证（无需思源）
npx tsc --noEmit  # 类型检查（siyuan 包 constants.ts 的报错为模板遗留，可忽略）
```

Windows 开发：插件目录通过**目录符号链接（SYMLINKD）**指向开发目录根，
如 `mklink /D "F:\Notes\SiYuanNotes\data\plugins\MdToMindmap" "D:\code\codes\MdToMindmap"`。
注意：思源集市"已下载"页面**不识别 JUNCTION**，必须使用 SYMLINKD 才能在集市中
看到并开关插件。构建请用 `pnpm dev`（产物在根目录）；`pnpm build` 产物在 dist/。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)
