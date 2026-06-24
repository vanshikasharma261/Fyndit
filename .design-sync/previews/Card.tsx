import { Card } from "frontend";

export const Soft = () => (
  <div style={{ width: 320 }}>
    <Card>
      <h3 style={{ margin: "0 0 8px", color: "var(--color-text)" }}>Order Summary</h3>
      <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
        A white surface with a soft border and an elevation shadow — the base of
        summaries, panels, and item cards.
      </p>
    </Card>
  </div>
);

export const Flat = () => (
  <div style={{ width: 320 }}>
    <Card elevation="flat">
      <p style={{ margin: 0, color: "var(--color-text)", fontSize: "0.9rem" }}>
        Flat card — border only, no shadow. For nested or dense layouts.
      </p>
    </Card>
  </div>
);
