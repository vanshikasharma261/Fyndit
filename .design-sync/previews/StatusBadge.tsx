import { StatusBadge } from "frontend";

export const AllStatuses = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <StatusBadge status="PENDING" />
    <StatusBadge status="CONFIRMED" />
    <StatusBadge status="PACKED" />
    <StatusBadge status="SHIPPED" />
    <StatusBadge status="DELIVERED" />
    <StatusBadge status="CANCELLED" />
  </div>
);
