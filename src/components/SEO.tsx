import { Helmet } from "react-helmet-async";

const SITE_URL = "https://www.personalsonggifts.com";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

interface SEOProps {
  title: string;
  description?: string;
  path?: string;
  noindex?: boolean;
  ogImage?: string;
}

const SEO = ({ title, description, path, noindex, ogImage }: SEOProps) => {
  const url = path ? `${SITE_URL}${path}` : undefined;
  const image = ogImage || DEFAULT_OG_IMAGE;

  return (
    <Helmet>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}

      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {!noindex && url && <link rel="canonical" href={url} />}

      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content="website" />
      {url && <meta property="og:url" content={url} />}
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
};

export default SEO;
