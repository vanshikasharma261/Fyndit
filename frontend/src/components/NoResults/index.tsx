import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../ui";
import { ProductMessages } from "../../constants/messages.constant";
import styles from "./NoResults.module.css";

export interface NoResultsProps {
  /** Active search term; shown in a "Searched for …" pill when present. */
  searchQuery?: string;
  /** Render the "Searched for [query]" pill (also needs `searchQuery`). Defaults to true. */
  showQuery?: boolean;
  /** Render the search-tips list under the call-to-action. Defaults to false. */
  showTips?: boolean;
}

/**
 * Empty state for product search / filtered listings that returned nothing.
 * Mirrors the design-system `EmptyState` scale, adds a search-term pill and
 * optional tips, and reuses the accent `Button` for the recovery action.
 */
function NoResults({
  searchQuery,
  showQuery = true,
  showTips = false,
}: NoResultsProps) {
  const navigate = useNavigate();
  const hasQuery = showQuery && Boolean(searchQuery);

  return (
    <div className={styles.root}>
      <div className={styles.art} aria-hidden="true">
        <Search size={36} strokeWidth={1.75} />
      </div>

      <h2 className={styles.title}>{ProductMessages.emptyResults}</h2>
      <p className={styles.subtitle}>{ProductMessages.emptyResultsBody}</p>

      {hasQuery && (
        <p className={styles.queryPill}>
          {ProductMessages.searchedFor}
          <span className={styles.queryTerm}>{searchQuery}</span>
        </p>
      )}

      <div className={styles.action}>
        <Button variant="primary" onClick={() => navigate("/product/All")}>
          {ProductMessages.browseAll}
        </Button>
      </div>

      {showTips && (
        <ul className={styles.tips}>
          {ProductMessages.searchTips.map((tip) => (
            <li key={tip} className={styles.tip}>
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NoResults;
