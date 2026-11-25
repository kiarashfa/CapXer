// Wraps every Markdown table in <div class="table-wrap"> so a wide table scrolls
// sideways on a phone while it still fills the text column on desktop.
export const tableWrap = {
  name: 'capxer-table-wrap',
  table(node: unknown, ctx: { wrapNode(node: unknown, parent: unknown): void }) {
    ctx.wrapNode(node, {
      type: 'tableWrap',
      data: { hName: 'div', hProperties: { className: ['table-wrap'] } },
      children: [],
    });
  },
};
