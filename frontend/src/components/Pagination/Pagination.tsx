import ReactPaginateDefault from "react-paginate";
import styles from "./Pagination.module.css";

// react-paginate 8 ships a UMD/CJS bundle ({ __esModule: true, default: ... }).
// Under Vite's interop the default import can resolve to that namespace object
// instead of the component, so normalise to the component itself.
const ReactPaginate =
  (ReactPaginateDefault as unknown as { default?: typeof ReactPaginateDefault })
    .default ?? ReactPaginateDefault;

interface PaginationProps {
  /** Total number of pages (`meta.total_pages`). */
  pageCount: number;
  /** Current page, 1-based (`meta.page`). */
  currentPage: number;
  /** Emits a 1-based page number. */
  onPageChange: (page: number) => void;
}

/**
 * Reusable wrapper around `react-paginate`. The library is 0-based, so we pass
 * `forcePage={currentPage - 1}` and map `selected -> selected + 1` on the way
 * out. Renders nothing for a single page.
 */
function Pagination({ pageCount, currentPage, onPageChange }: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <ReactPaginate
      pageCount={pageCount}
      forcePage={currentPage - 1}
      onPageChange={({ selected }) => onPageChange(selected + 1)}
      previousLabel="Prev"
      nextLabel="Next"
      pageRangeDisplayed={1}
      marginPagesDisplayed={1}
      breakLabel="…"
      containerClassName={styles.pagination}
      pageClassName={styles.page}
      pageLinkClassName={styles.pageLink}
      activeClassName={styles.active}
      previousClassName={styles.nav}
      nextClassName={styles.nav}
      previousLinkClassName={styles.navLink}
      nextLinkClassName={styles.navLink}
      breakClassName={styles.break}
      disabledClassName={styles.disabled}
    />
  );
}

export default Pagination;
