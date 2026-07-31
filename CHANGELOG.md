# Changelog

## v0.1.0 2026-07-31

* 项目初始化，基于思源笔记插件模板创建
* 确定 MVP 功能范围与开发排期，锁定转换范围约定（与 api-func-test-case-generator skill 格式对齐：仅多级标题 + 多层无序列表，其余块跳过并原样保留）
* 修正 package.json 元信息（name/main 笔误），安装 simple-mind-map 0.14.0-fix.3 依赖，验证模板构建通过
* 新增 `src/api.ts`：封装思源内核 API（getChildBlocks / getBlockInfo / updateBlock / insertBlock / deleteBlock）
* 新增 `src/block-tree.ts`：遍历思源 wysiwyg DOM 提取标题（h1-h6）与列表项（li）层级结构，其他块跳过
* 注册 `/mindmap` 斜杆命令（MVP 入口）

## v0.2.0 2026-07-31

### 文档→导图转换（Phase 1/2 完成）

* **修复 NodeListItem 文本提取缺陷**：思源真实 DOM 中列表项自身无文本，正文在子 NodeParagraph 中；
  新增 `getListItemText` 从子 NodeParagraph 提取，解决真实环境下列表项文本全空的问题
* **修复标题层级塌平**：实测确认思源 wysiwyg DOM 中 NodeHeading 与 NodeList 为**兄弟平级**（非父子嵌套）；
  block-tree.ts 重写为标题栈章节重建算法，列表项正确挂到所属标题下
* **集成 simple-mind-map 渲染**：新增 `mindmap-view.ts` 模态框浮层（工具栏 + 画布），
  `/mindmap` 由文本验证对话框升级为真实思维导图
* 新增 `simple-mind-map.d.ts`：补充最小类型声明（包发布物无 types 目录）
* **清理模板 demo 代码**：index.ts 从 1007 行精简至 38 行，删除 addTopBar/addDock/
  addTab/showDialog/kernel RPC demo 等全部模板演示代码；i18n 仅保留 mindmap 键
* **验证脚本对齐真实结构**：`scripts/verify-block-tree.mjs` 假 DOM 改为平铺结构
  （NodeListItem 无 ownText、NodeHeading 与 NodeList 平级），18 项断言全过

### 其他

* README 默认语言改为中文，删除 README.zh-CN.md，plugin.json readme 字段同步更新
