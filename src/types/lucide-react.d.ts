// lucide-react@1.17.0 ships no bundled types; declare the icons we use so the
// strict TS build resolves them. (Runtime exports come from the package's ESM barrel.)
declare module "lucide-react" {
  import type { ComponentType, SVGProps } from "react";

  export type LucideProps = SVGProps<SVGSVGElement> & {
    size?: number | string;
    absoluteStrokeWidth?: boolean;
  };
  export type LucideIcon = ComponentType<LucideProps>;

  export const RefreshCw: LucideIcon;
  export const Settings: LucideIcon;
  export const X: LucideIcon;
  export const Plus: LucideIcon;
  export const Moon: LucideIcon;
  export const Sun: LucideIcon;
  export const History: LucideIcon;
  export const Bot: LucideIcon;
  export const Sparkles: LucideIcon;
  export const Boxes: LucideIcon;
  export const Box: LucideIcon;
  export const Container: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const Wrench: LucideIcon;
  export const Trash2: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const Bell: LucideIcon;
  export const Send: LucideIcon;
  export const Square: LucideIcon;
  export const LayoutDashboard: LucideIcon;
  export const ExternalLink: LucideIcon;
}
