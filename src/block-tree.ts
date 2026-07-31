import {getBlockInfo} from "./api";

/**
 * 导图节点数据（simple-mind-map 数据结构）。
 * data 中除 text/expand 外的字段为自定义元数据，会随 simple-mind-map
 * 的操作被保留，用于保存时映射回文档块。
 */
export interface IMindMapNode {
    data: {
        text: string;
        expand?: boolean;
        blockId?: string;
        blockType?: string;
    };
    children?: IMindMapNode[];
}

const HEADING_TYPES = ["h1", "h2", "h3", "h4", "h5", "h6"];

/**
 * 思源块树 DOM 元素的 data-type 属性值（实测确认，非 h/l/i/p）：
 * - NodeHeading：标题块，data-subtype 为 h1-h6
 * - NodeList：列表容器，data-subtype 为 u/o
 * - NodeListItem：列表项
 * - NodeParagraph：段落（列表项正文载体，转换时跳过）
 */
const TYPE_HEADING = "NodeHeading";
const TYPE_LIST = "NodeList";
const TYPE_LIST_ITEM = "NodeListItem";
const TYPE_PARAGRAPH = "NodeParagraph";

/**
 * 从块 DOM 元素提取正文文本：
 * 克隆后移除所有子块节点与思源 UI 元素（图标、面包屑等），
 * 剩余 textContent 即该块自身的文本。
 */
function getBlockText(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-node-id]").forEach(n => n.remove());
    clone.querySelectorAll(
        ".protyle-icons, .protyle-breadcrumb, .protyle-action, .b3-menu, .protyle-list__dot, .protyle-bg, .protyle-attr",
    ).forEach(n => n.remove());
    return (clone.textContent || "").trim();
}

/**
 * 从列表项 DOM 提取正文文本。
 *
 * 思源真实 DOM 中 NodeListItem 自身无文本（其 textContent 为整棵子树拼接），
 * 正文在第一个子 NodeParagraph 中（实测：NodeListItem st6lwr → NodeParagraph b369zj）。
 * 因此不能直接复用 getBlockText（会移除子块导致文本为空），需先取子 NodeParagraph：
 * 1. 在直接子元素中找第一个 data-type="NodeParagraph"，取其文本
 * 2. 找不到 NodeParagraph 时回退：移除子块后的自身文本
 */
function getListItemText(el: HTMLElement): string {
    for (const child of Array.from(el.children)) {
        if (child && typeof child.getAttribute === "function" && child.getAttribute("data-type") === TYPE_PARAGRAPH) {
            return getBlockText(child as HTMLElement);
        }
    }
    return getBlockText(el);
}

/** 将一个块 DOM 元素转为单个导图节点（不处理章节归属，仅解析节点自身）。
 *  - NodeHeading 标题块 → blockType 为 h1-h6
 *  - NodeListItem 列表项 → blockType 为 li（正文从子 NodeParagraph 提取）
 *  - NodeList 列表容器 / NodeParagraph 段落 / 其他块 → 返回 null（不建节点）
 * 列表项的嵌套子列表通过 convertListItemChildren 单独处理（保留嵌套层级）。
 */
function buildSingleNode(el: HTMLElement): IMindMapNode | null {
    const type = el.getAttribute("data-type");
    const nodeId = el.getAttribute("data-node-id");
    if (!type || !nodeId) {
        return null;
    }
    const subType = el.getAttribute("data-subtype") || "";

    if (type === TYPE_HEADING && HEADING_TYPES.indexOf(subType) !== -1) {
        return {
            data: {
                text: getBlockText(el),
                expand: true,
                blockId: nodeId,
                blockType: subType,
            },
            children: [],
        };
    }

    if (type === TYPE_LIST_ITEM) {
        return {
            data: {
                text: getListItemText(el),
                expand: true,
                blockId: nodeId,
                blockType: "li",
            },
            children: convertListItemChildren(el),
        };
    }

    // NodeList / NodeParagraph / 其他块：自身不建节点
    return null;
}

/** 列表项的嵌套子列表：在其子元素中找 NodeList，展开为子节点列表。 */
function convertListItemChildren(el: HTMLElement): IMindMapNode[] {
    for (const child of Array.from(el.children)) {
        if (child && typeof child.getAttribute === "function" && child.getAttribute("data-type") === TYPE_LIST) {
            return convertDomChildren(child as HTMLElement);
        }
    }
    return [];
}

/** 转换 NodeList 容器：直接子 NodeListItem 作为兄弟节点列表。 */
function convertDomChildren(listEl: HTMLElement): IMindMapNode[] {
    const nodes: IMindMapNode[] = [];
    for (const child of Array.from(listEl.children)) {
        if (child && typeof child.getAttribute === "function" && child.getAttribute("data-type") === TYPE_LIST_ITEM) {
            const node = buildSingleNode(child as HTMLElement);
            if (node) nodes.push(node);
        }
    }
    return nodes;
}

/**
 * 从思源渲染 DOM 构建文档的导图树。
 *
 * 思源 wysiwyg DOM 的真实结构（实测确认）：
 * 标题块（NodeHeading）与其后的列表容器（NodeList）是**兄弟平级**而非父子嵌套，
 * 即 DOM 是平铺的——文档章节归属需自行重建，不能依赖 DOM 嵌套。
 *
 * 重建规则（思源/Markdown 章节归属约定）：
 * 遍历 wysiwyg 根的直接子块，维护"当前标题栈"：
 * - 遇到 NodeHeading hN → 开启新章节，挂到栈中最近且层级 < N 的标题下，自身入栈
 * - 遇到 NodeList → 其列表项挂到当前栈顶标题下；若栈空（无前置标题）则挂到文档根
 * - NodeParagraph / 其他块 → 跳过（不进入导图）
 * 列表项自身的嵌套子列表仍走 DOM 嵌套（convertListItemChildren），层级正确。
 *
 * 为什么不用 SQL/getChildBlocks：
 * - blocks 表索引不完整（实测 64 块 vs DOM 78 块，缺嵌套列表项/容器），parent_id 链断裂
 * - getChildBlocks 返回 h3 与 l 平级，与真实嵌套不符
 *
 * @param wysiwyg  protyle.protyle.wysiwyg.element（文档根块树 DOM）
 * @param docId    文档根块 id
 */
export async function buildMindMapTreeFromDom(wysiwyg: HTMLElement, docId: string): Promise<IMindMapNode> {
    const docInfo = await getBlockInfo(docId);
    const root: IMindMapNode = {
        data: {
            text: docInfo.rootTitle || docInfo.content || docInfo.name || "文档",
            expand: true,
            blockId: docId,
            blockType: "root",
        },
        children: [],
    };

    // 标题栈：每项 { node, level }，按层级递增维护；遇更高层级标题时弹栈到合适深度
    const stack: Array<{ node: IMindMapNode; level: number }> = [];
    const appendToCurrent = (node: IMindMapNode) => {
        const parent = stack.length > 0 ? stack[stack.length - 1].node : root;
        parent.children = parent.children || [];
        parent.children.push(node);
    };

    for (const child of Array.from(wysiwyg.children)) {
        if (!child || typeof child.getAttribute !== "function") {
            continue;
        }
        const type = child.getAttribute("data-type");
        if (!type) continue;

        if (type === TYPE_HEADING) {
            const subType = child.getAttribute("data-subtype") || "";
            const levelIdx = HEADING_TYPES.indexOf(subType);
            if (levelIdx === -1) {
                continue; // 超出 h6 或非 h1-h6，跳过
            }
            const node = buildSingleNode(child as HTMLElement);
            if (!node) continue;
            // 弹栈到最近层级 < 当前标题的栈顶（确保子标题挂在父标题下）
            while (stack.length > 0 && stack[stack.length - 1].level >= levelIdx) {
                stack.pop();
            }
            appendToCurrent(node);
            stack.push({ node, level: levelIdx });
            continue;
        }

        if (type === TYPE_LIST) {
            // 列表容器中的列表项挂到当前栈顶标题（无标题则挂根）
            for (const item of convertDomChildren(child as HTMLElement)) {
                appendToCurrent(item);
            }
            continue;
        }

        // NodeListItem 直接出现在根层（思源有时不包 NodeList？实测未见，容错处理）
        if (type === TYPE_LIST_ITEM) {
            const node = buildSingleNode(child as HTMLElement);
            if (node) appendToCurrent(node);
            continue;
        }

        // 其他块（NodeParagraph 等）跳过
    }

    return root;
}
