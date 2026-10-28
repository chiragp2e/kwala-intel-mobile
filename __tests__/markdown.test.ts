import { parseBlocks, parseInline } from '../src/components/markdown';
import { summariseBlocks } from '../src/components/MessageItem';

describe('markdown', () => {
  it('parses headings, bullets, numbers and joins wrapped paragraph lines', () => {
    expect(parseBlocks('# T\n\nline one\nline two\n\n- a\n* b\n1. c\n2) d')).toEqual([
      { kind: 'heading', level: 1, text: 'T' },
      { kind: 'paragraph', text: 'line one line two' },
      { kind: 'bullet', text: 'a' },
      { kind: 'bullet', text: 'b' },
      { kind: 'number', n: '1', text: 'c' },
      { kind: 'number', n: '2', text: 'd' },
    ]);
  });

  it('parses inline bold, code, italic and links', () => {
    expect(parseInline('a **b** `c` *d* [e](https://x.y)')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', code: true },
      { text: ' ' },
      { text: 'd', italic: true },
      { text: ' ' },
      { text: 'e', href: 'https://x.y' },
    ]);
  });

  it('leaves unmatched markers as plain text', () => {
    expect(parseInline('2 * 3 and **open')).toEqual([{ text: '2 * 3 and **open' }]);
  });
});

describe('summariseBlocks', () => {
  it('collects prose in order, descends into groups and counts visuals', () => {
    const out = summariseBlocks([
      { type: 'prose', markdown: 'one' },
      { type: 'chart', spec: {} },
      { type: 'group', blocks: [{ type: 'prose', markdown: 'two' }, { type: 'widget', kind: 'stat' }] },
    ]);
    expect(out).toEqual({ markdown: 'one\n\ntwo', visuals: 2 });
  });
});
