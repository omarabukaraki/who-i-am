import "./globals.css";
import SiteAudio from "./site-audio";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata = {
  title: "خمّن من أنا",
  description: "لعبة تخمين صور محلية للاعبين",
  metadataBase: new URL(appUrl),
  openGraph: {
    title: "خمّن من أنا",
    description: "لعبة تخمين صور محلية للاعبين",
    type: "website",
    images: [
      {
        url: "/images/cover.png",
        width: 768,
        height: 1365,
        alt: "غلاف لعبة خمّن من أنا"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "خمّن من أنا",
    description: "لعبة تخمين صور محلية للاعبين",
    images: ["/images/cover.png"]
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon_io/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon_io/favicon-16x16.png", sizes: "16x16", type: "image/png" }
    ],
    apple: [{ url: "/favicon_io/apple-touch-icon.png", sizes: "180x180" }],
    other: [
      {
        rel: "manifest",
        url: "/favicon_io/site.webmanifest"
      }
    ]
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>
        <SiteAudio />
        {children}
      </body>
    </html>
  );
}
