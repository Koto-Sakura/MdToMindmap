[English](README.md)

# MdToMindmap - 思源笔记文档思维导图

## 简介

MdToMindmap 是一款思源笔记插件，可将当前文档中的标题（`#`/`##`/`###`）和多层无序列表（`-`）渲染为可交互的思维导图，支持在思维导图中直接编辑、增删节点，并通过"保存到文档"按钮将修改同步回思源文档。实现文档与思维导图之间的双向编辑，且不丢失标题/列表的格式层级。

## 功能特性

- `/mindmap` 斜杆命令一键打开思维导图
- 支持 h1-h6 标题层级结构
- 支持多层无序列表嵌套
- 思维导图中编辑节点文本，保存后更新对应文档块
- 思维导图中新增/删除节点，保存后同步到文档
- 保存策略：全量 diff（遍历导图节点，与映射表对比，执行增/删/改）
- 渲染方式：直接 DOM 渲染（无需 iframe，性能更优）
- 新增节点类型自动继承上下文（保留标题/列表格式，避免格式混乱）

## 局限（MVP 范围）

当前版本聚焦 MVP，以下功能暂不支持：

- ❌ 代码块、表格、图片等复杂块类型
- ❌ 拖拽节点改变排序
- ❌ 实时同步（文档变更后导图不会自动刷新，需关闭重开）
- ❌ 移动端
- ❌ 导出为图片

## 开发排期

### Phase 1（预估 4-6 天）— 脚手架与核心数据流

- [ ] 项目初始化：修改 plugin.json、package.json，添加 simple-mind-map 依赖
- [ ] `api.ts` — 封装思源内核 API（getChildBlocks、updateBlock、insertBlock、deleteBlock、appendBlock）
- [ ] `block-tree.ts` — 递归遍历文档块树，提取标题（h1-h6）和列表（li）的层级结构
- [ ] 注册 `/mindmap` 斜杆命令

### Phase 2（预估 5-7 天）— 文档→导图渲染

- [ ] `mindmap-bridge.ts` — 块树转 simple-mind-map 节点树，每个节点存储 `{ blockId, blockType }`
- [ ] `mindmap-view.ts` — 模态框浮层 UI，初始化 simple-mind-map 实例
- [ ] 集成测试：验证多级标题 + 嵌套列表的正确渲染

### Phase 3（预估 5-7 天）— 导图→文档同步

- [ ] 编辑节点文本 → updateBlock
- [ ] 新增子节点/兄弟节点 → insertBlock（上下文类型继承规则）
- [ ] 删除节点 → deleteBlock
- [ ] "保存到文档"按钮：全量 diff 执行增删改
- [ ] 循环更新防护

### Phase 4（预估 2-3 天）— 完善与发布

- [ ] 交互优化（加载提示、保存反馈、错误处理）
- [ ] 打包构建、发布 Release

**总共预估：16-23 天**

## 重点功能实现方法

### 1. 新增节点类型判定（标题 vs 列表）

节点类型由其上下文决定，规则如下（优先级从高到低）：

1. **有同级节点** → 取同级节点的 blockType
2. **无同级有父节点** → 看父节点的子节点：
   - 有子节点 → 取最后一个子节点的 blockType
   - 无子节点 → 父节点是标题则默认 li，父节点是 li 则 li，父节点是文档根则 h1
3. **标题类型且是子节点** → 自动降级一级（h1→h2，h2→h3，...）
4. **超过 h6** → 降级为 li

> 对比现有插件（如 simplemindmap 将所有标题转列表），本方案能保留原始格式类型。

### 2. 文档→导图渲染（block-tree.ts）

```typescript
// 伪代码流程
function buildBlockTree(docId: string): MindMapNode[] {
    const children = await getChildBlocks(docId)
    for each child in children:
        if child.type === 'h':   // 标题块
            node = { text: child.content, blockId: child.id, blockType: child.subType }
            node.children = buildBlockTree(child.id)  // 标题下有子块
        if child.type === 'l':   // 列表块
            node.children = parseListItems(child.id)  // 解析列表项
        // 跳过非标题非列表块
    return nodes
}
```

核心：递归调用 `getChildBlocks`，只提取 type 为 `h` 和 `l`/`i` 的块，其他块（p/c/b/t 等）跳过。

### 3. 导图→文档同步（全量 diff）

```typescript
// 伪代码流程
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

### 4. 保存按钮 vs 实时同步

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

请参考思源官方插件开发指南：https://github.com/siyuan-note/plugin-sample

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)