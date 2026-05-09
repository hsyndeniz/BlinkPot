import Image from "next/image";

type Icon = {
  src: string;
  /** CSS top/left as % of viewport. */
  x: string;
  y: string;
  /** Rendered width/height in px. */
  size: number;
  /** Rotation in degrees. */
  rotate: number;
};

// Hand-picked scatter so the layout is stable across renders (no Math.random
// during SSR). Mix of all icons + varying sizes + tilts so it reads "organic".
const ICONS: Icon[] = [
  { src: "/ball.png", x: "6%", y: "6%", size: 72, rotate: -14 },
  { src: "/dollar.png", x: "78%", y: "10%", size: 80, rotate: 18 },
  { src: "/gift.png", x: "32%", y: "14%", size: 56, rotate: -22 },
  { src: "/money.png", x: "92%", y: "24%", size: 64, rotate: 8 },
  { src: "/money-bag.png", x: "12%", y: "26%", size: 84, rotate: 24 },
  { src: "/gift-box.png", x: "54%", y: "30%", size: 52, rotate: -8 },
  { src: "/ball.png", x: "84%", y: "42%", size: 76, rotate: 12 },
  { src: "/dollar.png", x: "4%", y: "48%", size: 56, rotate: -28 },
  { src: "/money.png", x: "40%", y: "52%", size: 72, rotate: 14 },
  { src: "/gift.png", x: "68%", y: "58%", size: 60, rotate: -18 },
  { src: "/money-bag.png", x: "20%", y: "66%", size: 80, rotate: 22 },
  { src: "/ball.png", x: "88%", y: "70%", size: 60, rotate: -10 },
  { src: "/gift-box.png", x: "48%", y: "76%", size: 84, rotate: 26 },
  { src: "/dollar.png", x: "10%", y: "84%", size: 52, rotate: 14 },
  { src: "/money.png", x: "76%", y: "88%", size: 72, rotate: -26 },
  { src: "/gift.png", x: "32%", y: "92%", size: 56, rotate: 6 },
];

export function LotteryBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {ICONS.map((icon, i) => (
        <Image
          key={i}
          src={icon.src}
          alt=""
          width={icon.size}
          height={icon.size}
          className="absolute opacity-[0.1] dark:opacity-[0.1]"
          style={{
            left: icon.x,
            top: icon.y,
            transform: `rotate(${icon.rotate}deg)`,
          }}
          priority={false}
        />
      ))}
    </div>
  );
}
