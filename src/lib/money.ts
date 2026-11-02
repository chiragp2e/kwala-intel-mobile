/**
 * Rupee formatting from integer paise, with Indian digit grouping (12,34,567).
 * No floating-point arithmetic touches a currency value: everything is split
 * with integer division. Written by hand because Intl support differs by device.
 */
export function formatInr(paise: number): string {
  const negative = paise < 0;
  const abs = Math.round(Math.abs(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;
  const s = String(rupees);
  const grouped = s.length <= 3 ? s : `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${s.slice(-3)}`;
  const decimals = fraction === 0 ? '' : `.${String(fraction).padStart(2, '0')}`;
  return `${negative ? '-' : ''}₹${grouped}${decimals}`;
}
