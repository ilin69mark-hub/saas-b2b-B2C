'use client';

import React, { useCallback, useRef } from 'react';
import { Input } from 'antd';
import type { InputProps, InputRef } from 'antd';
import { formatPhone, normalizeForApi, extractDigits } from '@/utils/phone';

export interface PhoneInputProps
  extends Omit<InputProps, 'value' | 'onChange' | 'onKeyDown' | 'onPaste' | 'maxLength'> {
  value?: string;
  onChange?: (display: string, api: string) => void;
}

/**
 * Поле ввода телефона с фиксированным российским форматом.
 *
 * - Всегда отображает префикс +7 и маску +7(XXX)-XXX-XX-XX.
 * - Разрешён ввод только цифр (остальные клавиши блокируются на keydown).
 * - При вставке из буфера обмена извлекаются только цифры, затем форматирование.
 * - `onChange` получает пару `(display, api)`, где `api` — канонический
 *   формат +7XXXXXXXXXX (или '' если ввод пуст).
 *
 * Контролируемое значение (`value`) допускает любой из форматов:
 * пустая строка, '+7', '+7XXXXXXXXXX' или '+7(XXX)-XXX-XX-XX'.
 */
const PhoneInput = React.forwardRef<InputRef, PhoneInputProps>(
  ({ value, onChange, placeholder, ...rest }, ref) => {
    const inputRef = useRef<InputRef | null>(null);

    const toDisplay = useCallback((raw: string | undefined): string => {
      if (!raw) return '+7';
      // Уже в display-формате — оставляем как есть
      if (raw.startsWith('+7(')) return formatPhone(raw);
      // '+7' или любой мусор → формат
      return formatPhone(raw);
    }, []);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target;
        const cursor = input.selectionStart ?? input.value.length;
        const formatted = formatPhone(input.value);
        onChange?.(formatted, normalizeForApi(formatted));
        // Восстанавливаем курсор: formatPhone мог изменить длину строки,
        // браузер по умолчанию кидает курсор в конец. Сохраняем позицию
        // как можно ближе к предыдущей, но не дальше длины нового value.
        const nextCursor = Math.min(cursor, formatted.length);
        // requestAnimationFrame гарантирует, что React успел отрендерить value.
        requestAnimationFrame(() => {
          try {
            input.setSelectionRange(nextCursor, nextCursor);
          } catch {
            // input мог размонтироваться — игнорируем
          }
        });
      },
      [onChange]
    );

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      // Разрешаем всегда: навигация и редактирование (Backspace, Delete, стрелки, etc.)
      const allowed = [
        'Backspace',
        'Delete',
        'Tab',
        'Enter',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'Escape',
      ];
      if (allowed.includes(e.key)) return;
      // Разрешаем Ctrl/Cmd + клавиша (копировать, вставить, вырезать, undo, select all, etc.)
      if (e.ctrlKey || e.metaKey) return;
      // Блокируем всё, кроме цифр: буквы, пробел, дефис и т.д. не должны попадать в value.
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
      }
    }, []);

    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData('text');
        if (!text) return;
        e.preventDefault();
        const digits = extractDigits(text);
        if (!digits) return;
        // Вставка заменяет выделенный фрагмент (или весь value, если ничего не выделено).
        // Чтобы корректно склеить, объединяем цифры слева от курсора/выделения, новые цифры
        // и цифры справа, и обрезаем до 10.
        const target = e.currentTarget;
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? start;
        const before = extractDigits(target.value.slice(0, start));
        const after = extractDigits(target.value.slice(end));
        const merged = (before + digits + after).slice(0, 10);
        const formatted = formatPhone(merged);
        // Ставим курсор в конец вставленного фрагмента.
        const newCursor = formatPhone(before + digits).length;
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        nativeSetter?.call(target, formatted);
        target.dispatchEvent(new Event('input', { bubbles: true }));
        onChange?.(formatted, normalizeForApi(formatted));
        requestAnimationFrame(() => {
          try {
            target.setSelectionRange(newCursor, newCursor);
          } catch {
            // ignore
          }
        });
      },
      [onChange]
    );

    const displayValue = toDisplay(value);

    return (
      <Input
        {...rest}
        ref={(node) => {
          inputRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) {
            (ref as React.MutableRefObject<InputRef | null>).current = node;
          }
        }}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder ?? '+7(XXX)-XXX-XX-XX'}
        inputMode="numeric"
        autoComplete="tel-national"
      />
    );
  }
);

PhoneInput.displayName = 'PhoneInput';

export default PhoneInput;
