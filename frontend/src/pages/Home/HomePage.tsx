import { useNavigate } from "react-router-dom";
import heroBanner from "../../assets/hero_section.png";
import styles from "./Home.module.css";

/**
 * Landing surface after login. Renders inside `MainLayout` (navbar + global
 * footer). A full-width banner (with two interactive overlay hotspots aligned to
 * the artwork's baked-in buttons) sits above five themed product-card rows.
 *
 * Per spec 010, the section cards are STATIC: image URLs are taken verbatim from
 * the raw spec TSX and each card navigates to a real category slug (the raw
 * TSX's `Clothing`/`Shoes`/`Mobile`/`Laptop` targets are not valid slugs and are
 * remapped to `clothing`/`footwear`/`mobile-phones`/`laptops`). No backend fetch.
 */

interface HomeCard {
  image: string;
  alt: string;
  /** Valid `:category` slug from `constants/categories.ts`. */
  category: string;
}

interface HomeSection {
  title: string;
  cards: HomeCard[];
}

const HOME_SECTIONS: HomeSection[] = [
  {
    title: "Popular Picks",
    cards: [
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/860/image/2d9d8c9fb492dd38.jpg?q=60",
        alt: "Popular pick 1",
        category: "clothing",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/860/image/1821d69e76ee8892.jpg?q=60",
        alt: "Popular pick 2",
        category: "clothing",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/860/image/7438ed63ded19b99.jpg?q=60",
        alt: "Popular pick 3",
        category: "clothing",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/860/image/e0163ef246e375bc.jpg?q=60",
        alt: "Popular pick 4",
        category: "clothing",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/860/image/ac8e277f653c7994.jpg?q=60",
        alt: "Popular pick 5",
        category: "clothing",
      },
    ],
  },
  {
    title: "Wear Your Favourite Team",
    cards: [
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/1060/image/5bd22dbdc21e57ac.jpg?q=60",
        alt: "Team jersey 1",
        category: "clothing",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/1060/image/f78294dc8af98998.jpg?q=60",
        alt: "Team jersey 2",
        category: "clothing",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/1060/image/4d68f2710ca6c253.jpg?q=60",
        alt: "Team jersey 3",
        category: "clothing",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/1060/image/47823f658f5280b9.jpg?q=60",
        alt: "Team jersey 4",
        category: "clothing",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/1060/image/788bfcb9db241fa8.jpg?q=60",
        alt: "Team jersey 5",
        category: "clothing",
      },
    ],
  },
  {
    title: "Style in Motion",
    cards: [
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/1668/2220/image/6d37add41d213973.jpg?q=60",
        alt: "Sportswear",
        category: "clothing",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/1668/2220/image/f7dbce57472cf8a8.jpg?q=60",
        alt: "Crocs",
        category: "footwear",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/1668/2220/image/7cd6d63ca018fdc8.jpg?q=60",
        alt: "Sneakers",
        category: "footwear",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/1668/2220/image/36f634428837c2a8.png?q=60",
        alt: "Casual wear",
        category: "clothing",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/1668/2220/image/c149e2ffa7bf5083.jpg?q=60",
        alt: "Streetwear",
        category: "clothing",
      },
    ],
  },
  {
    title: "Mobiles",
    cards: [
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/800/image/d9b00e8caa4f3277.jpg?q=60",
        alt: "Realme P4",
        category: "mobile-phones",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/800/image/5d530d8223692ec0.jpg?q=60",
        alt: "Realme P4 Power",
        category: "mobile-phones",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/800/image/066e945b8dd4dfd8.jpg?q=60",
        alt: "Samsung S25",
        category: "mobile-phones",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/800/image/74b3945b833bf02c.jpg?q=60",
        alt: "iPhone 17",
        category: "mobile-phones",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/800/image/4f92df0f8d1e5b61.jpg?q=60",
        alt: "Galaxy F70e",
        category: "mobile-phones",
      },
    ],
  },
  {
    title: "Laptops",
    cards: [
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/1060/image/2451ec5d7348a2d5.png?q=60",
        alt: "HP Victus",
        category: "laptops",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/1060/image/4e3df072a908cf94.png?q=60",
        alt: "Dell next-gen AI PC",
        category: "laptops",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/1060/image/60125891fd394d41.png?q=60",
        alt: "Lenovo Yoga AI PC",
        category: "laptops",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/1060/image/0cc1b052716ac056.png?q=60",
        alt: "Premium laptop",
        category: "laptops",
      },
      {
        image:
          "https://rukminim2.flixcart.com/fk-p-flap/700/1060/image/778ab5c5b67356c9.png?q=60",
        alt: "Acer Swift Neo",
        category: "laptops",
      },
    ],
  },
];

/** Both banner buttons lead to the full product listing. */
const BANNER_TARGET = "/product/All";

function HomePage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <section className={styles.banner} aria-label="Featured">
        <img
          src={heroBanner}
          alt="Discover everything you love, faster."
          className={styles.bannerImage}
          fetchPriority="high"
        />
        {/* Transparent hotspots aligned to the artwork's baked-in buttons.
            Percentage positioning so they track the buttons as the image scales. */}
        <button
          type="button"
          className={`${styles.bannerHotspot} ${styles.bannerHotspotStart}`}
          aria-label="Start finding products"
          onClick={() => navigate(BANNER_TARGET)}
        />
        <button
          type="button"
          className={`${styles.bannerHotspot} ${styles.bannerHotspotBrowse}`}
          aria-label="Browse all categories"
          onClick={() => navigate(BANNER_TARGET)}
        />
      </section>

      {HOME_SECTIONS.map((section) => (
        <section key={section.title} className={styles.section}>
          <h2 className={styles.sectionHeader}>{section.title}</h2>
          <div className={styles.cardRow}>
            {section.cards.map((card) => (
              <button
                type="button"
                key={card.image}
                className={styles.card}
                onClick={() => navigate(`/product/${card.category}`)}
                aria-label={`${card.alt} — shop ${card.category}`}
              >
                <img
                  src={card.image}
                  alt={card.alt}
                  loading="lazy"
                  className={styles.cardImage}
                  onError={(event) => {
                    // External CDN images can 403/404 — hide the broken-image
                    // glyph and let the card's surface background show instead.
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default HomePage;
