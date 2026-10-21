export const note = (id = 'note-1', text = '', media = []) => ({ id, title: id, preview: text, updatedAt: 1, links: [],
    hasContent: text.trim().length > 0 || media.length > 0, hasText: text.trim().length > 0,
    document: { format: 'omega-document', version: 1, page: { width: 794, height: 1123 }, elements: [
        { id: 'text-' + id, type: 'text', x: 32, y: 32, width: 728, height: 44, text, alignment: 'left' }, ...media,
    ] } });
export const noteSummary = value => ({ id: value.id, title: value.title, preview: value.preview,
    updatedAt: value.updatedAt, links: value.links ?? [], hasContent: value.hasContent,
    hasText: value.hasText });
export const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
export const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
};
