import { Timeline } from "frontend";

export const Shipped = () => (
  <Timeline
    steps={[
      { label: "Placed", caption: "24 Jun", state: "complete" },
      { label: "Confirmed", state: "complete" },
      { label: "Packed", state: "complete" },
      { label: "Shipped", state: "current" },
      { label: "Delivered", state: "upcoming" },
    ]}
  />
);

export const Pending = () => (
  <Timeline
    steps={[
      { label: "Placed", caption: "24 Jun", state: "current" },
      { label: "Confirmed", state: "upcoming" },
      { label: "Packed", state: "upcoming" },
      { label: "Shipped", state: "upcoming" },
      { label: "Delivered", state: "upcoming" },
    ]}
  />
);

export const Delivered = () => (
  <Timeline
    steps={[
      { label: "Placed", caption: "24 Jun", state: "complete" },
      { label: "Confirmed", state: "complete" },
      { label: "Packed", state: "complete" },
      { label: "Shipped", state: "complete" },
      { label: "Delivered", state: "complete" },
    ]}
  />
);

export const Cancelled = () => (
  <Timeline
    steps={[
      { label: "Placed", caption: "24 Jun", state: "complete" },
      { label: "Cancelled", state: "cancelled" },
    ]}
  />
);
