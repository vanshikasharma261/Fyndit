import { SelectField } from "frontend";

const states = [
  { value: "CA", label: "California" },
  { value: "NY", label: "New York" },
  { value: "TX", label: "Texas" },
];

export const Default = () => (
  <div style={{ width: 320 }}>
    <SelectField label="State" options={states} placeholder="Select a state" />
  </div>
);

export const Selected = () => (
  <div style={{ width: 320 }}>
    <SelectField label="State" options={states} defaultValue="NY" />
  </div>
);

export const WithError = () => (
  <div style={{ width: 320 }}>
    <SelectField
      label="State"
      options={states}
      placeholder="Select a state"
      error="State is required."
    />
  </div>
);
