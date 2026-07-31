import {fetchSyncPost} from "siyuan";

/**
 * 思源内核 API 返回的统一包裹结构。
 */
export interface IApiResponse<T = any> {
    code: number;
    msg: string;
    data: T;
}

/**
 * 思源文档块（与转换范围相关的字段）。
 * 类型参考思源内核 /api/block/* 接口返回的块数据结构。
 */
export interface IBlock {
    id: string;
    type: string; // h / l / i / p / c / t / b ...
    subType?: string; // h1-h6 / u / o ...
    content?: string; // 纯文本内容（注意：对 l/i 块是整棵子树文本拼接，单块文本需取子 p 块）
    markdown?: string; // markdown 源
    name?: string;
    rootTitle?: string; // getBlockInfo 返回的文档标题
    children?: IBlock[];
    [key: string]: any;
}

const request = async <T = any>(url: string, data?: any): Promise<T> => {
    const response = await fetchSyncPost(url, data);
    if (response.code !== 0) {
        throw new Error(`[MdToMindmap] ${url} 失败: ${response.msg}`);
    }
    return response.data as T;
};

/** 获取指定块的子块列表（仅一层）。 */
export const getChildBlocks = (id: string): Promise<IBlock[]> => {
    return request<IBlock[]>("/api/block/getChildBlocks", {id});
};

/** 获取文档根块信息。 */
export const getBlockInfo = (id: string): Promise<IBlock> => {
    return request<IBlock>("/api/block/getBlockInfo", {id});
};

/**
 * 更新块内容。
 * @param id 块 id
 * @param dataType 更新类型，如 "markdown" / "text"
 * @param data 新内容
 */
export const updateBlock = (id: string, dataType: string, data: string): Promise<null> => {
    return request<null>("/api/block/updateBlock", {id, dataType, data});
};

/**
 * 在指定位置插入新块。
 * @param dataType 插入内容类型，如 "markdown"
 * @param data 内容
 * @param position 定位方式：previousID / nextID / parentID 之一
 * @param positionID 定位块的 id
 */
export const insertBlock = (
    dataType: string,
    data: string,
    position: "previousID" | "nextID" | "parentID",
    positionID: string,
): Promise<IBlock> => {
    return request<IBlock>("/api/block/insertBlock", {dataType, data, [position]: positionID});
};

/** 删除指定块。 */
export const deleteBlock = (id: string): Promise<null> => {
    return request<null>("/api/block/deleteBlock", {id});
};

/**
 * 思源 blocks 表记录（SQL 查询返回的字段子集）。
 * 字段说明见 https://github.com/siyuan-note/siyuan 内核 sqlite schema。
 */
export interface IBlockRow {
    id: string;
    type: string; // h / l / i / p / c / t / b ...
    subtype: string; // h1-h6 / u / o ...
    content: string;
    parent_id: string;
    root_id: string;
    sort: string;
}

/**
 * 一条 SQL 取回指定文档（root_id）下的全部块，按文档顺序排序。
 * 相比逐块调用 getChildBlocks，将上千次串行请求降为 1 次。
 * @param rootId 文档根块 id
 */
export const queryBlocksByRoot = (rootId: string): Promise<IBlockRow[]> => {
    const stmt = `SELECT id, type, subtype, content, parent_id, root_id, sort FROM blocks WHERE root_id = '${rootId}' ORDER BY sort`;
    return request<IBlockRow[]>("/api/query/sql", {stmt});
};
