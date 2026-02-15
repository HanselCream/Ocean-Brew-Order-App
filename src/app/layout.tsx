import type { Metadata } from "next";
import "./globals.css";
import ErrorReporter from "@/components/ErrorReporter";
import Script from "next/script";
import DatabaseInitializer from "@/components/DatabaseInitializer";
import SimplePassword from "@/components/SimplePassword";

export const metadata: Metadata = {
  title: "Ocean Brew POS",
  description: "Point of Sale System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>☕</text></svg>" />
        {/* Simple emoji icon like Baby app */}
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