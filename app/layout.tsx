import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { BEFORE_SEND } from "@/lib/analytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retake",
  description: "Edit a video by editing its transcript. Cut words, rewrite lines, and the speaker's lips follow.",
};

export const viewport: Viewport = { themeColor: "#1d2026" };

// Analytics are off unless the server has an Umami website id (see SETUP.md).
const umamiId = process.env.UMAMI_WEBSITE_ID?.trim();
const umamiSrc = process.env.UMAMI_SCRIPT_URL?.trim() || "https://cloud.umami.is/script.js";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Schibsted+Grotesk:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        {children}
        {umamiId && (
          <>
            <Script id="umami-before-send" strategy="beforeInteractive">
              {BEFORE_SEND}
            </Script>
            <Script src={umamiSrc} data-website-id={umamiId} data-before-send="retakeBeforeSend" strategy="afterInteractive" />
          </>
        )}
      </body>
    </html>
  );
}
