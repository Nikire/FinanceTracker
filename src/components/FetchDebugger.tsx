"use client";

import { useEffect } from "react";

export function FetchDebugger() {
  useEffect(() => {
    const original = window.fetch;
    window.fetch = function (input, init) {
      if (init?.headers) {
        const headers = new Headers(init.headers);
        headers.forEach((value, name) => {
          for (let i = 0; i < value.length; i++) {
            if (value.charCodeAt(i) > 255) {
              console.error(
                `[FetchDebugger] Header "${name}" has non-ISO-8859-1 char at index ${i}: U+${value.charCodeAt(i).toString(16).toUpperCase()} — full value: ${JSON.stringify(value)}`
              );
            }
          }
        });
      }
      return original.apply(this, [input, init] as Parameters<typeof fetch>);
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  return null;
}
