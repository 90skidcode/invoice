const ones = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ones[n] ?? '';
  const t = tens[Math.floor(n / 10)] ?? '';
  const o = ones[n % 10] ?? '';
  return o ? `${t} ${o}` : t;
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const hStr = h > 0 ? `${ones[h] ?? ''} Hundred` : '';
  const rStr = rest > 0 ? twoDigits(rest) : '';
  return hStr && rStr ? `${hStr} ` + rStr : hStr || rStr;
}

export function amountInWords(moneyStr: string, currencyName = 'Rupees'): string {
  const [intPart, decPart] = moneyStr.split('.');
  const intVal = Number.parseInt(intPart ?? '0', 10);
  const decVal = Number.parseInt(decPart ? decPart.padEnd(2, '0').slice(0, 2) : '0', 10);

  if (intVal === 0 && decVal === 0) return `${currencyName} Zero Only`;

  let result = '';

  // Indian system: crore, lakh, thousand, hundred
  const crore = Math.floor(intVal / 10_000_000);
  const lakh = Math.floor((intVal % 10_000_000) / 100_000);
  const thousand = Math.floor((intVal % 100_000) / 1_000);
  const remaining = intVal % 1_000;

  if (crore > 0) result += `${threeDigits(crore)} Crore `;
  if (lakh > 0) result += `${twoDigits(lakh)} Lakh `;
  if (thousand > 0) result += `${threeDigits(thousand)} Thousand `;
  if (remaining > 0) result += threeDigits(remaining) + ' ';

  result = `${currencyName} ${result.trim()}`;

  if (decVal > 0) {
    result += ` and ${twoDigits(decVal)} Paise`;
  }

  return result + ' Only';
}
