"use client";

import { useEffect, useMemo, useState } from "react";
import GameCard from "@/app/components/GameCard";

function buildInitialTargets(platforms, defaultGameCounter) {
  if (!platforms.length || defaultGameCounter <= 0) return {};
  const base = Math.max(1, Math.floor(defaultGameCounter / platforms.length));
  const targets = {};
  let remaining = defaultGameCounter;
  platforms.forEach((p, index) => {
    const value = index === platforms.length - 1 ? remaining : Math.max(1, Math.min(base, remaining - (platforms.length - index - 1)));
    targets[p.id] = value;
    remaining -= value;
  });
  return targets;
}

export default function HeatRollClient({
  heatId,
  defaultGameCounter,
  platforms,
  initialRolls,
  initialTargets
}) {
  const [rolls, setRolls] = useState(initialRolls || []);
  const hasInitialTargets = initialTargets && Object.keys(initialTargets).length > 0;
  const [platformTargets, setPlatformTargets] = useState(
    hasInitialTargets ? initialTargets : {}
  );
  const [isRolling, setIsRolling] = useState(false);
  const [error, setError] = useState("");

  const [isLocked, setIsLocked] = useState(
    hasInitialTargets || (initialRolls && initialRolls.length > 0)
  );

  useEffect(() => {
    if (isLocked) return;
    setPlatformTargets(buildInitialTargets(platforms || [], defaultGameCounter));
  }, [platforms, defaultGameCounter, isLocked]);

  const totalConfigured = useMemo(
    () => Object.values(platformTargets).reduce((acc, v) => acc + (Number(v) || 0), 0),
    [platformTargets]
  );

  const platformCount = platforms?.length || 0;
  const maxPerPlatform = Math.max(1, defaultGameCounter - Math.max(platformCount - 1, 0));

   const configMismatch = !isLocked && totalConfigured !== defaultGameCounter;

  const rollsUsedLabel = `${rolls.length} / ${defaultGameCounter} rolled`;

  async function handleRoll() {
    if (isRolling) return;
    if (rolls.length >= defaultGameCounter) return;
    if (configMismatch) {
      setError(
        `Configured total (${totalConfigured}) must equal the heat pool (${defaultGameCounter}) before rolling.`
      );
      return;
    }
    setIsRolling(true);
    setError("");
    try {
      const res = await fetch(`/api/gauntlet/heats/${heatId}/roll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformTargets })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || "Failed to roll");
      }
      if (json?.targets) {
        setPlatformTargets(json.targets);
        setIsLocked(true);
      }
      if (json?.roll) {
        setRolls((prev) => [...prev, json.roll]);
      }
      // wheel info (json.wheel) can be used later for animations
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setIsRolling(false);
    }
  }

  function handleTargetChange(platformId, rawValue) {
    if (isLocked) return;
    let value = Number(rawValue) || 1;
    if (value < 1) value = 1;
    if (value > maxPerPlatform) value = maxPerPlatform;
    setPlatformTargets((prev) => ({ ...prev, [platformId]: value }));
  }

  return (
    <>
      <div
        aria-label="Roll configuration"
        style={{
          marginTop: 8,
          padding: 12,
          borderRadius: 8,
          border: "1px solid #e0e0e0",
          background: "#fafafa",
          display: "grid",
          gap: 8,
          width: "fit-content",
        }}
      >
        <div style={{ fontSize: 13, color: "#444" }}>
            <><div style={{ color: "#ff0000" }}>Caution:</div><div>Once you roll, your platform configuration for this heat is locked.</div> <br /><div>Choose how many rolls to aim for on each platform (min 1 each).</div></>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12
          }}
        >
          {(platforms || []).map((p) => (
            <label
              key={p.id}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 , color: "#333"  }}
            >
              <span>
                {p.name}
                {p.abbreviation ? ` (${p.abbreviation})` : ""}
              </span>
              {isLocked ? (
                <span>{platformTargets[p.id] ?? 0}</span>
              ) : (
                <input
                  type="number"
                  min={1}
                  max={maxPerPlatform}
                  value={platformTargets[p.id] ?? ""}
                  onChange={(e) => handleTargetChange(p.id, e.target.value)}
                  style={{ width: 60 }}
                />
              )}
            </label>
          ))}
        </div>
        {!isLocked && (
          <div style={{ fontSize: 12, color: "#666" }}>
            Configured total: {totalConfigured} out of {defaultGameCounter}
            {configMismatch && (
              <div style={{ color: "crimson", marginTop: 4 }}>
                Total must equal {defaultGameCounter} before you can roll.
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ color: "crimson", marginTop: 8 }}>{error}</div>
      )}

      <section
        aria-label="Rolling area"
        style={{
          marginTop: 8,
          padding: 24,
          borderRadius: 12,
          border: "1px solid #ddd",
          minHeight: 220,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at top, rgba(255,255,255,0.9), rgba(245,245,245,0.95))",
          gap: 16
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <h3 style={{ marginBottom: 8, fontSize: 22 }}>Rolling</h3>
          <p style={{ color: "#666", marginBottom: 12 }}>
            Press roll to draw a game. A wheel-style animation will go here later.
          </p>
        </div>
        

        <button
          onClick={handleRoll}
          disabled={
            isRolling ||
            rolls.length >= defaultGameCounter ||
            configMismatch
          }
          style={{
            padding: "8px 20px",
            borderRadius: 999,
            border: "none",
            background: isRolling || rolls.length >= defaultGameCounter || configMismatch ? "#ccc" : "#222",
            color: "white",
            cursor:
              isRolling || rolls.length >= defaultGameCounter || configMismatch ? "default" : "pointer",
            fontWeight: 600
          }}
        >
          {rolls.length >= defaultGameCounter || configMismatch
            ? "Can't roll"
            : isRolling
            ? "Rolling..."
            : "Roll"}
        </button>
      </section>

      <section aria-label="Rolled games pool" style={{ marginTop: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 12
          }}
        >
          <h3 style={{ margin: 0 }}>Pool</h3>
          <span style={{ fontSize: 13, color: "#666" }}>{rollsUsedLabel}</span>
        </div>

        {rolls.length === 0 ? (
          <p style={{ color: "#666", fontStyle: "italic" }}>
            No games in the pool yet. Once you roll, they will appear here.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16
            }}
          >
            {rolls.map((roll) => (
              <GameCard key={roll.id} game={roll.game} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
