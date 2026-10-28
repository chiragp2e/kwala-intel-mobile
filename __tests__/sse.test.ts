import { LineBuffer, parseEventLine } from '../src/api/sse';

describe('parseEventLine', () => {
  it('parses the event kinds the chat service sends', () => {
    expect(parseEventLine('data: {"type":"token","content":"Hi"}')).toEqual({ type: 'token', content: 'Hi' });
    expect(parseEventLine('data: {"type":"status","content":"Reading"}')).toEqual({ type: 'status', content: 'Reading' });
    expect(parseEventLine('data: {"type":"done"}')).toEqual({ type: 'done' });
    expect(parseEventLine('data: {"type":"blocks_reset"}')).toEqual({ type: 'blocks_reset' });
    expect(parseEventLine('data: {"type":"block","content":{"type":"prose","markdown":"x"}}')).toEqual({
      type: 'block',
      content: { type: 'prose', markdown: 'x' },
    });
  });

  it('ignores unknown types, malformed JSON, comments and wrong content types', () => {
    expect(parseEventLine('data: {"type":"activity","content":{"id":1}}')).toBeNull();
    expect(parseEventLine('data: {not json')).toBeNull();
    expect(parseEventLine(': keep-alive')).toBeNull();
    expect(parseEventLine('data: ')).toBeNull();
    expect(parseEventLine('data: {"type":"token","content":{"a":1}}')).toBeNull();
    expect(parseEventLine('data: null')).toBeNull();
  });
});

describe('LineBuffer', () => {
  it('reassembles a line split across chunks and keeps the tail', () => {
    const b = new LineBuffer();
    expect(b.push('data: {"type":"tok')).toEqual([]);
    expect(b.push('en","content":"a"}\ndata: {"type":"done"}\npart')).toEqual([
      'data: {"type":"token","content":"a"}',
      'data: {"type":"done"}',
    ]);
    expect(b.flush()).toEqual(['part']);
    expect(b.flush()).toEqual([]);
  });

  it('strips carriage returns', () => {
    expect(new LineBuffer().push('a\r\nb\r\n')).toEqual(['a', 'b']);
  });
});
