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
      {showPromoBanner && <PromoBanner />}
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;
