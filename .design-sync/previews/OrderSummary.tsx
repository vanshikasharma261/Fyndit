import { OrderSummary, Card } from "frontend";

export const CartSummary = () => (
  <div style={{ width: 320 }}>
    <Card>
      <OrderSummary
        title="ORDER SUMMARY"
        rows={[
          { label: "Subtotal", value: "$248.00" },
          { label: "Discount", value: "-$31.00", positive: true },
          { label: "Shipping", value: "Free" },
        ]}
        total="$217.00"
        savings="You're saving $31.00 on this order"
      />
    </Card>
  </div>
);

export const NoSavings = () => (
  <div style={{ width: 320 }}>
    <Card>
      <OrderSummary
        title="ORDER SUMMARY"
        rows={[
          { label: "Subtotal", value: "$59.00" },
          { label: "Shipping", value: "$5.00" },
        ]}
        total="$64.00"
      />
    </Card>
  </div>
);
