/**
 * Fyndit UI — the presentational component library.
 *
 * Pure, prop-driven building blocks extracted from the Fyndit app, decoupled
 * from Redux/Router/services so they render standalone (Claude Design, tests,
 * future reuse). Importing this entrypoint also pulls in the design tokens.
 */
import "./tokens.css";

export { default as Button } from "./Button/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button/Button";

export { default as Badge } from "./Badge/Badge";
export type { BadgeProps, BadgeTone } from "./Badge/Badge";

export { default as StatusBadge } from "./StatusBadge/StatusBadge";
export type { StatusBadgeProps, OrderStatus } from "./StatusBadge/StatusBadge";

export { default as PriceTag } from "./PriceTag/PriceTag";
export type { PriceTagProps } from "./PriceTag/PriceTag";

export { default as Card } from "./Card/Card";
export type { CardProps } from "./Card/Card";

export { default as ProductCard } from "./ProductCard/ProductCard";
export type { ProductCardProps } from "./ProductCard/ProductCard";

export { default as QuantityStepper } from "./QuantityStepper/QuantityStepper";
export type { QuantityStepperProps } from "./QuantityStepper/QuantityStepper";

export { default as TextField } from "./TextField/TextField";
export type { TextFieldProps } from "./TextField/TextField";

export { default as SelectField } from "./SelectField/SelectField";
export type {
  SelectFieldProps,
  SelectOption,
} from "./SelectField/SelectField";

export { default as OrderSummary } from "./OrderSummary/OrderSummary";
export type { OrderSummaryProps, SummaryRow } from "./OrderSummary/OrderSummary";

export { default as EmptyState } from "./EmptyState/EmptyState";
export type { EmptyStateProps } from "./EmptyState/EmptyState";

export { default as Pagination } from "./Pagination/Pagination";
export type { PaginationProps } from "./Pagination/Pagination";

export { default as FilterSidebar } from "./FilterSidebar/FilterSidebar";
export type {
  FilterSidebarProps,
  ProductFilters,
  AttributeFacet,
} from "./FilterSidebar/FilterSidebar";

export { default as AddressCard } from "./AddressCard/AddressCard";
export type { AddressCardProps, Address } from "./AddressCard/AddressCard";

export { default as Timeline } from "./Timeline/Timeline";
export type {
  TimelineProps,
  TimelineStep,
  TimelineStepState,
} from "./Timeline/Timeline";
