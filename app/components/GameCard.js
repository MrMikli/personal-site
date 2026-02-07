"use client";

import Link from "next/link";

export default function GameCard({ game }) {
  if (!game) return null;

  const year = game.releaseDateHuman
    ? new Date(game.releaseDateHuman).getFullYear()
    : null;

  const backlogSlug = game.slug || "";
  const backlogUrl = backlogSlug
    ? `https://backloggd.com/games/${backlogSlug}/`
    : null;

  const platformsLabel = (game.platforms || [])
    .map((p) => (p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name))
    .join(", ");

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid #ddd",
        padding: 12,
        width: 180,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        background: "#fafafa"
      }}
    >
      {backlogUrl ? (
        <Link href={backlogUrl} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={game.coverUrl || "/placeholder-cover.png"}
            alt={game.name}
            style={{
              width: 140,
              height: 210,
              objectFit: "cover",
              borderRadius: 4,
              boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
              display: "block"
            }}
          />
        </Link>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={game.coverUrl || "/placeholder-cover.png"}
          alt={game.name}
          style={{
            width: 140,
            height: 210,
            objectFit: "cover",
            borderRadius: 4,
            boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
            display: "block"
          }}
        />
      )}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 600, color: "#333" }}>
          {game.name}
          {year ? ` (${year})` : ""}
        </div>
        {platformsLabel && (
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            {platformsLabel}
          </div>
        )}
      </div>
    </div>
  );
}
