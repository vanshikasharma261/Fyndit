import { ProductCard } from "frontend";

// Inline gradient image so the card renders fully offline in the headless check.
const img =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>` +
      `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
      `<stop offset='0' stop-color='#243460'/><stop offset='1' stop-color='#ff5c35'/>` +
      `</linearGradient></defs><rect width='300' height='300' fill='url(#g)'/></svg>`,
  );

export const WithDiscount = () => (
  <div style={{ width: 240 }}>
    <ProductCard
      name="Aurora Running Shoe"
      brand="Fyndit Sport"
      description="Lightweight daily trainer with a responsive foam midsole."
      imageUrl={img}
      price={89}
      compareAt={120}
    />
  </div>
);

export const NoImage = () => (
  <div style={{ width: 240 }}>
    <ProductCard
      name="Studio Headphones"
      brand="Fyndit Audio"
      description="Over-ear wireless with active noise cancellation and 30h battery."
      price={199}
    />
  </div>
);
