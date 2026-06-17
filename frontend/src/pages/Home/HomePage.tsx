import styles from "./Home.module.css";

/**
 * Placeholder homepage — the landing surface after login. It renders inside
 * `MainLayout` (navbar + footer). The full homepage (hero, categories, product
 * sections) is delivered by a later feature; this establishes the content slot.
 */
function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Welcome to Fyndit</p>
          <h1 className={styles.title}>
            Discover products you&apos;ll love, faster.
          </h1>
          <p className={styles.subtitle}>
            A cleaner, simpler shopping experience. Browse categories, search
            instantly, and check out in seconds.
          </p>
          <button type="button" className={styles.cta}>
            Start shopping
          </button>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
