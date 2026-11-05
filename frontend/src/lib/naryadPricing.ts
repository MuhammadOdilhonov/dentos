// Rates belong to employees, never patients or catalog services. Zero is valid.
export function doctorRate(value: unknown): number | null {
  if (value == null || value === '') return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
}

export function naryadSplit(price: number, quantity: number, percent: number) {
  const rate = doctorRate(percent);
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1 || rate == null) {
    throw new Error('Naryad narxi, soni yoki shifokor foizi noto‘g‘ri.');
  }
  const total = Math.round(price * quantity * 100) / 100;
  const doctorShare = Math.round(total * rate) / 100;
  return { total, doctorShare, clinicShare: Math.round((total - doctorShare) * 100) / 100 };
}
