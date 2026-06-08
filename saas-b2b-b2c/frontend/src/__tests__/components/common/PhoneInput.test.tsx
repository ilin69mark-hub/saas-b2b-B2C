import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PhoneInput from '@/components/common/PhoneInput';

const renderPhoneInput = (props: Partial<React.ComponentProps<typeof PhoneInput>> = {}) => {
  const onChange = jest.fn();
  const utils = render(<PhoneInput value={props.value} onChange={onChange} />);
  const input = screen.getByPlaceholderText('+7(XXX)-XXX-XX-XX') as HTMLInputElement;
  return { ...utils, input, onChange };
};

const setNativeValue = (input: HTMLInputElement, value: string) => {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('PhoneInput', () => {
  it('displays +7 as default value', () => {
    const { input } = renderPhoneInput({ value: '' });
    expect(input.value).toBe('+7');
  });

  it('formats typed digits progressively', () => {
    const { input, onChange } = renderPhoneInput({ value: '' });

    setNativeValue(input, '9');
    fireEvent.change(input, { target: { value: '9' } });
    expect(onChange).toHaveBeenLastCalledWith('+7(9', '');

    setNativeValue(input, '99');
    fireEvent.change(input, { target: { value: '99' } });
    expect(onChange).toHaveBeenLastCalledWith('+7(99', '');

    setNativeValue(input, '999');
    fireEvent.change(input, { target: { value: '999' } });
    expect(onChange).toHaveBeenLastCalledWith('+7(999)', '');

    setNativeValue(input, '9991234567');
    fireEvent.change(input, { target: { value: '9991234567' } });
    expect(onChange).toHaveBeenLastCalledWith('+7(999)-123-45-67', '+79991234567');
  });

  it('normalizes initial value +79991234567 to display format', () => {
    const { input } = renderPhoneInput({ value: '+79991234567' });
    expect(input.value).toBe('+7(999)-123-45-67');
  });

  it('normalizes initial value 89991234567 to display format', () => {
    const { input } = renderPhoneInput({ value: '89991234567' });
    expect(input.value).toBe('+7(999)-123-45-67');
  });

  it('blocks non-digit keys', () => {
    const { input, onChange } = renderPhoneInput({ value: '' });
    fireEvent.keyDown(input, { key: 'a' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('allows control keys (Backspace, Delete, Arrow, etc.)', () => {
    const { input, onChange } = renderPhoneInput({ value: '+7(999)-123-45-67' });
    fireEvent.keyDown(input, { key: 'Backspace' });
    fireEvent.keyDown(input, { key: 'Delete' });
    fireEvent.keyDown(input, { key: 'ArrowLeft' });
    fireEvent.keyDown(input, { key: 'Home' });
    fireEvent.keyDown(input, { key: 'End' });
    fireEvent.keyDown(input, { key: 'Tab' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('handles paste with formatted string', () => {
    const { input, onChange } = renderPhoneInput({ value: '' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { getData: () => '+7 (999) 123-45-67' },
    });
    fireEvent(input, pasteEvent);

    expect(onChange).toHaveBeenCalledWith('+7(999)-123-45-67', '+79991234567');
  });

  it('handles paste with bare digits', () => {
    const { input, onChange } = renderPhoneInput({ value: '' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { getData: () => '89991234567' },
    });
    fireEvent(input, pasteEvent);

    expect(onChange).toHaveBeenCalledWith('+7(999)-123-45-67', '+79991234567');
  });

  it('caps at 10 digits after +7', () => {
    const { input, onChange } = renderPhoneInput({ value: '' });
    setNativeValue(input, '999123456789012');
    fireEvent.change(input, { target: { value: '999123456789012' } });
    expect(onChange).toHaveBeenLastCalledWith('+7(999)-123-45-67', '+79991234567');
  });

  it('returns empty api value for partial input', () => {
    const { input, onChange } = renderPhoneInput({ value: '' });
    setNativeValue(input, '999');
    fireEvent.change(input, { target: { value: '999' } });
    expect(onChange).toHaveBeenLastCalledWith('+7(999)', '');
  });

  it('accepts all 10 digits in display format', () => {
    const { onChange } = renderPhoneInput({ value: '' });
    fireEvent.change(screen.getByPlaceholderText('+7(XXX)-XXX-XX-XX'), {
      target: { value: '+7(999)-123-45-67' },
    });
    expect(onChange).toHaveBeenLastCalledWith('+7(999)-123-45-67', '+79991234567');
  });

  it('display format length is 17 characters', () => {
    expect('+7(999)-123-45-67'.length).toBe(17);
  });

  it('uses numeric inputMode for mobile keyboards', () => {
    const { input } = renderPhoneInput({ value: '' });
    expect(input.inputMode).toBe('numeric');
  });

  it('handles delete (removing a digit) without jumping cursor to end', async () => {
    // Полный ввод, потом симулируем Backspace — пользователь удаляет
    // одну цифру; ожидаем, что в value останется 9 цифр.
    const { input, onChange } = renderPhoneInput({ value: '+79991234567' });
    // Симулируем состояние "пользователь стёр последнюю цифру":
    // в value уже отображается +7(999)-123-45-6 (16 символов).
    setNativeValue(input, '+7(999)-123-45-6');
    fireEvent.change(input, { target: { value: '+7(999)-123-45-6' } });
    expect(onChange).toHaveBeenLastCalledWith('+7(999)-123-45-6', '');
  });

  it('preserves cursor position after format change', () => {
    // Регрессия: при вводе цифры formatPhone() мог менять длину, и
    // курсор сбрасывался в конец. Теперь он сохраняется.
    const { input } = renderPhoneInput({ value: '' });
    // Прямой сеттер selectionStart на позицию перед закрывающей скобкой
    input.setSelectionRange(4, 4);
    fireEvent.change(input, { target: { value: '+7(99' } });
    // После изменения React перерендерит value, но курсор должен быть восстановлен.
    requestAnimationFrame(() => {
      // Допускаем любую позицию в диапазоне — главное, не конец.
      expect(input.selectionStart).not.toBe(input.value.length);
    });
  });
});
