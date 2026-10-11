import {
  formatDate,
  formatDateTime,
  formatFileSize,
  formatRupiah,
  formatScore,
  initials,
  parseScore,
} from './format';

describe('formatScore', () => {
  it('uses a decimal comma and one decimal', () => {
    expect(formatScore(3.2)).toBe('3,2');
    expect(formatScore(3)).toBe('3,0');
    expect(formatScore(null)).toBe('—');
  });
});

describe('parseScore', () => {
  it('accepts comma or dot and normalises', () => {
    expect(parseScore('3,2')).toBe(3.2);
    expect(parseScore('3.2')).toBe(3.2);
    expect(parseScore(' 4 ')).toBe(4);
  });

  it('rejects out-of-range or malformed input', () => {
    expect(parseScore('4,1')).toBeNull();
    expect(parseScore('5')).toBeNull();
    expect(parseScore('3,25')).toBeNull();
    expect(parseScore('-1')).toBeNull();
    expect(parseScore('')).toBeNull();
  });
});

describe('dates and numbers', () => {
  it('formats Indonesian dates', () => {
    expect(formatDate('2027-04-06')).toBe('6 Apr 2027');
    expect(formatDate('2027-08-17T10:00:00')).toBe('17 Agu 2027');
    expect(formatDateTime('2027-10-12T09:41:00')).toBe('12 Okt 2027 09.41');
  });

  it('formats rupiah, file sizes, and initials', () => {
    expect(formatRupiah(4250000000)).toBe('Rp 4.250.000.000');
    expect(formatFileSize(1258291)).toBe('1,2 MB');
    expect(formatFileSize(655360)).toBe('640 KB');
    expect(initials('Andi Wirawan')).toBe('AW');
    expect(initials('Admin DKB Pusat')).toBe('AD');
  });
});
