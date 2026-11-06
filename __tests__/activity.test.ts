import { applyActivity, formatMs, settleActivity, stripFollowups, summarize, type ActivityItem } from '../src/chat/activity';
import { copyText } from '../src/components/MessageItem';

describe('activity feed', () => {
  it('keys rows on id: done replaces its running row in place, in arrival order', () => {
    let items: ActivityItem[] = [];
    items = applyActivity(items, { id: 'a', state: 'running', label: 'A', group: 'market' }, 0);
    items = applyActivity(items, { id: 'b', state: 'running', label: 'B', group: 'web' }, 10);
    items = applyActivity(items, { id: 'a', state: 'done', label: 'A done', group: 'market', ms: 5 }, 20);
    expect(items.map(i => [i.id, i.state, i.label])).toEqual([
      ['a', 'done', 'A done'],
      ['b', 'running', 'B'],
    ]);
    // A late `running` never restarts a finished row.
    expect(applyActivity(items, { id: 'a', state: 'running', label: 'A', group: 'market' }, 30)).toBe(items);
  });

  it('settles open rows with their elapsed time when the stream ends', () => {
    const items: ActivityItem[] = [{ id: 'a', state: 'running', label: 'A', group: 'web', startedAt: 1000 }];
    expect(settleActivity(items, 4000)).toEqual([{ id: 'a', state: 'done', label: 'A', group: 'web', startedAt: 1000, ms: 3000 }]);
  });

  it('formats durations and the folded summary as the web does', () => {
    expect(formatMs(1400)).toBe('1.4s');
    expect(formatMs(12_300)).toBe('12s');
    expect(formatMs(65_000)).toBe('1m 5s');
    const items: ActivityItem[] = [
      { id: 'think:1', state: 'done', label: 'Plan', group: 'think', startedAt: 0 },
      { id: 'x', state: 'done', label: 'Prices', group: 'market', startedAt: 0 },
    ];
    expect(summarize(items, 12_000)).toBe('Checked 1 source · 12s');
    expect(summarize([items[0] as ActivityItem], 3_000)).toBe('Worked for 3s');
  });

  it('drops the follow-up block, including a marker still arriving', () => {
    expect(stripFollowups('Answer.\n\n§§FOLLOWUPS§§\n["a","b"]')).toBe('Answer.');
    expect(stripFollowups('Answer. §§FOLL')).toBe('Answer.');
    expect(stripFollowups('Plain')).toBe('Plain');
  });

  it('copies the prose of an answer, from blocks when it has them', () => {
    expect(copyText({ content: 'Hello **there**\n§§FOLLOWUPS§§[]' })).toBe('Hello **there**');
    expect(
      copyText({
        content: '',
        blocks: [{ type: 'prose', markdown: 'One' }, { type: 'chart' }, { type: 'group', blocks: [{ type: 'prose', markdown: 'Two' }] }],
      }),
    ).toBe('One\n\nTwo');
  });
});
