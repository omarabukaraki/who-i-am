import "./globals.css";
import SiteAudio from "./site-audio";

export const metadata = {
  title: "خمّن من أنا",
  description: "لعبة تخمين صور محلية للاعبين"
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
