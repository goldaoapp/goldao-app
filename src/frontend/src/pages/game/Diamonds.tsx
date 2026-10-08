import { cn } from "@/lib/utils";
import { DIAMOND_IMG } from "./game-utils";

/** One diamond with a subtle glint sweeping across it, clipped to the diamond silhouette. */
export function ShinyDiamond({
  className,
  rotate,
  lift,
  delay,
  z,
}: {
  className?: string;
  rotate: number;
  lift: number;
  delay: number;
  z: number;
}) {
  const mask = `url(${DIAMOND_IMG})`;
  return (
    <span
      className={cn("relative block shrink-0", className)}
      style={{
        transform: `rotate(${rotate}deg) translateY(${lift}px)`,
        zIndex: z,
      }}
    >
      <img
        src={DIAMOND_IMG ?? ""}
        alt=""
        className="block w-full object-contain drop-shadow-[0_6px_14px_oklch(0.7_0.14_350/0.4)]"
      />
      <span
        className="diamond-shine"
        style={{
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          animationDelay: `${delay}s`,
        }}
      />
    </span>
  );
}
