import { QuantityStepper } from "frontend";

const noop = () => {};

export const States = () => (
  <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
    {/* At minimum — decrement disabled */}
    <QuantityStepper value={1} min={1} max={5} onChange={noop} />
    {/* Mid range */}
    <QuantityStepper value={3} min={1} max={5} onChange={noop} />
    {/* At max stock — increment disabled */}
    <QuantityStepper value={5} min={1} max={5} onChange={noop} />
  </div>
);
