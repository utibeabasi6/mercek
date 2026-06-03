import type { ButtonHTMLAttributes } from "react";

// The one icon-button standard for the app's chrome. `md` (default) is for the
// titlebar, panel and dialog headers; `sm` is for inline/row actions. Sizing lives
// here so every icon stays consistent — change it once, it changes everywhere.
type IconButtonSize = "sm" | "md";

// Glyphs are unicode (their ink sits well below the font-size), so these run a
// little larger than an SVG icon would. md ≈ a 24px toolbar icon in a 36px target;
// sm for dense inline/row actions.
const SIZES: Record<IconButtonSize, string> = {
  sm: "size-6 text-[18px]",
  md: "size-9 text-[28px]",
};

export function IconButton({
  size = "md",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: IconButtonSize }) {
  return (
    <button
      type="button"
      className={`flex shrink-0 items-center justify-center rounded leading-none text-fg-muted transition duration-150 hover:bg-bg-elev-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
