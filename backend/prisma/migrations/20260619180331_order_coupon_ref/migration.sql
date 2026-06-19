-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "coupon_id" UUID;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "Coupon"("coupon_id") ON DELETE SET NULL ON UPDATE CASCADE;
