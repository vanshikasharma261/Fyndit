import type { TimelineStep } from "../../ui";
import type { OrderStatus } from "../../types/order.types";
import { formatOrderDate } from "../../utils/format";

/** The forward order lifecycle (CANCELLED is a terminal off-path state). */
interface LifecycleEntry {
  status: Exclude<OrderStatus, "CANCELLED">;
  label: string;
}

const LIFECYCLE: LifecycleEntry[] = [
  { status: "PENDING", label: "Placed" },
  { status: "CONFIRMED", label: "Confirmed" },
  { status: "PACKED", label: "Packed" },
  { status: "SHIPPED", label: "Shipped" },
  { status: "DELIVERED", label: "Delivered" },
];

/**
 * Derive timeline steps from an order's single current `status`. Steps before
 * the current status are `complete`, the current one is `current` (or
 * `complete` once `DELIVERED`), later ones are `upcoming`. The "Placed" step
 * carries the order date — the only per-step timestamp available today. A
 * `CANCELLED` order shows just "Placed" (complete) then a terminal "Cancelled"
 * node, since no history records how far it had progressed.
 */
export function buildOrderTimeline(
  status: OrderStatus,
  createdAt: string,
): TimelineStep[] {
  const placedCaption = formatOrderDate(createdAt);

  if (status === "CANCELLED") {
    return [
      {
        id: "PENDING",
        label: "Placed",
        caption: placedCaption,
        state: "complete",
      },
      { id: "CANCELLED", label: "Cancelled", state: "cancelled" },
    ];
  }

  const currentIndex = LIFECYCLE.findIndex((entry) => entry.status === status);

  return LIFECYCLE.map((entry, index) => {
    let state: TimelineStep["state"];
    if (index < currentIndex) {
      state = "complete";
    } else if (index === currentIndex) {
      state = status === "DELIVERED" ? "complete" : "current";
    } else {
      state = "upcoming";
    }

    return {
      id: entry.status,
      label: entry.label,
      caption: entry.status === "PENDING" ? placedCaption : undefined,
      state,
    };
  });
}
