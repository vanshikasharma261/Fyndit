import { Pagination } from "frontend";

const noop = () => {};

export const Middle = () => (
  <Pagination pageCount={8} currentPage={3} onPageChange={noop} />
);

export const FirstPage = () => (
  <Pagination pageCount={5} currentPage={1} onPageChange={noop} />
);
