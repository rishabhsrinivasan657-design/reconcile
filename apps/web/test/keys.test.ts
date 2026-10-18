import { describe, expect, it } from 'vitest';
import { createKeyReader, isTyping } from '../src/lib/keys';

describe('keyboard shortcuts (M5 AC-9)', () => {
  it('reads single keys and "G then a key" sequences', () => {
    let t = 0;
    const read = createKeyReader(() => t);
    expect(read('J')).toBe('j');
    expect(read('?')).toBe('?');
    expect(read('g')).toBeUndefined();
    t = 300;
    expect(read('p')).toBe('g p');
  });
  it('forgets a G that was pressed too long ago', () => {
    let t = 0;
    const read = createKeyReader(() => t);
    read('g');
    t = 2000;
    expect(read('p')).toBe('p');
  });
  it('never treats typing in a field, or modified keys, as a shortcut', () => {
    const textarea = document.createElement('textarea');
    expect(isTyping({ target: textarea, metaKey: false, ctrlKey: false, altKey: false })).toBe(
      true,
    );
    expect(isTyping({ target: document.body, metaKey: true, ctrlKey: false, altKey: false })).toBe(
      true,
    );
    expect(isTyping({ target: document.body, metaKey: false, ctrlKey: false, altKey: false })).toBe(
      false,
    );
  });
});
