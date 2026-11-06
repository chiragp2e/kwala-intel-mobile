import { claimsSwipe, drawerWidth, endsOpen, panelOffset } from '../src/components/drawerSwipe';

describe('history drawer swipe', () => {
  const w = drawerWidth(400); // 344

  it('takes only a clearly sideways drag, in the direction that changes it', () => {
    expect(claimsSwipe(20, 4, 1)).toBe(true);
    expect(claimsSwipe(8, 0, 1)).toBe(false); // too small: still a tap or the start of a scroll
    expect(claimsSwipe(20, 18, 1)).toBe(false); // diagonal: the chat list keeps it
    expect(claimsSwipe(-20, 4, 1)).toBe(false); // leftward does not open
    expect(claimsSwipe(-20, 4, -1)).toBe(true);
    expect(claimsSwipe(20, 4, -1)).toBe(false); // rightward does not close
  });

  it('keeps the panel under the finger, within its width', () => {
    expect(panelOffset(false, 0, w)).toBe(-w);
    expect(panelOffset(false, 100, w)).toBe(-w + 100);
    expect(panelOffset(false, w + 50, w)).toBe(0);
    expect(panelOffset(false, -30, w)).toBe(-w);
    expect(panelOffset(true, -100, w)).toBe(-100);
    expect(panelOffset(true, 40, w)).toBe(0);
    expect(panelOffset(true, -w - 50, w)).toBe(-w);
  });

  it('changes state past a third of the way, or on a flick either way', () => {
    expect(endsOpen(false, w * 0.2, 0.1, w)).toBe(false);
    expect(endsOpen(false, w * 0.4, 0.1, w)).toBe(true);
    expect(endsOpen(false, 30, 0.9, w)).toBe(true); // a quick flick opens
    expect(endsOpen(false, w * 0.8, -0.9, w)).toBe(false); // pulled most of the way, then flicked back
    expect(endsOpen(true, -w * 0.2, -0.1, w)).toBe(true);
    expect(endsOpen(true, -w * 0.4, -0.1, w)).toBe(false);
    expect(endsOpen(true, -30, -0.9, w)).toBe(false);
  });
});
