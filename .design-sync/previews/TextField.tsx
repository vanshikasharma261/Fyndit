import { TextField } from "frontend";

export const Default = () => (
  <div style={{ width: 320 }}>
    <TextField label="Full name" placeholder="Jane Doe" />
  </div>
);

export const Filled = () => (
  <div style={{ width: 320 }}>
    <TextField label="Email" defaultValue="jane@fyndit.com" />
  </div>
);

export const WithError = () => (
  <div style={{ width: 320 }}>
    <TextField label="ZIP code" defaultValue="12" error="Enter a valid 5-digit ZIP." />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 320 }}>
    <TextField label="Country" defaultValue="United States" disabled />
  </div>
);
