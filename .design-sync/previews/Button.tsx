import { Button } from "frontend";
import { ShoppingCart, Trash2 } from "lucide-react";

export const Variants = () => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <Button variant="primary">Proceed to Checkout</Button>
    <Button variant="secondary">View order</Button>
    <Button variant="danger">Cancel order</Button>
    <Button variant="ghost">Clear filters</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const WithIcon = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button leadingIcon={<ShoppingCart size={16} />}>Add to Cart</Button>
    <Button variant="danger" leadingIcon={<Trash2 size={16} />}>
      Remove
    </Button>
  </div>
);

export const Disabled = () => <Button disabled>Out of stock</Button>;
