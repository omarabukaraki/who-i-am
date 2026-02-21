import "./globals.css";

export const metadata = {
  title: "Guess What I Am",
  description: "A local 2-player image guessing showdown"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
