import { AddressCard } from "frontend";

const noop = () => {};

const home = {
  address_type: "HOME",
  line1: "1600 Amphitheatre Pkwy",
  line2: "Suite 200",
  city: "Mountain View",
  state: "CA",
  zip: "94043",
  is_default: true,
};

const work = {
  address_type: "WORK",
  line1: "1 Market St",
  city: "San Francisco",
  state: "CA",
  zip: "94105",
  is_default: false,
};

export const DefaultAddress = () => (
  <div style={{ width: 440 }}>
    <AddressCard address={home} onEdit={noop} onRemove={noop} onSetDefault={noop} />
  </div>
);

export const NonDefault = () => (
  <div style={{ width: 440 }}>
    <AddressCard address={work} onEdit={noop} onRemove={noop} onSetDefault={noop} />
  </div>
);
