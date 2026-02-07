"use client";

import { useEffect, useMemo, useState } from "react";
import GameCard from "@/app/components/GameCard";
import RollingWheel from "./RollingWheel";

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
  initialTargets,
  initialSelectedGameId,
  isHeatOver = false,
  isAdmin = false
}) {
  const [rolls, setRolls] = useState(initialRolls || []);
  const hasInitialTargets = initialTargets && Object.keys(initialTargets).length > 0;
  const [platformTargets, setPlatformTargets] = useState(
    hasInitialTargets ? initialTargets : {}
  );
  const [isRolling, setIsRolling] = useState(false);
  const [error, setError] = useState("");
  const [selectedRollId, setSelectedRollId] = useState(null);
  const [finalSelectedGameId, setFinalSelectedGameId] = useState(
    initialSelectedGameId || null
  );

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

  const [wheel, setWheel] = useState(null);
  const [pendingRoll, setPendingRoll] = useState(null);

  const rollsUsedLabel = `${rolls.length} / ${defaultGameCounter} rolled`;

  async function handleRoll() {
    if (isRolling || isHeatOver) return;
    if (rolls.length >= defaultGameCounter) return;
    if (configMismatch) {
      setError(
        `Configured total (${totalConfigured}) must equal the heat pool (${defaultGameCounter}) before rolling.`
      );
      return;
    }
    setIsRolling(true);
    setError("");
    let hasWheel = false;
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
      if (json?.wheel && json?.roll) {
        hasWheel = true;
        setWheel(json.wheel);
        setPendingRoll(json.roll);
      } else if (json?.roll) {
        // Fallback if wheel data is missing
        setRolls((prev) => [...prev, json.roll]);
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      // If no wheel animation is running, clear rolling state immediately
      if (!hasWheel) {
        setIsRolling(false);
      }
    }
  }

  function handleWheelComplete() {
    if (pendingRoll) {
      setRolls((prev) => [...prev, pendingRoll]);
      setPendingRoll(null);
    }
    setIsRolling(false);
  }

  function handleTargetChange(platformId, rawValue) {
    if (isLocked || isHeatOver) return;
    let value = Number(rawValue) || 1;
    if (value < 1) value = 1;
    if (value > maxPerPlatform) value = maxPerPlatform;
    setPlatformTargets((prev) => ({ ...prev, [platformId]: value }));
  }

  async function handleTechnicalVeto(rollId) {
    if (isHeatOver) return;
    try {
      const res = await fetch(
        `/api/gauntlet/heats/${heatId}/rolls/${rollId}`,
        {
          method: "DELETE"
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message || "Failed to apply technical veto");
      }
      setRolls((prev) => prev.filter((r) => r.id !== rollId));
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  const isPoolFull = rolls.length >= defaultGameCounter;

  useEffect(() => {
    if (!isPoolFull || finalSelectedGameId) return;
    // Default selection to the first roll when pool fills and no final choice yet
    if (!selectedRollId && rolls[0]) {
      setSelectedRollId(rolls[0].id);
    }
  }, [isPoolFull, finalSelectedGameId, selectedRollId, rolls]);

  async function handleChooseGame() {
    if (isHeatOver) {
      setError("This heat is over; you can no longer choose a game.");
      return;
    }
    if (!isPoolFull) {
      setError("You must roll the full pool before choosing a game.");
      return;
    }
    if (!selectedRollId) {
      setError("Please select a game from the list before choosing.");
      return;
    }
    try {
      setError("");
      const res = await fetch(
        `/api/gauntlet/heats/${heatId}/selected-game`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rollId: selectedRollId })
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || "Failed to choose game for this heat");
      }
      const chosenGameId = json?.selectedGameId || null;
      if (chosenGameId) {
        setFinalSelectedGameId(chosenGameId);
      }
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function handleUndoPick() {
    if (isHeatOver) {
      setError("This heat is over; you can no longer change your chosen game.");
      return;
    }
    const confirmed = window.confirm(
      "Are you sure you want to undo your picked game for this heat? This should only be used for a genuine technical veto when the game is not actually available to you, not just because you are a little baby a little wussy pussy wahh wahh coward."
    );
    if (!confirmed) return;
    try {
      setError("");
      const res = await fetch(`/api/gauntlet/heats/${heatId}/selected-game`, {
        method: "DELETE"
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || "Failed to undo picked game for this heat");
      }
      setFinalSelectedGameId(null);
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function handleAdminReset() {
    if (!isAdmin || isHeatOver) return;
    const confirmed = window.confirm(
      "Reset all your rolls, configuration, and picked game for this heat? This is an admin-only tool and should normally only be used for testing or fixing a broken signup."
    );
    if (!confirmed) return;
    try {
      setError("");
      const res = await fetch(`/api/gauntlet/heats/${heatId}/reset-signup`, {
        method: "POST"
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || "Failed to reset your rolls for this heat");
      }
      setRolls([]);
      setPlatformTargets(buildInitialTargets(platforms || [], defaultGameCounter));
      setIsLocked(false);
      setFinalSelectedGameId(null);
      setSelectedRollId(null);
      setWheel(null);
      setPendingRoll(null);
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  return (
    <>
      <div
        style={{
          marginTop: 8,
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
          flexWrap: "wrap"
        }}
      >
        <div
          aria-label="Roll configuration"
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            background: "#fafafa",
            display: "grid",
            gap: 8,
            width: "fit-content"
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

        {isAdmin && !isHeatOver && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px dashed #b91c1c",
              background: "#fff7f7",
              maxWidth: 260,
              display: "grid",
              gap: 8,
              fontSize: 13
            }}
          >
            <div style={{ fontWeight: 600, color: "#b91c1c" }}>Admin only</div>
            <div style={{ color: "#7f1d1d" }}>
              Reset your rolls, configuration, and picked game for this heat.
            </div>
            <button
              type="button"
              onClick={handleAdminReset}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #b91c1c",
                background: "white",
                color: "#b91c1c",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Reset my rolls
            </button>
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
          <p style={{ color: "#666", marginBottom: 12 }}>
            {isHeatOver
              ? "This heat is over. You can review your pool, but cannot roll again."
              : "Press roll to draw a game."}
          </p>
        </div>

        {wheel && (
          <RollingWheel
            games={wheel.games}
            chosenIndex={wheel.chosenIndex}
            onComplete={handleWheelComplete}
          />
        )}

        <button
          onClick={handleRoll}
          disabled={
            isHeatOver ||
            isRolling ||
            rolls.length >= defaultGameCounter ||
            configMismatch
          }
          style={{
            padding: "8px 20px",
            borderRadius: 999,
            border: "none",
            background:
              isHeatOver || isRolling || rolls.length >= defaultGameCounter || configMismatch
                ? "#ccc"
                : "#222",
            color: "white",
            cursor:
              isHeatOver || isRolling || rolls.length >= defaultGameCounter || configMismatch
                ? "default"
                : "pointer",
            fontWeight: 600
          }}
        >
          {isHeatOver
            ? "Heat over"
            : rolls.length >= defaultGameCounter || configMismatch
            ? "Can't roll"
            : isRolling
            ? "Rolling..."
            : "Let's go gambling!"}
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
              justifyContent: "center"
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 12,
                alignItems: "stretch",
                maxWidth: 5 * 180 // approximate card width plus gap for nicer centering
              }}
            >
              {rolls.map((roll) => (
                <GameCard
                  key={roll.id}
                  game={roll.game}
                  variant="pool"
                  onTechnicalVeto={() => handleTechnicalVeto(roll.id)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {isPoolFull && (
        <section
          aria-label="Choose final game"
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fafafa",
            maxWidth: 720,
            marginLeft: "auto",
            marginRight: "auto",
            display: "grid",
            gap: 12
          }}
        >
          <h3 style={{ margin: 0 , color: "#166534" }}>Final choice for this heat</h3>
          {finalSelectedGameId ? (
            <>
              <p style={{ margin: 0, color: "#166534" }}>
                You have chosen your game for this heat.
              </p>
              {!isHeatOver && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={handleUndoPick}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid #b91c1c",
                      background: "#fff7f7",
                      color: "#b91c1c",
                      fontSize: 13,
                      cursor: "pointer"
                    }}
                  >
                    Undo pick (technical veto)
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ margin: 0, color: "#444" }}>
                {isHeatOver
                  ? "This heat is over. You cannot change your chosen game anymore."
                  : "Select one of your rolled games to be your official pick for this heat."}
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap"
                }}
              >
                <select
                  value={selectedRollId || ""}
                  onChange={(e) => setSelectedRollId(e.target.value || null)}
                  disabled={isHeatOver}
                  style={{ minWidth: 260, padding: 4 }}
                >
                  <option value="" disabled>
                    Choose a game
                  </option>
                  {rolls.map((roll) => {
                    const g = roll.game;
                    const year = g.releaseDateHuman
                      ? new Date(g.releaseDateHuman).getFullYear()
                      : null;
                    const platformsLabel = (g.platforms || [])
                      .map((p) =>
                        p.abbreviation ? `${p.name} (${p.abbreviation})` : p.name
                      )
                      .join(", ");
                    const labelParts = [g.name];
                    if (year) labelParts.push(`(${year})`);
                    if (platformsLabel) labelParts.push(`- ${platformsLabel}`);
                    return (
                      <option key={roll.id} value={roll.id}>
                        {labelParts.join(" ")}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={handleChooseGame}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 999,
                    border: "none",
                    background: isHeatOver ? "#ccc" : "#166534",
                    color: "white",
                    fontWeight: 600,
                    cursor: isHeatOver ? "default" : "pointer"
                  }}
                  disabled={isHeatOver}
                >
                  Choose
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
