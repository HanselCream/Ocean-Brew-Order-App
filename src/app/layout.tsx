import type { Metadata } from "next";
import "./globals.css";
import ErrorReporter from "@/components/ErrorReporter";
import Script from "next/script";
import DatabaseInitializer from "@/components/DatabaseInitializer";
import SimplePassword from "@/components/SimplePassword";

export const metadata: Metadata = {
  title: "Ocean Brew POS",
  description: "Point of Sale System",
  manifest: "/manifest.json", // ✅ ADD THIS
  icons: {
    icon: "/logo.jpg", // ✅ Points to your public/logo.jpg
    apple: "/logo.jpg", // ✅ For iOS
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.jpg" /> {/* ✅ Use your logo */}
        <link rel="apple-touch-icon" href="/logo.jpg" /> {/* ✅ iOS home screen */}
        <link rel="manifest" href="/manifest.json" /> {/* ✅ PWA manifest */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased">
        <SimplePassword>
          <DatabaseInitializer>
            <ErrorReporter />
            <Script
              src="https://slelguoygbfzlpylpxfs.supabase.co/storage/v1/object/public/scripts//route-messenger.js"
              strategy="afterInteractive"
              data-target-origin="*"
              data-message-type="ROUTE_CHANGE"
              data-include-search-params="true"
              data-only-in-iframe="true"
              data-debug="true"
              data-custom-data='{"appName": "Ocean Brew POS", "version": "1.0.0"}'
            />
            {children}
          </DatabaseInitializer>
        </SimplePassword>
      </body>
    </html>
  );
}