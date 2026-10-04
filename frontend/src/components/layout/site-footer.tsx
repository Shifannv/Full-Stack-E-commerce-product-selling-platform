import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="store-footer mt-auto">
      <div className="site-container">
        <div className="footer-main">
          <div className="footer-story"><h2>Find your<br /><em>everyday.</em></h2><p>Pieces to wear. Finds to make your own.</p><Link href="/clothing" className="editorial-link">Explore the Dress edit <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
          <div className="footer-navigation">
            <nav aria-label="Footer collections"><h3>The collection</h3><Link href="/search">Shop all</Link><Link href="/clothing">Dress & clothing</Link><Link href="/search?sort=newest">New arrivals</Link><Link href="/wishlist">Your favourites</Link></nav>
            <nav aria-label="Footer account"><h3>Here for you</h3><Link href="/account">Your account</Link><Link href="/account/addresses">Delivery addresses</Link><Link href="/orders">Orders & tracking</Link><Link href="/returns">Returns & refunds</Link><Link href="/cart">Shopping bag</Link></nav>
          </div>
        </div>
        <div className="footer-bottom"><Link href="/" className="store-wordmark" aria-label="Ownline Dropship home">OWNLINE<span>DROPSHIP</span></Link><p>Considered finds for the everyday.</p><a href="#main-content">Back to top <ArrowUpRight size={16} aria-hidden="true" /></a></div>
      </div>
    </footer>
  );
}
