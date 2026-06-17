import styles from "./Placeholder.module.css";

interface PlaceholderPageProps {
  title: string;
}

/**
 * Lightweight stand-in for pages whose full feature lands later (Profile,
 * Orders, Cart). Renders inside `MainLayout` so the dropdown links navigate to
 * a real, titled route today.
 */
function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>This page is coming soon.</p>
    </div>
  );
}

export default PlaceholderPage;
