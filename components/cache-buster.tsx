"use client";

import { useEffect } from "react";

// Increment this version whenever you deploy breaking changes
const APP_VERSION = "2.0.0"; // Changed from 1.x to 2.0.0 for audio fixes

export function CacheBuster() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedVersion = localStorage.getItem("app-version");

    if (storedVersion !== APP_VERSION) {
      console.log(`🔄 App version changed: ${storedVersion} → ${APP_VERSION}`);
      console.log("🧹 Clearing old cache and storage...");

      try {
        // 1. Clear all localStorage except auth tokens
        const keysToPreserve = ["sb-", "supabase"]; // Preserve Supabase auth
        const allKeys = Object.keys(localStorage);

        allKeys.forEach((key) => {
          const shouldPreserve = keysToPreserve.some((prefix) =>
            key.startsWith(prefix)
          );
          if (!shouldPreserve) {
            localStorage.removeItem(key);
            console.log(`   Removed: ${key}`);
          }
        });

        // 2. Clear sessionStorage
        sessionStorage.clear();

        // 3. Clear any service workers
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((registration) => {
              registration.unregister();
              console.log("   Unregistered service worker");
            });
          });
        }

        // 4. Set new version
        localStorage.setItem("app-version", APP_VERSION);

        console.log("✅ Cache cleared successfully!");
        console.log("💡 App will use fresh data");

        // Optional: Show a toast notification
        // You can add a toast library later
      } catch (error) {
        console.error("Failed to clear cache:", error);
      }
    }
  }, []);

  return null; // This component doesn't render anything
}
