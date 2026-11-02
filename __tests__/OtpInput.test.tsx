import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { OtpInput } from '../src/components/OtpInput';

function render(value: string, onChangeText = jest.fn()) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(<OtpInput value={value} onChangeText={onChangeText} />);
  });
  return { r, onChangeText };
}

describe('OtpInput', () => {
  it('draws one box per digit and leaves the rest empty', () => {
    const { r } = render('123');
    const digits = r.root.findAllByType(Text).map(t => t.props.children);
    expect(digits).toEqual(['1', '2', '3', '', '', '']);
  });

  it('keeps only digits, at most six, from whatever is typed or pasted', () => {
    const { r, onChangeText } = render('');
    const input = r.root.findByType(TextInput);
    act(() => input.props.onChangeText('12 34-56789'));
    expect(onChangeText).toHaveBeenCalledWith('123456');
  });
});
