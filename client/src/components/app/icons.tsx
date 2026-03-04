/* Brand icons served from /public — no inline SVG, no icon libraries */

export function Mail() {
  return (
    <img
      src="/gmail.svg"
      alt="Gmail"
      width={46}
      height={46}
      aria-hidden="true"
      data-testid="icon-mail"
      style={{ objectFit: "contain" }}
    />
  );
}

export function NotionLogoIcon() {
  return (
    <img
      src="/notion.svg"
      alt="Notion"
      width={46}
      height={46}
      aria-hidden="true"
      data-testid="icon-notion"
      style={{ objectFit: "contain" }}
    />
  );
}
