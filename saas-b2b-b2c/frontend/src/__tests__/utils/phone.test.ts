import {
  formatPhone,
  extractDigits,
  normalizeForApi,
  PHONE_DISPLAY_FORMAT,
} from '@/utils/phone';

describe('phone utils', () => {
  describe('extractDigits', () => {
    it('returns empty string for empty input', () => {
      expect(extractDigits('')).toBe('');
    });

    it('strips all non-digits', () => {
      expect(extractDigits('+7 (999) 123-45-67')).toBe('9991234567');
    });

    it('caps at 10 digits', () => {
      expect(extractDigits('12345678901234')).toBe('1234567890');
    });

    it('handles garbage input', () => {
      expect(extractDigits('abc!@#$%^&*()')).toBe('');
    });
  });

  describe('formatPhone', () => {
    it('formats 10 digits correctly', () => {
      expect(formatPhone('9991234567')).toBe('+7(999)-123-45-67');
    });

    it('formats partial input progressively', () => {
      expect(formatPhone('9')).toBe('+7(9');
      expect(formatPhone('99')).toBe('+7(99');
      expect(formatPhone('999')).toBe('+7(999)');
      expect(formatPhone('9991')).toBe('+7(999)-1');
      expect(formatPhone('999123')).toBe('+7(999)-123-');
      expect(formatPhone('9991234')).toBe('+7(999)-123-4');
      expect(formatPhone('99912345')).toBe('+7(999)-123-45-');
      expect(formatPhone('999123456')).toBe('+7(999)-123-45-6');
    });

    it('returns just +7 for empty input', () => {
      expect(formatPhone('')).toBe('+7');
    });

    it('returns just +7 when only + provided', () => {
      expect(formatPhone('+')).toBe('+7');
    });

    it('strips non-digits from input', () => {
      expect(formatPhone('+7 999 123 45 67')).toBe('+7(999)-123-45-67');
    });

    it('caps at 10 digits after +7', () => {
      expect(formatPhone('9991234567890')).toBe('+7(999)-123-45-67');
    });

    it('exposes the display format constant', () => {
      expect(PHONE_DISPLAY_FORMAT).toBe('+7(XXX)-XXX-XX-XX');
    });
  });

  describe('normalizeForApi', () => {
    it('converts display format to +7XXXXXXXXXX', () => {
      expect(normalizeForApi('+7(999)-123-45-67')).toBe('+79991234567');
    });

    it('handles partial display format', () => {
      expect(normalizeForApi('+7(999)-123')).toBe('');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeForApi('')).toBe('');
    });

    it('returns empty string for +7 prefix only', () => {
      expect(normalizeForApi('+7')).toBe('');
    });

    it('strips non-digits before normalizing', () => {
      expect(normalizeForApi('+7 (999) 123-45-67')).toBe('+79991234567');
    });
  });

  });
