import { cn } from "@/lib/utils";

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      aria-hidden
      focusable="false"
    >
      <circle cx="16" cy="16" r="16" fill="#25D366" />
      <path
        fill="#fff"
        d="M16.06 6.9c-4.98 0-9.02 3.9-9.02 8.7 0 1.52.4 2.94 1.1 4.2L6.9 25.1l5.56-1.86c1.1.52 2.34.82 3.6.82 4.98 0 9.02-3.9 9.02-8.7s-4.04-8.46-9.02-8.46Zm5.3 11.94c-.22.62-1.14 1.18-1.72 1.3-.4.08-.9.12-1.44-.05-.33-.1-.74-.24-1.24-.44-2.16-.9-3.56-3.06-3.66-3.2-.1-.12-.86-1.16-.86-2.2 0-1.04.54-1.56.74-1.78.18-.2.4-.26.54-.26h.38c.12 0 .28-.02.44.34.18.42.62 1.46.68 1.56.06.1.1.24.02.38-.08.14-.12.24-.24.38-.12.14-.24.3-.34.4-.12.12-.26.26-.12.5.14.24.62 1.02 1.34 1.66.9.8 1.66 1.04 1.9 1.16.24.12.38.1.52-.06.14-.16.6-.68.76-.92.16-.24.32-.2.54-.12.22.08 1.38.66 1.62.78.24.12.4.18.46.28.06.1.06.56-.16 1.18Z"
      />
    </svg>
  );
}

export function GoogleCalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      aria-hidden
      focusable="false"
    >
      <rect x="4" y="5" width="24" height="23" rx="6" fill="#fff" />
      <rect x="4" y="5" width="24" height="7" rx="6" fill="#4285F4" />
      <rect x="4" y="10" width="24" height="2" fill="#4285F4" />
      <rect x="9" y="15" width="14" height="10" rx="3" fill="#E8F0FE" />
      <path
        d="M13.2 23v-1.9h1.8c1.24 0 2.1-.56 2.1-1.52 0-.6-.34-1.04-.9-1.26.46-.22.72-.6.72-1.1 0-.94-.82-1.52-2.04-1.52h-1.68V14H11v9h2.2Zm0-5.5v-1.74h1.44c.58 0 .92.26.92.66 0 .44-.34.68-.94.68h-1.42Zm0 3.5v-1.9h1.56c.66 0 1.06.28 1.06.78 0 .54-.42.82-1.08.82h-1.54Z"
        fill="#4285F4"
      />
      <circle cx="10" cy="8" r="1.4" fill="#34A853" />
      <circle cx="22" cy="8" r="1.4" fill="#EA4335" />
      <circle cx="16" cy="8" r="1.4" fill="#FBBC05" />
    </svg>
  );
}

export function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 3c-5 0-9 3.6-9 8.2C3 16.1 7.1 21 12 21c1.2 0 2-.7 2-1.7 0-.6-.3-1.1-.7-1.5-.3-.3-.5-.6-.5-1 0-.7.6-1.3 1.4-1.3h1.9c3.1 0 5.9-2.3 5.9-5.7C22 6.3 17.7 3 12 3Zm-3.4 9.1c-.7 0-1.2-.5-1.2-1.2s.5-1.2 1.2-1.2 1.2.5 1.2 1.2-.5 1.2-1.2 1.2Zm2.9-3.2c-.7 0-1.2-.5-1.2-1.2s.5-1.2 1.2-1.2 1.2.5 1.2 1.2-.5 1.2-1.2 1.2Zm3.4 0c-.7 0-1.2-.5-1.2-1.2s.5-1.2 1.2-1.2 1.2.5 1.2 1.2-.5 1.2-1.2 1.2Zm2.9 3.2c-.7 0-1.2-.5-1.2-1.2s.5-1.2 1.2-1.2 1.2.5 1.2 1.2-.5 1.2-1.2 1.2Z"
      />
    </svg>
  );
}

export function PlugIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M7 2a1 1 0 0 1 1 1v4h8V3a1 1 0 1 1 2 0v4h1a1 1 0 0 1 0 2h-1v1a6 6 0 0 1-5 5.92V21a1 1 0 1 1-2 0v-3.08A6 6 0 0 1 6 10V9H5a1 1 0 1 1 0-2h1V3a1 1 0 0 1 1-1Zm1 8a4 4 0 0 0 8 0V9H8v1Z"
      />
    </svg>
  );
}

