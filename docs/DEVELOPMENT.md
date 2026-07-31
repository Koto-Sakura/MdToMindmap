# 开发文档：文档 → 思维导图转换

> 更新日期：2026-07-31
> 状态：转换逻辑已实现，NodeListItem 文本提取缺陷已修复（从子 NodeParagraph 提取正文）

## 1. 项目目标

思源笔记插件：将当前文档的标题（h1-h6）与多层无序列表转换为可编辑思维导图，
支持导图 → 文档双向同步（保存时全量 diff）。

转换范围（与 api-func-test-case-generator skill 对齐）：
- 只转换：多级标题（h1-h6，上限 h6）+ 多层无序列表
- 跳过并保留：段落/表格/代码块/有序列表/引用等
- 富文本（加粗/代码/链接）：节点中显示 markdown 源码，后续迭代渲染

## 2. 当前架构

```
src/
├── index.ts        # 插件入口；/mindmap 斜杆命令回调
├── block-tree.ts   # 核心：wysiwyg DOM → IMindMapNode 树（标题栈章节重建）
├── mindmap-view.ts # Phase 2：simple-mind-map 模态框渲染（工具栏 + 实例管理）
├── api.ts          # 思源内核 API 封装（SQL/块操作，Phase 3 同步用）
└── kernel.ts       # 内核插件 demo（模板自带，与业务无关）

scripts/
├── mock-siyuan.mjs        # 测试用 siyuan 模块 mock
└── verify-block-tree.mjs  # 逻辑层验证（假 DOM → 断言）
```

数据结构（simple-mind-map 格式）：

```typescript
interface IMindMapNode {
    data: {
        text: string;          // 节点文本
        expand?: boolean;
        blockId?: string;      // 思源块 id（保存时映射回文档）
        blockType?: string;    // h1-h6 / li / root
    };
    children?: IMindMapNode[];
}
```

## 3. 关键事实：思源 wysiwyg DOM 块树结构（实测 + 官方确认）

思源 Protyle 渲染后的 `protyle.wysiwyg.element` 即完整块树 DOM：

| data-type | 含义 | 文本位置 |
|---|---|---|
| `NodeHeading` | 标题块 | **自身第一个 `contenteditable` 子元素**（官方 Quick Start 确认：`<div contenteditable="true">标题</div>`） |
| `NodeList` | 列表容器 | 无自身文本，仅作为容器 |
| `NodeListItem` | 列表项 | **正文在子 `NodeParagraph` 中**（实测 dump 确认：`NodeListItem st6lwr → NodeParagraph b369zj "目标运营商单线路"`） |
| `NodeParagraph` | 段落 | 第一个 `contenteditable` 子元素 |

`data-subtype`：标题为 `h1`-`h6`，列表/列表项为 `u`/`o`。

**注意**：`data-type` 是 `NodeHeading` 而非 `h`，`NodeListItem` 而非 `i` —— 与
blocks 表/API 的 type 命名完全不同。

### 真实 DOM 示例（实测 2026-07-31）

```
wysiwyg 根（protyle-wysiwyg）直接子节点（⚠️ 平铺，NodeHeading 与 NodeList 是兄弟）：
  NodeParagraph "/"                                ← 游离段落
  NodeHeading/h2 "1. 选择指定运营商"
  NodeHeading/h3 "1.1 一般调度策略"
  NodeList/u "目标运营商单线路"                      ← h3 的兄弟，章节归属需算法重建
    NodeListItem/u "目标运营商单线路"        ← 自身 textContent 为拼接文本
      NodeParagraph  "目标运营商单线路"       ← 真正的正文
      NodeList/u "预期：..."                  ← 嵌套列表（NodeListItem 内部嵌套是真实的）
        NodeListItem/u "预期：..."
          NodeParagraph "预期：..."
  NodeHeading/h3 "1.2 按带宽负载"                   ← 兄弟
  NodeList/u ...                                   ← 兄弟
  NodeHeading/h2 "2. 不选择运营商"                  ← 兄弟
  NodeList/u ...                                   ← 兄弟
```

**关键事实 1**：`NodeHeading` 与其后的 `NodeList` 在 DOM 中是**兄弟平级**，
标题下的列表归属需由算法重建（遍历时维护标题栈：hN 开启新章节、其后的
NodeList 挂到当前栈顶标题下）——不能依赖 DOM 嵌套。

**关键事实 2**：`NodeListItem` 自身的 textContent 是所有子块文本的拼接
（如 `"目标运营商单线路预期：当目标运营商仅有..."`），不可直接使用；
正文必须从**子 NodeParagraph** 提取。而 NodeListItem **内部**的嵌套
NodeList 是真实 DOM 嵌套，可直接递归。

## 4. 历次实现方案与失败根因（重要经验）

| # | 方案 | 现象 | 根因 |
|---|---|---|---|
| 1 | SQL 查 blocks 表 + `ORDER BY sort` | 顺序错乱、文本拼接 | `blocks.sort` 是**类型权重**（d=0/h=5/p=10/i/l=20），非文档顺序；i/l 的 content 是子树拼接 |
| 2 | `getChildBlocks` 递归 | h2/h3/root 三级重复 | `getChildBlocks` 返回的层级与 blocks 表 parent_id **不一致**（h3 与 l 平级返回） |
| 3 | SQL + parent_id 建树 + DOM 顺序排序 | 内容孤立到 root 级 | **blocks 表索引不完整**：64 块 vs DOM 78 块，14 个嵌套列表项/容器缺失，parent_id 悬空 |
| 4 | 纯 DOM 遍历（getBlockText 直取 li 自身文本） | 结构正确、**列表项文本全空** | `getBlockText` 移除子块后，NodeListItem 自身无文本（正文在子 NodeParagraph） |
| 5 | 纯 DOM 遍历（getListItemText 修复文本） | 文本正常、**层级塌平**（h3 的列表项跑到根级） | **NodeHeading 与 NodeList 是兄弟平级**，标题下的列表归属被丢失 |
| 6 | DOM 遍历 + 标题栈章节重建（当前） | 文本与层级均正确 | 已修复：遍历时维护标题栈，NodeList 挂到最近标题下 |

## 5. 正确的 DOM 遍历方案（已实施）

`block-tree.ts` 当前实现，两个关键点：

```
① 节点文本提取：
   NodeHeading   → getBlockText（自身 contenteditable 文本，子块被移除后保留）
   NodeListItem  → getListItemText：找第一个子 NodeParagraph 取其文本（⚠️ 关键）
   NodeList      → 不建节点，展开为子列表项
   NodeParagraph → 跳过（已被 NodeListItem 消费）

② 章节归属重建（标题栈算法）：
   遍历 wysiwyg 根的直接子块：
   - NodeHeading hN → 弹栈至最近层级 < N 的标题，挂到其下，自身入栈
   - NodeList       → 列表项挂到当前栈顶标题下（栈空则挂根）
   - NodeParagraph  → 跳过
   NodeListItem 内部的嵌套 NodeList 是真实 DOM 嵌套，走 ① 递归即可
```

### 验证脚本同步修正

`scripts/verify-block-tree.mjs` 的假 DOM 需对齐真实结构（已修正）：
- NodeListItem **不应**设 ownText（真实 DOM 中自身无文本），正文只在子 NodeParagraph
- **NodeHeading 与 NodeList 平铺为兄弟**（此前脚本把 NodeList 嵌套在标题下，
  与实际不符，导致验证通过但真实环境层级塌平）

## 6. 验证方法

```bash
pnpm dev          # 开发模式（产物输出到项目根目录，符号链接指向开发目录）
pnpm build        # 生产构建（产物在 dist/，发布用）
node scripts/verify-block-tree.mjs   # 逻辑层验证（无需思源）
npx tsc --noEmit  # 类型检查（siyuan 包 constants.ts 的报错为模板遗留，可忽略）
```

插件开发目录链接：`F:\Notes\SiYuanNotes\data\plugins\MdToMindmap`（junction → 开发目录根）。
**必须用 `pnpm dev` 构建**（产物在根目录）；`pnpm build` 产物在 dist/，需另建链接。

## 7. 后续工作（Phase 2/3）

- **Phase 2（已落地）**：NodeListItem 文本提取修复 + 标题栈章节重建 + simple-mind-map
  渲染（`mindmap-view.ts`，已替换文本验证对话框）。`simple-mind-map.d.ts` 为补充的
  最小类型声明（包发布物无 types 目录）
- **Phase 3（待开发）**：导图 → 文档同步（api.ts 的 updateBlock/insertBlock/deleteBlock + 全量 diff）
- 已确认：blocks 表 SQL 索引不完整（缺嵌套列表块），同步逻辑**不能依赖 SQL parent_id 重建树**，
  应使用 DOM 遍历结果作为唯一权威结构
