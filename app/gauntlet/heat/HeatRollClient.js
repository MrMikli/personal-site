"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  initialWesternRequired = 0,
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
  const [westernRequired, setWesternRequired] = useState(
    typeof initialWesternRequired === "number" && initialWesternRequired > 0
      ? Math.min(initialWesternRequired, defaultGameCounter)
      : defaultGameCounter
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
  const audioRef = useRef(null);
  const fadeTimeoutRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const rollingRef = useRef(false);

  const effectiveRollCount = rolls.length + (pendingRoll ? 1 : 0);
  const rollsUsedLabel = `${effectiveRollCount} / ${defaultGameCounter} rolled`;

  async function handleRoll() {
    if (rollingRef.current || isRolling || isHeatOver) return;
    if (effectiveRollCount >= defaultGameCounter) return;
    if (configMismatch) {
      setError(
        `Configured total (${totalConfigured}) must equal the heat pool (${defaultGameCounter}) before rolling.`
      );
      return;
    }
    rollingRef.current = true;
    setIsRolling(true);
    setError("");
    // Cancel any in-progress fade-out when starting a new roll
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    try {
      // Start CS:GO case opening sound when rolling begins
      if (!isMuted && volume > 0) {
        if (!audioRef.current) {
          const audio = new Audio(
            "/CS_GO%20Case%20Knife%20Opening%20Sound%20Effect.mp3"
          );
          audio.loop = true;
          audio.volume = volume;
          audioRef.current = audio;
        }
        const audio = audioRef.current;
        audio.currentTime = 0;
        audio.volume = volume;
        // Fire and forget; button click counts as user interaction in browsers.
        audio.play().catch(() => {});
      }
    } catch (_e) {
      // ignore audio errors
    }
    let hasWheel = false;
    try {
      const res = await fetch(`/api/gauntlet/heats/${heatId}/roll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformTargets, westernRequired })
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
      // On error, stop any playing audio immediately so it doesn't loop
      if (audioRef.current) {
        try {
          if (fadeTimeoutRef.current) {
            clearTimeout(fadeTimeoutRef.current);
            fadeTimeoutRef.current = null;
          }
          if (fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          }
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch (_e) {}
      }
    } finally {
      // If no wheel animation is running, clear rolling state immediately
      if (!hasWheel) {
        setIsRolling(false);
        rollingRef.current = false;
        // Also stop audio in this path since there is no animation
        if (audioRef.current) {
          try {
            if (fadeTimeoutRef.current) {
              clearTimeout(fadeTimeoutRef.current);
              fadeTimeoutRef.current = null;
            }
            if (fadeIntervalRef.current) {
              clearInterval(fadeIntervalRef.current);
              fadeIntervalRef.current = null;
            }
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          } catch (_e) {}
        }
      }
    }
  }

  function handleWheelComplete() {
    if (pendingRoll) {
      setRolls((prev) => [...prev, pendingRoll]);
      setPendingRoll(null);
    }
    // After the wheel stops, let the sound play for 1s more,
    // then fade it out over 0.5s instead of cutting abruptly.
    if (audioRef.current && !isMuted) {
      const audio = audioRef.current;
      const startVolume = audio.volume ?? 1;
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
      fadeTimeoutRef.current = setTimeout(() => {
        const durationMs = 500;
        const steps = 10;
        const stepDuration = durationMs / steps;
        let currentStep = 0;
        fadeIntervalRef.current = setInterval(() => {
          currentStep += 1;
          const ratio = Math.max(0, 1 - currentStep / steps);
          try {
            audio.volume = startVolume * ratio;
          } catch (_e) {
            // ignore volume errors
          }
          if (currentStep >= steps) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
            try {
              audio.pause();
              audio.currentTime = 0;
              audio.volume = startVolume;
            } catch (_e) {}
          }
        }, stepDuration);
      }, 1000);
    }
    setIsRolling(false);
    rollingRef.current = false;
  }

  function handleVolumeBarClick(event) {
    if (!event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, relativeX / rect.width));
    setVolume(ratio);
    const shouldMute = ratio === 0;
    setIsMuted(shouldMute);
    if (audioRef.current) {
      try {
        audioRef.current.volume = ratio;
        if (shouldMute) {
          audioRef.current.pause();
        } else if (isRolling) {
          audioRef.current.play().catch(() => {});
        }
      } catch (_e) {}
    }
  }

  function handleToggleMute() {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        if (next) {
          audioRef.current.pause();
        } else if (isRolling) {
          audioRef.current.volume = volume;
          audioRef.current.play().catch(() => {});
        }
      }
      return next;
    });
  }

  function handleTargetChange(platformId, rawValue) {
    if (isLocked || isHeatOver) return;
    let value = Number(rawValue) || 1;
    if (value < 1) value = 1;
    if (value > maxPerPlatform) value = maxPerPlatform;
    setPlatformTargets((prev) => ({ ...prev, [platformId]: value }));
  }

  function handleWesternRequiredChange(rawValue) {
    if (isLocked || isHeatOver) return;
    let value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) value = 0;
    if (value > defaultGameCounter) value = defaultGameCounter;
    setWesternRequired(value);
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
      if (typeof window !== "undefined") {
        window.location.reload();
      }
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
          <h2 style={{ margin: 0, fontSize: 16, color: "#333" }}>Configuration</h2>
          <div style={{ fontSize: 13, color: "#444" }}>
              <><div style={{ color: "#ff0000" }}>Caution:</div><div>Once you roll, your configuration for this heat is locked.</div> <br /><div>Choose how many rolls to aim for on each platform (min 1 each).</div></>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              flexDirection: "column",
            }}
          >
            {(platforms || []).map((p) => (
              <label
                key={p.id}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 , color: "#333"  }}
              >
                <span>
                  {p.name}
                  {p.abbreviation ? ` (${p.abbreviation})` : ""}:
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

          <div style={{ fontSize: 13, color: "#333", marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span>Minimum western-release games:</span>
              {isLocked ? (
                <span>{westernRequired}</span>
              ) : (
                <input
                  type="number"
                  min={0}
                  max={defaultGameCounter}
                  value={westernRequired}
                  disabled={isHeatOver}
                  onChange={(e) => handleWesternRequiredChange(e.target.value)}
                  style={{ width: 72 }}
                />
              )}
            </label>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              At least this many of your rolled games will be guaranteed to have a Western-region release (EU, NA, AU, WW). <br /> 
              Reminder: You are always allowed to do a technical veto any game that can't be acquired in English, this just makes rolling faster if you're certain you don't want to deal with any moonrunes at all. 
            </div>
          </div>
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
          <p style={{ color: "#666", marginBottom: 8 }}>
            {isHeatOver
              ? "This heat is over. You can review your pool, but cannot roll again."
              : ""}
          </p>
          {!isHeatOver && (
            <div
              style={{
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8
              }}
            >
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={isMuted ? "Unmute sound" : "Mute sound"}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "999px",
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
                  <path
                    d="M3 9v6h4l5 4V5L7 9H3z"
                    fill={isMuted ? "#9ca3af" : "#374151"}
                  />
                  {isMuted && (
                    <>
                      <line
                        x1="16"
                        y1="8"
                        x2="21"
                        y2="16"
                        stroke="#b91c1c"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <line
                        x1="21"
                        y1="8"
                        x2="16"
                        y2="16"
                        stroke="#b91c1c"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </>
                  )}
                </svg>
              </button>
              <div
                aria-hidden="true"
                style={{
                  position: "relative",
                  width: 80,
                  height: 6,
                  borderRadius: 999,
                  background: "#e5e7eb",
                  overflow: "hidden"
                }}
                onClick={handleVolumeBarClick}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: isMuted ? "0%" : `${Math.round(volume * 100)}%`,
                    background: "#4b5563",
                    transition: "width 150ms ease-out, background-color 150ms ease-out"
                  }}
                />
              </div>
            </div>
          )}
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
        <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
            Tip: Click on a game in the pool to visit the Backloggd page for that game.
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
