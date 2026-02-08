"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import GameCard from "@/app/components/GameCard";
import styles from "./RollingWheel.module.css";

// Visual layout configuration
const CARD_WIDTH = 150; // should stay in sync with GameCard maxWidth
const SLOT_GAP = 8;
const VISIBLE_SLOTS = 5;

export default function RollingWheel({ games, chosenIndex, onComplete, startDelayMs = 0 }) {
  if (!games || games.length === 0) return null;

  // Duplicate games so we can scroll further and land on the chosen one in the middle.
  // Use a middle copy as the target region so there are always cards on both
  // sides of the chosen game, avoiding an empty tail when the last game is picked.
  // Keep this low to avoid rendering too many images/cards (performance).
  const COPIES = 5;
  const TARGET_COPY_INDEX = Math.floor(COPIES / 2); // middle copy (0-based)
  const stripGames = Array(COPIES).fill(games).flat();
  const baseOffset = games.length * TARGET_COPY_INDEX; // keep endX <= 0
  const targetIndex = baseOffset + (chosenIndex ?? 0);

  const step = CARD_WIDTH + SLOT_GAP; // card width plus gap
  const viewportWidth = step * VISIBLE_SLOTS - SLOT_GAP; // last slot no trailing gap
  const centerOffset = viewportWidth / 2 - CARD_WIDTH / 2;
  const endX = -(targetIndex * step) + centerOffset;

  const [finished, setFinished] = useState(false);

  // Reset finished state whenever a new wheel is passed in
  useEffect(() => {
    setFinished(false);
  }, [games, chosenIndex]);

  // Force the motion container to remount whenever the wheel content changes
  // so each roll starts its animation from the same origin, avoiding
  // direction flips caused by animating from the previous end position.
  const rollKey = `${chosenIndex ?? 0}-${games.map((g) => g.id).join("-")}`;

  const startBlurPx = 10;

  function handleAnimationComplete() {
    setFinished(true);
    if (onComplete) onComplete();
  }

  return (
    <div className={styles.wheel}>
      {/* Center selector line */}
      {!finished && (
        <div id="selector-line" className={styles.selectorLine} />
      )}

      <motion.div
        key={rollKey}
        className={styles.strip}
        initial={{ x: 0, filter: `blur(${startBlurPx}px)` }}
        animate={{ x: endX, filter: "blur(0px)" }}
        transition={{
          x: {
            delay: startDelayMs / 1000,
            duration: 7,
            ease: [0.05, 0.9, 0.25, 1]
          },
          filter: {
            delay: startDelayMs / 1000,
            duration: 1,
            ease: "easeOut"
          }
        }}
        onAnimationComplete={handleAnimationComplete}
      >
        {stripGames.map((game, idx) => {
          const isSelected = finished && idx === targetIndex;
          const backlogSlug = game?.slug || "";
          const backlogUrl = backlogSlug
            ? `https://backloggd.com/games/${backlogSlug}/`
            : null;

          const cardInner = (
            <div
              className={`${styles.cardWrap} ${isSelected ? styles.cardWrapSelected : ""}`.trim()}
            >
              <GameCard game={game} variant="wheel" />
            </div>
          );

          return (
            <div
              key={`${game.id}-${idx}`}
              className={`${styles.slot} ${isSelected ? styles.slotSelected : ""}`.trim()}
            >
              <div
                className={styles.slotInner}
              >
                {isSelected && backlogUrl ? (
                  <Link
                    href={backlogUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.backlogLink}
                  >
                    {cardInner}
                  </Link>
                ) : (
                  cardInner
                )}
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
