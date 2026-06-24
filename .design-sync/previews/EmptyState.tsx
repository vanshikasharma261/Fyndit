import { EmptyState, Button } from "frontend";
import { ShoppingCart } from "lucide-react";

export const EmptyCart = () => (
  <EmptyState
    art={<ShoppingCart size={64} strokeWidth={1.5} />}
    title="Your cart is empty"
    description="Browse the catalog and add items to get started."
    action={<Button>Continue shopping</Button>}
  />
);
