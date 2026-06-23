import { PriceTag } from "frontend";

export const Plain = () => <PriceTag price={49} />;

export const Discounted = () => <PriceTag price={89} compareAt={120} />;

export const Large = () => <PriceTag price={89} compareAt={120} size="lg" />;
