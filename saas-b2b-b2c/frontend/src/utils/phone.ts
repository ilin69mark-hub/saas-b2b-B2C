/**
 * Утилиты для работы с российскими телефонными номерами.
 *
 * Канонический формат хранения в БД и API: +7XXXXXXXXXX (12 символов: +7 + 10 цифр).
 * Формат отображения в UI: +7(XXX)-XXX-XX-XX (17 символов).
 *
 * Внутри полей ввода допускается любой ввод — он всегда
 * переформатируется к display-формату через {@link formatPhone}.
 */

export const PHONE_DISPLAY_FORMAT = '+7(XXX)-XXX-XX-XX';

/** 10 цифр после +7 (без самого +7). */
export const PHONE_DIGITS_REGEX = /^\d{10}$/;

/** Display-формат: +7(999)-999-99-99 */
export const PHONE_DISPLAY_REGEX = /^\+7\(\d{3}\)-\d{3}-\d{2}-\d{2}$/;

/** API-формат: +79999999999 */
export const PHONE_API_REGEX = /^\+7\d{10}$/;

/**
 * Извлекает из произвольной строки до 10 цифр подряд (локальная часть номера).
 *
 * Не-цифровые символы игнорируются. Если строка начинается с +7 или 8
 * (российский country code), он отбрасывается, чтобы при вводе/чтении
 * всегда получать 10-значную локальную часть.
 *
 * @example
 * extractDigits('+7(999)-123-45-67') // '9991234567'
 * extractDigits('89991234567')       // '9991234567'
 * extractDigits('+7 999 123 45 67')  // '9991234567'
 */
export const extractDigits = (raw: string): string => {
  if (!raw) return '';
  const stripped = raw.replace(/^(\+7|8)/, '');
  return stripped.replace(/\D/g, '').slice(0, 10);
};

/**
 * Форматирует строку в +7(XXX)-XXX-XX-XX.
 *
 * Части, для которых введены все цифры, закрываются скобками/дефисами,
 * чтобы дать пользователю визуальную обратную связь.
 *
 * @example
 * formatPhone('9991234567')      // '+7(999)-123-45-67'
 * formatPhone('+7 999 123 4567') // '+7(999)-123-45-67'
 * formatPhone('')                // '+7'
 * formatPhone('1')               // '+7(1'
 * formatPhone('999')             // '+7(999)'
 */
export const formatPhone = (raw: string): string => {
  const d = extractDigits(raw);
  if (d.length === 0) return '+7';

  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 8);
  const p4 = d.slice(8, 10);

  let out = '+7';
  out += `(${p1}`;
  // Закрываем скобку, как только 3 цифры введены, чтобы дать визуальную границу
  if (d.length >= 3) out += ')';
  if (d.length > 3) out += `-${p2}`;
  if (d.length >= 6) out += '-';
  if (d.length > 6) out += `${p3}`;
  if (d.length >= 8) out += '-';
  if (d.length > 8) out += `${p4}`;
  return out;
};

/**
 * Преобразует в канонический API-формат +7XXXXXXXXXX.
 * Пустая строка (только +7) → пустая строка.
 *
 * @example
 * normalizeForApi('+7(999)-123-45-67') // '+79991234567'
 * normalizeForApi('+7')                // ''
 * normalizeForApi('')                  // ''
 */
export const normalizeForApi = (raw: string): string => {
  const d = extractDigits(raw);
  return d.length === 10 ? `+7${d}` : '';
};

/**
 * Проверяет, что строка в display-формате.
 */
export const isDisplayFormat = (raw: string): boolean =>
  PHONE_DISPLAY_REGEX.test(raw);

/**
 * Проверяет, что строка в API-формате (10 цифр после +7).
 */
export const isApiFormat = (raw: string): boolean => PHONE_API_REGEX.test(raw);
