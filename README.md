[中文](README.zh-CN.md)

# MdToMindmap - SiYuan Note Document Mindmap

## Overview

MdToMindmap is a SiYuan Note plugin that renders headings (`#`/`##`/`###`) and multi-level unordered lists (`-`) from the current document into an interactive mindmap. It supports editing, adding, and deleting nodes directly in the mindmap, and syncs changes back to the SiYuan document via a "Save to Document" button. This enables bidirectional editing between the document and the mindmap while preserving the heading/list formatting hierarchy.

## Features

- `/mindmap` slash command to open the mindmap with one keystroke
- Supports h1-h6 heading hierarchy
- Supports multi-level nested unordered lists
- Edit node text in the mindmap, then save to update the corresponding document block
- Add/delete nodes in the mindmap, then sync to the document on save
- Save strategy: full diff — traverse mindmap nodes, compare with the mapping table, execute create/update/delete
- Rendering: direct DOM rendering (no iframe, better performance)
- New node type auto-inherits from context (preserves heading/list formatting, avoids format confusion)

## Limitations (MVP Scope)

The current version focuses on MVP. The following features are not yet supported:

- ❌ Complex block types (code blocks, tables, images, etc.)
- ❌ Drag-and-drop node reordering
- ❌ Real-time sync (mindmap won't auto-refresh when the document changes; close and reopen to reload)
- ❌ Mobile support
- ❌ Export to image

## Development Schedule

### Phase 1 (Estimated 4-6 days) — Scaffolding & Core Data Flow

- [ ] Project initialization: update plugin.json, package.json, add simple-mind-map dependency
- [ ] `api.ts` — Encapsulate SiYuan kernel API (getChildBlocks, updateBlock, insertBlock, deleteBlock, appendBlock)
- [ ] `block-tree.ts` — Recursively traverse the document block tree, extract heading (h1-h6) and list (li) hierarchy
- [ ] Register `/mindmap` slash command

### Phase 2 (Estimated 5-7 days) — Document → Mindmap Rendering

- [ ] `mindmap-bridge.ts` — Convert block tree to simple-mind-map node tree, each node stores `{ blockId, blockType }`
- [ ] `mindmap-view.ts` — Modal overlay UI, initialize simple-mind-map instance
- [ ] Integration test: verify correct rendering of multi-level headings + nested lists

### Phase 3 (Estimated 5-7 days) — Mindmap → Document Sync

- [ ] Edit node text → updateBlock
- [ ] Add child/sibling node → insertBlock (context type inheritance rules)
- [ ] Delete node → deleteBlock
- [ ] "Save to Document" button: full diff to execute create/update/delete
- [ ] Circular update prevention

### Phase 4 (Estimated 2-3 days) — Polish & Release

- [ ] Interaction optimization (loading indicators, save feedback, error handling)
- [ ] Build and package, release

**Total estimate: 16-23 days**

## Key Implementation Methods

### 1. New Node Type Determination (Heading vs List)

The node type is determined by its context, with the following rules (priority from high to low):

1. **Has sibling nodes** → use the sibling's blockType
2. **No sibling, has parent** → check the parent's children:
   - Has children → use the last child's blockType
   - No children → if parent is heading, default to li; if parent is li, use li; if parent is document root, use h1
3. **Heading type and is a child node** → auto-decrement one level (h1→h2, h2→h3, ...)
4. **Exceeds h6** → downgrade to li

> Unlike existing plugins (e.g., simplemindmap converts all headings to lists), this approach preserves the original formatting type.

### 2. Document → Mindmap Rendering (block-tree.ts)

```typescript
// Pseudocode
function buildBlockTree(docId: string): MindMapNode[] {
    const children = await getChildBlocks(docId)
    for each child in children:
        if child.type === 'h':   // heading
            node = { text: child.content, blockId: child.id, blockType: child.subType }
            node.children = buildBlockTree(child.id)  // heading may have child blocks
        if child.type === 'l':   // list
            node.children = parseListItems(child.id)  // parse list items
        // skip non-heading, non-list blocks
    return nodes
}
```

Core: recursively call `getChildBlocks`, only extract blocks of type `h` and `l`/`i`, skip others (p/c/b/t, etc.).

### 3. Mindmap → Document Sync (Full Diff)

```typescript
// Pseudocode
function syncToDocument(mindmapRoot, mapping) {
    // 1. Flatten the mindmap tree to collect all current nodes
    const currentNodes = flatten(mindmapRoot)
    
    // 2. Compare with the previous mapping table
    for each node in currentNodes:
        if node.blockId exists && text changed → updateBlock(node.blockId, node.text)
        if !node.blockId (new node) → insertBlock / appendBlock → get new blockId, update mapping
    
    // 3. Detect deletions
    for each entry in mapping:
        if entry.blockId not in currentNodes → deleteBlock(blockId)
    
    // 4. Save the updated mapping
    saveMapping(newMapping)
}
```

### 4. Save Button vs Real-time Sync

MVP uses an explicit "Save" approach rather than real-time sync:

- After editing the mindmap, the user clicks the "Save to Document" button in the top-right corner
- The plugin performs a full diff and calls the SiYuan API in batch
- Upon completion, prompts "Saved successfully, updated X nodes"
- The mindmap does not auto-refresh when the document changes (close and reopen to load the latest content)

## Tech Stack

| Component | Choice |
|-----------|--------|
| Mindmap engine | simple-mind-map (npm) |
| Plugin framework | SiYuan Plugin API (TypeScript) |
| Build tool | Webpack 5 |
| Rendering | Direct DOM rendering (no iframe) |

## Development Environment

Refer to the official SiYuan plugin development guide: https://github.com/siyuan-note/plugin-sample

## Changelog

See [CHANGELOG.md](CHANGELOG.md)