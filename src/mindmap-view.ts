import {Dialog} from "siyuan";
import MindMap from "simple-mind-map";
import {IMindMapNode} from "./block-tree";

/**
 * Phase 2：simple-mind-map 模态框渲染（替换 Phase 1 的文本树验证对话框）。
 *
 * 节点元数据（data.blockId / data.blockType）保留在 simple-mind-map 节点
 * 的 data 字段中，随导图操作被携带，供 Phase 3 保存时映射回文档块。
 */
export function showMindMapView(root: IMindMapNode): void {
    let mindMap: MindMap | null = null;

    const dialog = new Dialog({
        title: "思维导图",
        content: `
            <div class="md2mindmap__toolbar">
                <span class="md2mindmap__hint">双击节点编辑文本</span>
                <span class="fn__flex-1"></span>
                <button class="b3-button b3-button--outline md2mindmap__btn" id="md2mindmap-fit">适应视图</button>
                <button class="b3-button b3-button--outline md2mindmap__btn" id="md2mindmap-save">保存到文档（Phase 3）</button>
            </div>
            <div id="md2mindmap-canvas" class="md2mindmap__canvas"></div>
        `,
        width: "900px",
        height: "600px",
        destroyCallback: () => {
            if (mindMap) {
                mindMap.destroy();
                mindMap = null;
            }
        },
    });

    const canvas = dialog.element.querySelector<HTMLElement>("#md2mindmap-canvas");
    if (!canvas) {
        dialog.destroy();
        return;
    }

    try {
        mindMap = new MindMap({
            el: canvas,
            data: root,
            fit: true,
            layout: "logicalStructure",
            theme: "default",
        });
    } catch (e) {
        console.error("[MdToMindmap] simple-mind-map 初始化失败:", e);
        dialog.destroy();
        return;
    }

    // 工具栏
    const fitBtn = dialog.element.querySelector<HTMLButtonElement>("#md2mindmap-fit");
    fitBtn?.addEventListener("click", () => {
        mindMap?.view.fit();
    });
    const saveBtn = dialog.element.querySelector<HTMLButtonElement>("#md2mindmap-save");
    saveBtn?.addEventListener("click", () => {
        // Phase 3 实现：全量 diff 同步回文档
        window.alert("保存到文档功能将在 Phase 3 实现");
    });
}
