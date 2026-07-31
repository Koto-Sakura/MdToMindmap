/**
 * simple-mind-map 最小类型声明。
 *
 * 包的 package.json 声明了 types: ./types/index.d.ts，但实际发布物中
 * 不存在该目录，故在此补充本项目用到的 API 子集。
 */
declare module "simple-mind-map" {
    export interface MindMapNodeData {
        text: string;
        expand?: boolean;
        [key: string]: any;
    }

    export interface MindMapNode {
        data: MindMapNodeData;
        children?: MindMapNode[];
    }

    export interface MindMapOptions {
        /** 容器元素，必传 */
        el: HTMLElement;
        /** 导图数据 */
        data?: MindMapNode;
        /** 是否只读 */
        readonly?: boolean;
        /** 布局，如 logicalStructure */
        layout?: string;
        /** 主题名，如 default */
        theme?: string;
        /** 初始化后自动适应视图 */
        fit?: boolean;
        [key: string]: any;
    }

    export default class MindMap {
        constructor(options: MindMapOptions);
        opt: MindMapOptions;
        /** 动态设置导图数据 */
        setData(data: MindMapNode): void;
        /** 获取导图数据 */
        getData(withConfig?: boolean): any;
        /** 销毁实例（移除事件、DOM） */
        destroy(): void;
        view: {
            /** 适应视图 */
            fit(): void;
            /** 视图尺寸变化时调用 */
            resize(): void;
        };
        on(type: string, callback: (...args: any[]) => void): void;
        off(type: string, callback: (...args: any[]) => void): void;
    }
}
