import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement } from "react";

// The one icon-button standard for the app's chrome. `md` (default) is for the
// titlebar, panel and dialog headers; `sm` is for inline/row actions. Only the box
// (hit target) differs by size — the glyph is a single consistent 15px everywhere,
// matching the navbar/theme-toggle weight. A single icon child is auto-sized; pass
// multiple (e.g. a hover swap) pre-sized.
type IconButtonSize = "sm" | "md";

const BOX: Record<IconButtonSize, string> = { sm: "size-6", md: "size-8" };
export const ICON_PX: Record<IconButtonSize, number> = { sm: 15, md: 15 };

export function IconButton({
  size = "md",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: IconButtonSize }) {
  const icon =
    isValidElement(children) && typeof children.type !== "string"
      ? cloneElement(children as ReactElement<{ size?: number }>, {
          size: (children.props as { size?: number }).size ?? ICON_PX[size],
        })
      : children;
  return (
    <button
      type="button"
      className={`flex shrink-0 items-center justify-center rounded text-fg-muted transition duration-150 hover:bg-bg-elev-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${BOX[size]} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
}
