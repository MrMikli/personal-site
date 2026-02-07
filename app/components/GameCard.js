"use client";

import { useState } from "react";
import Link from "next/link";

export default function GameCard({ game, variant = "pool", onTechnicalVeto }) {
  if (!game) return null;

  let year = null;
  if (game.releaseDateUnix != null) {
    const unix = Number(game.releaseDateUnix);
    if (Number.isFinite(unix) && unix > 0) {
      year = new Date(unix * 1000).getUTCFullYear();
    }
  } else if (typeof game.releaseDateHuman === "string") {
    const match = game.releaseDateHuman.match(/(\d{4})/);
    if (match) {
      year = match[1];
    }
  }

  const backlogSlug = game.slug || "";
  const backlogUrl = backlogSlug
    ? `https://backloggd.com/games/${backlogSlug}/`
    : null;

  const platformsLabel = (game.platforms || [])
    .map((p) => (p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name))
    .join(", ");

  const isWheel = variant === "wheel";
  const cardMaxWidth = isWheel ? 140 : 150;
  const cardBoxSizing = "border-box";

  const [menuOpen, setMenuOpen] = useState(false);

  function handleMenuToggle(e) {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  }

  function handleTechnicalVetoClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!onTechnicalVeto) return;
    const confirmed = window.confirm(
      "Mark this game as a technical veto? You are confirming that you cannot reasonably get access to or play this game. It will be removed from your pool for this heat."
    );
    if (!confirmed) {
      setMenuOpen(false);
      return;
    }
    onTechnicalVeto();
    setMenuOpen(false);
  }

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 8,
        border: "1px solid #ddd",
        padding: 12,
        width: "100%",
        maxWidth: cardMaxWidth,
        boxSizing: cardBoxSizing,
        height: 300,
        overflow: "hidden",
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
              objectFit: "contain",
              backgroundColor: "#111",
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
            objectFit: "contain",
            backgroundColor: "#111",
            borderRadius: 4,
            boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
            display: "block"
          }}
        />
      )}
      <div
        style={{
          textAlign: "center",
          position: "relative",
          flex: 1,
          width: "100%",
          overflow: "hidden",
          paddingTop: 4
        }}
      >
        <div
          style={{
            fontWeight: 600,
            color: "#333",
            fontSize: 14,
            lineHeight: 1.2,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            padding: "0 4px"
          }}
        >
          {game.name}
          {year != null ? ` (${year})` : ""}
        </div>
        {platformsLabel && (
          <div
            style={{
              fontSize: 12,
              color: "#666",
              lineHeight: 1.25,
              wordBreak: "break-word",
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "0 4px 2px",
              background:
                "linear-gradient(to top, #fafafa 60%, rgba(250,250,250,0.9), transparent)"
            }}
          >
            {platformsLabel}
          </div>
        )}
      </div>
      {variant === "pool" && onTechnicalVeto && (
        <div
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            zIndex: 5
          }}
        >
          <button
            type="button"
            onClick={handleMenuToggle}
            style={{
              border: "none",
              borderRadius: 999,
              width: 20,
              height: 20,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.6)",
              color: "#f3f3f3",
              fontSize: 12,
              cursor: "pointer"
            }}
          >
            ...
          </button>
          {menuOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                bottom: 24,
                minWidth: 140,
                borderRadius: 6,
                border: "1px solid #ddd",
                background: "#ffffff",
                boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
                padding: 4,
                fontSize: 12
              }}
            >
              <button
                type="button"
                onClick={handleTechnicalVetoClick}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderRadius: 4,
                  background: "transparent",
                  cursor: "pointer",
                  color: "#b91c1c",
                  fontSize: 12
                }}
              >
                Technical veto
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
