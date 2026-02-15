import type { Metadata } from "next";
import "./globals.css";
import ErrorReporter from "@/components/ErrorReporter";
import Script from "next/script";
import DatabaseInitializer from "@/components/DatabaseInitializer";
import SimplePassword from "@/components/SimplePassword";

export const metadata: Metadata = {
  title: "Ocean Brew Drink Control",
  description: "Order Taking, Barista Queue & Sales Tracking",
  manifest: "/manifest.json", // ✅ ADD THIS
  icons: {
    icon: '/logo.jpg',
    apple: '/logo.jpg',
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
        <link rel="icon" href="/logo.jpg" />
        <link rel="apple-touch-icon" href="/logo.jpg" />
        <link rel="manifest" href="/manifest.json" /> {/* ✅ ADD THIS */}
        <meta name="apple-mobile-web-app-capable" content="yes" /> {/* ✅ ADD THIS */}
        <meta name="apple-mobile-web-app-status-bar-style" content="default" /> {/* ✅ ADD THIS */}
      </head>
      <body className="antialiased">
        <SimplePassword>
          <DatabaseInitializer>
            <Script
              id="orchids-browser-logs"
              src="https://slelguoygbfzlpylpxfs.supabase.co/storage/v1/object/public/scripts/orchids-browser-logs.js"
              strategy="afterInteractive"
              data-orchids-project-id="3b71ee96-6e53-40e2-9a8d-a4fd5842eda7"
            />
            <ErrorReporter />
            <Script
              src="https://slelguoygbfzlpylpxfs.supabase.co/storage/v1/object/public/scripts//route-messenger.js"
              strategy="afterInteractive"
              data-target-origin="*"
              data-message-type="ROUTE_CHANGE"
              data-include-search-params="true"
              data-only-in-iframe="true"
              data-debug="true"
              data-custom-data='{"appName": "YourApp", "version": "1.0.0", "greeting": "hi"}'
            />
            {/* Register Service Worker */}
            <Script id="register-sw" strategy="afterInteractive">
              {`
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.register('/sw.js')
                    .then(reg => console.log('✅ Service Worker registered'))
                    .catch(err => console.log('❌ Service Worker error:', err));
                }
              `}
            </Script>
            {children}
          </DatabaseInitializer>
        </SimplePassword>
      </body>
    </html>
  );
}