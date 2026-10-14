declare module "prismjs/components/prism-core" {
    export type PrismToken = { type: string; alias?: string | string[]; content: string | PrismToken | (string | PrismToken)[] };
    const Prism: {
        manual: boolean;
        languages: Record<string, object>;
        tokenize: (text: string, grammar: object) => (string | PrismToken)[];
    };
    export default Prism;
}

declare module "prismjs/components/prism-*";
