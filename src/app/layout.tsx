import type { Metadata } from "next";
import "./globals.css";
//import VisualEditsMessenger from "../visual-edits/VisualEditsMessenger";
import ErrorReporter from "@/components/ErrorReporter";
import Script from "next/script";
import DatabaseInitializer from "@/components/DatabaseInitializer"; // ✅ ADD THIS LINE

export const metadata: Metadata = {
  title: "Ocean Brew Drink Control",
  description: "Order Taking, Barista Queue & Sales Tracking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <DatabaseInitializer /> {/* ✅ ADD THIS LINE - INITIALIZES DATABASE */}
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
        {children}
        {/* <VisualEditsMessenger /> */}
      </body>
    </html>
  );
}