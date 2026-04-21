import { ReactNode } from "react";
import PromoBanner from "./PromoBanner";
import Header from "./Header";
import Footer from "./Footer";

interface LayoutProps {
  children: ReactNode;
  showPromoBanner?: boolean;
}

const Layout = ({ children, showPromoBanner = true }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-50">
        {showPromoBanner && <PromoBanner />}
        <Header />
      </div>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;
