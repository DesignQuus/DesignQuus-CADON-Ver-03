/**
 * 전화번호 및 휴대폰 번호 자릿수 자동 하이픈('-') 포매터
 *
 * 지원 형식:
 * - 휴대폰 번호 (010, 011, 016, 017, 018, 019):
 *   - 11자리: 010-1234-5678
 *   - 10자리: 011-123-4567
 * - 서울 지역번호 (02):
 *   - 10자리: 02-1234-5678
 *   - 9자리:  02-123-4567
 * - 일반 지역번호 및 인터넷전화 (031, 032, 051, 070 등 3자리):
 *   - 10자리: 031-123-4567
 *   - 11자리: 031-1234-5678
 * - 전국 대표번호 (1588, 1544, 1600 등 8자리):
 *   - 8자리:  1588-1234
 */
export function formatPhoneNumber(val: string | null | undefined): string {
  if (!val) return '';
  const clean = val.replace(/[^0-9]/g, '');
  if (!clean) return '';

  // 1. 전국 대표번호 (15xx, 16xx, 18xx 등 8자리, 0으로 시작하지 않는 경우)
  if (!clean.startsWith('0')) {
    if (clean.length <= 4) return clean;
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  }

  // 2. 서울 지역번호 (02)
  if (clean.startsWith('02')) {
    if (clean.length <= 2) return clean;
    if (clean.length <= 5) return `${clean.slice(0, 2)}-${clean.slice(2)}`;
    if (clean.length <= 8) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
    if (clean.length === 9) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
    return `${clean.slice(0, 2)}-${clean.slice(2, 6)}-${clean.slice(6, 10)}`;
  }

  // 3. 휴대폰 및 기타 지역번호 (010, 031, 070 등 3자리 접두사)
  if (clean.length <= 3) return clean;
  if (clean.length <= 7) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  if (clean.length <= 10) {
    if (clean.startsWith('010')) {
      return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7)}`;
    }
    // 031-123-4567, 011-123-4567 등
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  // 11자리: 010-1234-5678 (최대 11자리 제한)
  return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7, 11)}`;
}
