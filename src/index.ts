import {Plugin, showMessage, Protyle} from "siyuan";
import "./index.scss";
import {buildMindMapTreeFromDom} from "./block-tree";
import {showMindMapView} from "./mindmap-view";

/**
 * MdToMindmap - 思源笔记文档思维导图插件。
 *
 * 功能入口：/mindmap 斜杠命令。
 * 将当前文档的多级标题（h1-h6）与多层无序列表渲染为可编辑思维导图。
 */
export default class MdToMindmapPlugin extends Plugin {
    onload() {
        this.protyleSlash = [{
            filter: ["mindmap", "思维导图", "脑图"],
            html:
                `<div class="b3-list-item__first"><span class="b3-list-item__text">${this.i18n.mindmap}</span><span class="b3-list-item__meta">🧠</span></div>`,
            id: "mindmap",
            callback: async (protyle: Protyle) => {
                const docId = protyle.protyle.block.rootID;
                const wysiwygEl = protyle.protyle.wysiwyg?.element;
                if (!docId || !wysiwygEl) {
                    showMessage("无法获取当前文档或编辑器实例", 5000, "error");
                    return;
                }
                try {
                    // 直接遍历思源渲染 DOM（wysiwyg 块树）构建导图树：
                    // 标题（NodeHeading）与列表（NodeList）平铺为兄弟，
                    // 由 block-tree.ts 的标题栈算法重建章节归属
                    const tree = await buildMindMapTreeFromDom(wysiwygEl, docId);
                    showMindMapView(tree);
                } catch (e) {
                    showMessage(`[${this.name}] 构建思维导图树失败: ${(e as Error).message || e}`, 5000, "error");
                }
            },
        }];
    }
}
