/* Official brand SVG icons used on the Integrations page.
   Sizes are fixed at 20×20 to match the existing icon container (size-10 / 40px).
   No external CDN — all paths are inlined. */

/** Official Gmail logo (M-envelope mark, multicolor) */
export function Mail() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Gmail"
      aria-hidden="true"
      data-testid="icon-mail"
    >
      {/* white envelope base */}
      <path fill="#fff" d="M4.5 9h39L24 27 4.5 9z" />
      {/* red left flap */}
      <path fill="#EA4335" d="M4.5 9v30h9V20.5L4.5 9z" />
      {/* blue right flap */}
      <path fill="#4285F4" d="M43.5 9v30h-9V20.5L43.5 9z" />
      {/* yellow bottom-left */}
      <path fill="#FBBC05" d="M4.5 39l13.5-10v-8.5L4.5 9v30z" />
      {/* green bottom-right */}
      <path fill="#34A853" d="M43.5 39L30 29V20.5L43.5 9v30z" />
      {/* M-shape: the white diagonal centre */}
      <path fill="#fff" d="M4.5 9L24 27 43.5 9H4.5z" />
      {/* re-draw the coloured flaps over the white to produce the M */}
      <path fill="#EA4335" d="M4.5 9L13.5 20.5V39L4.5 9z" />
      <path fill="#FBBC05" d="M13.5 20.5L24 27l-10.5 12V20.5z" />
      <path fill="#34A853" d="M43.5 9L34.5 20.5V39L43.5 9z" />
      <path fill="#4285F4" d="M34.5 20.5L24 27l10.5 12V20.5z" />
    </svg>
  );
}

/** Official Notion logo (black "N" on white background) */
export function NotionLogoIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Notion"
      aria-hidden="true"
      data-testid="icon-notion"
    >
      <rect width="100" height="100" rx="18" fill="#fff" />
      {/* Notion's bold "N" lettermark */}
      <path
        d="M17.5 14.4c3.1 2.5 4.3 2.3 10.2 1.9l55.5-3.3c1.2 0 .2-1.1-.4-1.4l-9.3-6.7c-1.7-1.3-4-2.8-8.4-2.5L12 6.2C10 6.4 9.6 7.4 10.4 8.2l7.1 6.2zM20.8 26v57.5c0 3.1 1.5 4.3 5 4.1l61-3.5c3.5-.2 4.4-2.3 4.4-4.8V22.5c0-2.5-1-3.8-3.2-3.5l-63.9 3.7c-2.4.2-3.3 1.4-3.3 3.3zm58.6 2.8c.4 1.6 0 3.2-1.6 3.4l-2.7.4V75c-2.3 1.2-4.5 1.9-6.3 1.9-2.9 0-3.6-.9-5.7-3.6L43.5 45.2v28.6l6 1.3s0 3.2-4.5 3.2l-12.3.7c-.4-.8 0-2.7 1.4-3.1l3.6-1V36.2l-5-.4c-.4-1.6.6-3.9 3.1-4.1l13.2-.8 19.9 30.4V33.2l-5.1-.6c-.4-2 1-3.5 2.7-3.6l13.4-.8z"
        fill="#000"
        fillRule="evenodd"
      />
    </svg>
  );
}
