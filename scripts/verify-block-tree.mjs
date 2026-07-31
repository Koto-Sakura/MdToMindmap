/**
 * 验证 block-tree.ts 的 DOM 遍历转换逻辑（无需思源环境）。
 *
 * 做法：用 esbuild 打包 src/block-tree.ts（siyuan alias 到 mock），
 * 构造模拟思源 wysiwyg DOM 结构的假 DOM（基于用户实测的真实块树），
 * 运行 buildMindMapTreeFromDom 并断言结果。
 *
 * 假 DOM 结构对齐思源真实渲染：
 * - data-type: NodeHeading / NodeList / NodeListItem / NodeParagraph
 * - data-subtype: h1-h6 / u / o
 * - 列表项正文在子 NodeParagraph 中；块自身文本 = textContent 去掉子块
 */
import {build} from "esbuild";
import {pathToFileURL} from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── 最小假 DOM 元素（支持 block-tree.ts 用到的 API） ──
class FakeEl {
    constructor(tag, type, subtype, nodeId, ownText) {
        this.tag = tag;
        this.attrs = {};
        if (type) this.attrs["data-type"] = type;
        if (subtype) this.attrs["data-subtype"] = subtype;
        if (nodeId) this.attrs["data-node-id"] = nodeId;
        this._ownText = ownText || "";
        this.children = [];
    }
    getAttribute(name) {
        return this.attrs[name] ?? null;
    }
    appendChild(child) {
        child.parent = this;
        this.children.push(child);
        return child;
    }
    get textContent() {
        return this._ownText + this.children.map(c => c.textContent).join("");
    }
    remove() {
        if (this.parent) {
            const idx = this.parent.children.indexOf(this);
            if (idx !== -1) this.parent.children.splice(idx, 1);
        }
    }
    cloneNode(deep) {
        const clone = new FakeEl(this.tag, this.attrs["data-type"], this.attrs["data-subtype"], this.attrs["data-node-id"], this._ownText);
        if (deep) {
            for (const c of this.children) {
                clone.appendChild(c.cloneNode(true));
            }
        }
        return clone;
    }    querySelectorAll(selector) {
        // 支持 [data-node-id] 与 .class 选择器（getBlockText 用到）
        const results = [];
        const walk = el => {
            for (const c of el.children) {
                if (selector === "[data-node-id]" && c.getAttribute("data-node-id")) {
                    results.push(c);
                } else if (selector.startsWith(".")) {
                    // 假 DOM 无 UI 类元素，直接忽略
                }
                walk(c);
            }
        };
        walk(this);
        return results;
    }
}

const NODE = (type, subtype, id, text, children = []) => {
    const el = new FakeEl("div", type, subtype, id, text);
    children.forEach(c => el.appendChild(c));
    return el;
};

// ── 构造与真实文档一致的结构（思源 wysiwyg DOM 平铺：标题与列表兄弟平级）──
// 文档根（wysiwyg.element）的直接子节点顺序（与用户实测 DOM 一致）：
//   NodeParagraph "/"（游离段落，应被跳过）
//   NodeHeading/h2 "1. 选择指定运营商"
//   NodeHeading/h3 "1.1 一般调度策略"
//   NodeList/u → 4 个 NodeListItem（每个内部嵌套 NodeList → "预期：..."子项）
//   NodeHeading/h3 "1.2 按带宽负载"
//   NodeList/u → 3 个 NodeListItem（"开启"项内部含 2 子项：预期 + ？）
//   NodeHeading/h2 "2. 不选择运营商" → NodeList/u → 1 项
//   NodeHeading/h2 "3. 异常回退"     → NodeList/u → 2 项
//   NodeHeading/h2 "4. 跨状态与配置变更" → NodeList/u → 1 项
//   NodeHeading/h2 "5. 日志校验？"   → NodeList/u → 2 项
// 关键：NodeHeading 与其后的 NodeList 平级（兄弟），标题下的列表归属
//       由 buildMindMapTreeFromDom 的章节重建算法决定，而非 DOM 嵌套。

const para = (id, text) => NODE("NodeParagraph", "", id, text);

// 列表项：liText 为正文（子 NodeParagraph），subItems 为嵌套子列表项文本
// 注意：NodeListItem 自身不设 ownText（对齐真实 DOM——正文只在子 NodeParagraph）
const li = (id, liText, subItems = []) => {
    const children = [para(id + "-p", liText)];
    if (subItems.length > 0) {
        const subList = NODE("NodeList", "u", id + "-l");
        subItems.forEach((s, i) => {
            subList.appendChild(li(id + "-s" + i, s));
        });
        children.push(subList);
    }
    return NODE("NodeListItem", "u", id, "", children);
};

const list = (id, items) => {
    const l = NODE("NodeList", "u", id);
    items.forEach((item, i) => l.appendChild(li(id + "-i" + i, item.text, item.subs || [])));
    return l;
};

const wysiwyg = new FakeEl("div", "", "", "wysiwyg");
wysiwyg.appendChild(NODE("NodeParagraph", "", "para-root", "/"));
// 1. 选择指定运营商（h2）——其后 h3 与 NodeList 均为其兄弟（平铺）
wysiwyg.appendChild(NODE("NodeHeading", "h2", "h2-1", "1. 选择指定运营商"));
wysiwyg.appendChild(NODE("NodeHeading", "h3", "h3-1-1", "1.1 一般调度策略"));
wysiwyg.appendChild(list("l-1-1", [
    {text: "目标运营商单线路", subs: ["预期：当目标运营商仅有一条线路时，客户端连接请求应使用该线路"]},
    {text: "目标运营商多线路", subs: ["预期：当目标运营商存在 A、B 等多条线路，且 A 线路当前在线订单数少于 B 时，新的连接请求应使用 A 线路。"]},
    {text: "动态变化", subs: ["预期：随着用户上线，原先较\"空闲\"的 A 线路订单数超过 B 线路后，后续新进入的用户应自动切换为使用 B 线路。"]},
    {text: "相同订单数", subs: ["预期：当多条线路的在线订单数相同时，系统应随机分配。"]},
]));
wysiwyg.appendChild(NODE("NodeHeading", "h3", "h3-1-2", "1.2 按带宽负载"));
wysiwyg.appendChild(list("l-1-2", [
    {text: "开启\"按带宽负载\"后", subs: [
        "预期：在机房配置开启状态下，若 A 线路 100M 带宽有5个订单，B 线路 10M 带宽有2个订单，新连接应使用 A。",
        "？：这里按带宽分配策略按当前每个订单的平均带宽，比如若使用 A 线路，则每个订单拥有 100/5=20 M 带宽，而分配给 B 则有 10/2=5 M 带宽，故新订单选择 A 线路",
    ]},
    {text: "动态变化", subs: ["预期：持续增加高带宽线路的连接数，当高带宽线路的订单数达到临界，应将新订单分配给 B 线路。"]},
    {text: "配置实时生效", subs: ["预期：管理后台修改机房带宽配置后，新发起的订单应按新策略进行选择，已连接的订单不受影响。"]},
]));
// 2-5 模块
wysiwyg.appendChild(NODE("NodeHeading", "h2", "h2-2", "2. 不选择运营商"));
wysiwyg.appendChild(list("l-2", [{text: "需要向郭臻确认当前客户端是否会在用户没有选择运营商的情况下自动选择运营商，如果会，那么这种\"不选择运营商\"情况不存在；如果不会，那么测试验证线路选择时是否会在当前大区下全部线路中选择"}]));
wysiwyg.appendChild(NODE("NodeHeading", "h2", "h2-3", "3. 异常回退"));
wysiwyg.appendChild(list("l-3", [
    {text: "带宽数据配置异常后", subs: ["预期：当机房设置了按带宽负载，但具体线路的带宽数据为 0、负数或其他异常值时，系统应自动使用\"仅按在线订单数\"的策略，确保不影响连接。"]},
    {text: "调度接口超时或数据获取失败", subs: ["预期：若系统在判定\"哪条线路更合适\"时出现超时或其他问题，应快速切换为原\"随机选线\"的策略，优先保证连接成功。"]},
]));
wysiwyg.appendChild(NODE("NodeHeading", "h2", "h2-4", "4. 跨状态与配置变更"));
wysiwyg.appendChild(list("l-4", [{text: "连接过程中变更配置", subs: ["预期：用户正在使用线路 A 串流时，后台更改了该机房的选线模式（如开启/关闭带宽模式），当前连接不断开，仅对用户下一次连接产生影响。"]}]));
wysiwyg.appendChild(NODE("NodeHeading", "h2", "h2-5", "5. 日志校验？"));
wysiwyg.appendChild(list("l-5", [
    {text: "线路选择策略记录", subs: ["预期：在订单日志中，能够记录本次选线策略，且记录的线路 ID 与实际使用线路匹配。"]},
    {text: "异常回退标识", subs: ["预期：当触发异常回退时，日志中应有明确的标记（如 Fallback），以便在排查问题时能够快速定位是否由调度逻辑异常引起。"]},
]));

// ── 打包并运行 ──
const outfile = path.join(os.tmpdir(), `md2mindmap-verify-${process.pid}.mjs`);

try {
    await build({
        entryPoints: ["src/block-tree.ts"],
        bundle: true,
        format: "esm",
        platform: "node",
        target: "node18",
        outfile,
        alias: {siyuan: path.resolve("scripts/mock-siyuan.mjs")},
        logLevel: "warning",
    });

    const {buildMindMapTreeFromDom} = await import(pathToFileURL(outfile).href);
    const tree = await buildMindMapTreeFromDom(wysiwyg, "doc-root");

    let passed = 0;
    let failed = 0;
    const check = (name, cond) => {
        if (cond) {
            passed++;
            console.log(`  ✅ ${name}`);
        } else {
            failed++;
            console.log(`  ❌ ${name}`);
        }
    };

    const find = (node, text) => {
        if (node.data.text === text) return node;
        for (const c of node.children || []) {
            const r = find(c, text);
            if (r) return r;
        }
        return null;
    };

    console.log("\n=== 转换结果树 ===");
    const dump = (n, d) => {
        console.log(`${"  ".repeat(d)}• ${n.data.text} [${n.data.blockType}]`);
        (n.children || []).forEach(c => dump(c, d + 1));
    };
    dump(tree, 0);

    console.log("\n=== 断言 ===");

    // 根节点
    check("根节点为文档标题", tree.data.text === "测试用例");
    check("根节点 blockType=root", tree.data.blockType === "root");
    check("根节点携带 blockId", tree.data.blockId === "doc-root");

    // 游离段落被跳过
    check("游离段落「/」被跳过", !find(tree, "/"));

    // 五个 h2 模块，顺序正确
    const order = ["1. 选择指定运营商", "2. 不选择运营商", "3. 异常回退", "4. 跨状态与配置变更", "5. 日志校验？"];
    const childTexts = (tree.children || []).map(c => c.data.text);
    check("五个模块按文档顺序排列", JSON.stringify(childTexts) === JSON.stringify(order));

    // 1.1 一般调度策略：4 个 li，各带预期子项
    const h11 = find(tree, "1.1 一般调度策略");
    check("1.1 存在且 blockType=h3", h11?.data.blockType === "h3");
    const h11Children = h11?.children || [];
    check("1.1 下 4 个列表项", h11Children.length === 4);
    check("1.1 列表项文本正确（未拼接子项）", h11Children[0]?.data.text === "目标运营商单线路");
    check("1.1 列表项 blockType=li", h11Children[0]?.data.blockType === "li");
    check("1.1 嵌套子项存在", h11Children[0]?.children?.length === 1);

    // 1.2 按带宽负载：3 个 li，"开启"项有 2 个子项（预期 + ？）
    const h12 = find(tree, "1.2 按带宽负载");
    check("1.2 下 3 个列表项", (h12?.children || []).length === 3);
    const open = h12?.children?.[0];
    check("「开启按带宽负载后」2 个子项（预期+？）", open?.children?.length === 2);
    check("「？：」子项存在", open?.children?.[1]?.data.text.startsWith("？："));

    // 2-5 模块列表项数量
    check("2 模块 1 个列表项", (find(tree, "2. 不选择运营商")?.children || []).length === 1);
    check("3 模块 2 个列表项", (find(tree, "3. 异常回退")?.children || []).length === 2);
    check("4 模块 1 个列表项", (find(tree, "4. 跨状态与配置变更")?.children || []).length === 1);
    check("5 模块 2 个列表项", (find(tree, "5. 日志校验？")?.children || []).length === 2);

    // 所有节点携带 blockId
    let allHaveId = true;
    let missingId = null;
    const walk = n => {
        if (!n.data.blockId) {
            allHaveId = false;
            missingId = n.data.text;
        }
        (n.children || []).forEach(walk);
    };
    walk(tree);
    check("所有节点携带 blockId（缺失: " + (missingId || "无") + "）", allHaveId);

    console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
    process.exit(failed > 0 ? 1 : 0);
} finally {
    if (fs.existsSync(outfile)) fs.unlinkSync(outfile);
}
