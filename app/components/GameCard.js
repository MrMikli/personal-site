"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./GameCard.module.css";

export default function GameCard({ game, variant = "pool", onTechnicalVeto, platformLabelOverride = null }) {
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

  const platformsLabel =
    typeof platformLabelOverride === "string" && platformLabelOverride.trim()
      ? platformLabelOverride.trim()
      : (game.platforms || [])
          .map((p) => (p.abbreviation ? p.abbreviation : p.name))
          .join(", ");

  const isWheel = variant === "wheel";

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
      "Mark this game as a technical veto? You are confirming that you cannot reasonably get access to or play this game, or that it's not a game at all. It will be removed from your pool for this heat."
    );
    if (!confirmed) {
      setMenuOpen(false);
      return;
    }
    onTechnicalVeto();
    setMenuOpen(false);
  }

  return (
    <div className={`${styles.card} ${isWheel ? styles.cardWheel : ""}`.trim()}>
      {backlogUrl && variant === "pool" ? (
        <Link href={backlogUrl} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={game.coverUrl || "/placeholder-cover.png"}
            alt={game.name}
            className={styles.cover}
            loading="lazy"
            decoding="async"
          />
        </Link>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={game.coverUrl || "/placeholder-cover.png"}
          alt={game.name}
          className={styles.cover}
          loading={isWheel ? "lazy" : undefined}
          decoding={isWheel ? "async" : undefined}
        />
      )}
      <div
        className={styles.meta}
      >
        <div
          className={styles.title}
        >
          {game.name}
          {year != null ? ` (${year})` : ""}
        </div>
        {platformsLabel && (
          <div className={styles.platforms}>
            {platformsLabel}
          </div>
        )}
      </div>
      {variant === "pool" && onTechnicalVeto && (
        <div className={styles.menuWrap}>
          <button
            type="button"
            onClick={handleMenuToggle}
            className={styles.menuButton}
          >
            ...
          </button>
          {menuOpen && (
            <div className={styles.menu}>
              <button
                type="button"
                onClick={handleTechnicalVetoClick}
                className={styles.menuItemDanger}
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
