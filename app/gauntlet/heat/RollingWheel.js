"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import GameCard from "@/app/components/GameCard";

// Visual layout configuration
const CARD_WIDTH = 150; // should stay in sync with GameCard maxWidth
const SLOT_GAP = 8;
const VISIBLE_SLOTS = 5;

export default function RollingWheel({ games, chosenIndex, onComplete }) {
  if (!games || games.length === 0) return null;

  // Duplicate games so we can scroll further and land on the chosen one in the middle.
  // Use the last copy as the target region so the animation always moves leftwards.
  const stripGames = [...games, ...games, ...games];
  const baseOffset = games.length * 2; // target in last copy to keep endX <= 0
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

  function handleAnimationComplete() {
    setFinished(true);
    if (onComplete) onComplete();
  }

  return (
    <div
      style={{
        width: viewportWidth,
        overflow: "hidden",
        borderRadius: 12,
        border: "1px solid #ddd",
        background: "#f7f7f7",
        boxShadow: "inset 0 0 8px rgba(0,0,0,0.08)",
        padding: "12px 0",
        position: "relative"
      }}
    >
      {/* Center selector line */}
      {!finished && (
        <div
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: "50%",
            transform: "translateX(-50%)",
            borderLeft: "2px solid rgba(0,0,0,0.35)",
            pointerEvents: "none",
            zIndex: 5
          }}
        />
      )}

      <motion.div
        key={rollKey}
        style={{ display: "flex", position: "relative", zIndex: 1 }}
        initial={{ x: 0 }}
        animate={{ x: endX }}
        transition={{
          duration: 8,
          ease: [0.05, 0.9, 0.25, 1]
        }}
        onAnimationComplete={handleAnimationComplete}
      >
        {stripGames.map((game, idx) => {
          const isSelected = finished && idx === targetIndex;
          return (
            <div
              key={`${game.id}-${idx}`}
              style={{
                width: CARD_WIDTH,
                marginRight: SLOT_GAP,
                flex: "0 0 auto",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                transform: isSelected ? "scale(1.08)" : "scale(1)",
                transition: "transform 0.25s ease-out",
                zIndex: isSelected ? 2 : 1
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  ...(isSelected
                    ? {
                        borderRadius: 10,
                        padding: 3,
                        boxShadow: "0 0 18px rgba(255, 215, 0, 0.85)",
                        border: "2px solid #facc15",
                        background: "rgba(0,0,0,0.4)"
                      }
                    : {})
                }}
              >
                <GameCard game={game} variant="wheel" />
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
