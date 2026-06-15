import type { CouponSeed } from './types';

/** Sample coupons. Idempotent via the unique `code`. */
export const coupons: CouponSeed[] = [
  {
    code: 'WELCOME10',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    minimumOrder: 50,
    usageLimit: 1000,
    isActive: true,
  },
  {
    code: 'FLAT25',
    discountType: 'FIXED',
    discountValue: 25,
    minimumOrder: 150,
    usageLimit: 500,
    isActive: true,
  },
  {
    code: 'SAVE15',
    discountType: 'PERCENTAGE',
    discountValue: 15,
    minimumOrder: 200,
    isActive: true,
  },
];
