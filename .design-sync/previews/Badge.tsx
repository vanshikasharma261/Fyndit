import { Badge } from "frontend";

export const Tones = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <Badge tone="accent">-20%</Badge>
    <Badge tone="primary">New</Badge>
    <Badge tone="success">In stock</Badge>
    <Badge tone="error">Sold out</Badge>
    <Badge tone="neutral">Refurbished</Badge>
  </div>
);
