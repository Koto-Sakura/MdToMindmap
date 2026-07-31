/**
 * Mock 思源 siyuan 模块。新方案（DOM 遍历）只用 getBlockInfo 取文档标题。
 * 文档标题：测试用例
 */
export function fetchSyncPost(url, data) {
    if (url === "/api/block/getBlockInfo") {
        return {
            code: 0,
            msg: "",
            data: {id: data.id, rootTitle: "测试用例", content: "测试用例", name: "测试用例"},
        };
    }
    return {code: 0, msg: "", data: null};
}
