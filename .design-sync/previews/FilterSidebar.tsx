import { FilterSidebar } from "frontend";

const filters = {
  price: { min: 0, max: 500 },
  attributes: [
    { name: "size", label: "Size", values: ["XS", "S", "M", "L", "XL"] },
    { name: "color", label: "Color", values: ["Black", "White", "Blue", "Orange"] },
  ],
};

const noop = () => {};

export const Default = () => (
  <div style={{ width: 260, height: 440 }}>
    <FilterSidebar
      filters={filters}
      selectedAttributes={{ size: ["M"], color: ["Orange"] }}
      selectedMaxPrice={320}
      onMaxPriceChange={noop}
      onToggleAttribute={noop}
      onClear={noop}
    />
  </div>
);
