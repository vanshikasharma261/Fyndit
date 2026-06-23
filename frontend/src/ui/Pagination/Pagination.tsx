import ReactPaginateDefault from "react-paginate";
import styles from "./Pagination.module.css";

// react-paginate 8 ships a UMD/CJS bundle ({ __esModule: true, default: ... }).
// Under bundler interop the default import can resolve to that namespace object
// instead of the component, so normalise to the component itself.
const ReactPaginate =
  (ReactPaginateDefault as unknown as { default?: typeof ReactPaginateDefault })
    .default ?? ReactPaginateDefault;

export interface PaginationProps {
  /** Total number of pages. */
  pageCount: number;
  /** Current page, 1-based. */
  currentPage: number;
  /** Emits a 1-based page number. */
  onPageChange: (page: number) => void;
}

/**
 * Page navigation with Prev/Next, numbered pages, and ellipsis. The active page
 * uses the primary color. Renders nothing for a single page.
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
