"use client";

import { useState } from "react";

export default function GauntletBanner({ initialSrc, alt, className }) {
  const [src] = useState(() => initialSrc || "/gauntlet-banners/boomer_sanae.png");
  return <img src={src} alt={alt || "Gauntlet banner"} className={className} />;
}
