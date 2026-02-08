"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GameCard from "@/app/components/GameCard";
import RollingWheel from "./RollingWheel";
import styles from "./HeatRollClient.module.css";

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
  const router = useRouter();
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

  const volumePct = useMemo(() => {
    const pct = isMuted ? 0 : Math.round((Number(volume) || 0) * 100);
    const snapped = Math.min(100, Math.max(0, Math.round(pct / 5) * 5));
    return snapped;
  }, [isMuted, volume]);

  const volumeFillClass = styles[`volumeFill${volumePct}`] || styles.volumeFill0;

  function stopAudioImmediate() {
    if (!audioRef.current) return;
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

  // Ensure fresh server-rendered props when revisiting via back/forward.
  useEffect(() => {
    router.refresh();
  }, [router]);

  // If refreshed data arrives (or route cache is invalidated), resync local state.
  useEffect(() => {
    if (rollingRef.current || isRolling) return;
    if (wheel || pendingRoll) return;

    const nextRolls = initialRolls || [];
    const nextHasTargets = initialTargets && Object.keys(initialTargets).length > 0;

    setRolls(nextRolls);
    setPlatformTargets(nextHasTargets ? initialTargets : {});
    setIsLocked(nextHasTargets || nextRolls.length > 0);
    setFinalSelectedGameId(initialSelectedGameId || null);
    setSelectedRollId((prev) => {
      if (!prev) return null;
      return nextRolls.some((r) => r.id === prev) ? prev : null;
    });
    setWesternRequired(
      typeof initialWesternRequired === "number" && initialWesternRequired > 0
        ? Math.min(initialWesternRequired, defaultGameCounter)
        : defaultGameCounter
    );
  }, [
    initialRolls,
    initialTargets,
    initialSelectedGameId,
    initialWesternRequired,
    defaultGameCounter,
    isRolling,
    wheel,
    pendingRoll
  ]);

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
      // Prime audio under the user gesture to avoid autoplay restrictions,
      // but keep it silent until the wheel animation actually starts.
      if (!isMuted && volume > 0) {
        if (!audioRef.current) {
          const audio = new Audio(
            "/CS_GO%20Case%20Knife%20Opening%20Sound%20Effect.mp3"
          );
          audio.loop = true;
          audio.volume = 0;
          audioRef.current = audio;
        }
        const audio = audioRef.current;
        audio.currentTime = 0;
        audio.volume = 0;
        audio.play().catch(() => {});
      }
    } catch (_e) {
      //
    }
    let hasWheel = false;
    try {
      const res = await fetch(`/api/gauntlet/heats/${heatId}/roll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformTargets, westernRequired })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.message || `Failed to roll (HTTP ${res.status})`;
        throw new Error(msg);
      }
      if (json?.targets) {
        setPlatformTargets(json.targets);
        setIsLocked(true);
      }
      if (json?.wheel && json?.roll) {
        hasWheel = true;

        // Sync audio to the moment the wheel begins.
        if (audioRef.current) {
          try {
            audioRef.current.currentTime = 0;
            audioRef.current.volume = isMuted ? 0 : volume;
          } catch (_e) {}
        }

        setWheel(json.wheel);
        setPendingRoll(json.roll);
      } else if (json?.roll) {
        // Fallback if wheel data is missing
        setRolls((prev) => [...prev, json.roll]);
      }
    } catch (e) {
      setError(String(e.message || e));
      // On error, stop any playing audio immediately to stop infinite loops
      stopAudioImmediate();
    } finally {
      // If no wheel animation is running, clear rolling state immediately
      if (!hasWheel) {
        setIsRolling(false);
        rollingRef.current = false;
        // Also stop audio in this path since there is no animation
        stopAudioImmediate();
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
        className={styles.configRow}
      >
        <div
          aria-label="Roll configuration"
          className={styles.configCard}
        >
          <h2 className={styles.configTitle}>Configuration</h2>
          <div className={styles.configHelp}>
            <div className={styles.cautionTitle}>Caution:</div>
            <div>Once you roll, your configuration for this heat is locked.</div>
            <br />
            <div>Choose how many rolls to aim for on each platform (min 1 each).</div>
          </div>
          <div
            className={styles.targets}
          >
            {(platforms || []).map((p) => (
              <label
                key={p.id}
                className={styles.targetRow}
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
                    className={styles.targetInput}
                  />
                )}
              </label>
            ))}
          </div>
          {!isLocked && (
            <div className={styles.totals}>
              Configured total: {totalConfigured} out of {defaultGameCounter}
              {configMismatch && (
                <div className={styles.totalsError}>
                  Total must equal {defaultGameCounter} before you can roll.
                </div>
              )}
            </div>
          )}

          <div className={styles.western}>
            <label className={styles.westernLabel}>
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
                  className={styles.westernInput}
                />
              )}
            </label>
            <div className={styles.westernHelp}>
              At least this many of your rolled games will be guaranteed to have a Western-region release (EU, NA, AU, WW). <br /> 
              Reminder: You are always allowed to do a technical veto any game that can't be acquired in English, this just makes rolling faster if you're certain you don't want to deal with any moonrunes at all. 
            </div>
          </div>
        </div>

        {isAdmin && !isHeatOver && (
          <div
            className={styles.adminBox}
          >
            <div className={styles.adminTitle}>Admin only</div>
            <div className={styles.adminText}>
              Reset your rolls, configuration, and picked game for this heat.
            </div>
            <button
              type="button"
              onClick={handleAdminReset}
              className={styles.adminButton}
            >
              Reset my rolls
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className={styles.error}>{error}</div>
      )}

      <section
        aria-label="Rolling area"
        className={styles.rollingArea}
      >
        <div className={styles.rollingTop}>
          <p className={styles.rollingNote}>
            {isHeatOver
              ? "This heat is over. You can review your pool, but cannot roll again."
              : ""}
          </p>
          {!isHeatOver && (
            <div
              className={styles.volumeRow}
            >
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={isMuted ? "Unmute sound" : "Mute sound"}
                className={styles.muteButton}
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
                className={styles.volumeBar}
                onClick={handleVolumeBarClick}
              >
                <div
                  className={`${styles.volumeFill} ${volumeFillClass}`.trim()}
                />
              </div>
            </div>
          )}
        </div>

        {wheel && (
          <RollingWheel
            games={wheel.games}
            chosenIndex={wheel.chosenIndex}
            startDelayMs={1500}
            slotPlatforms={wheel.slotPlatforms}
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
          className={`${styles.rollButton} ${(isHeatOver || isRolling || rolls.length >= defaultGameCounter || configMismatch) ? styles.rollButtonDisabled : ""}`.trim()}
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

      <section aria-label="Rolled games pool" className={styles.poolSection}>
        <div
          className={styles.poolHeader}
        >
          <h3 className={styles.poolTitle}>Pool</h3>
          <span className={styles.poolMeta}>{rollsUsedLabel}</span>
        </div>
        <div className={styles.poolTip}>
            Tip: Click on a game in the pool to visit the Backloggd page for that game.
        </div>
        {rolls.length === 0 ? (
          <p className={styles.poolEmpty}>
            No games in the pool yet. Once you roll, they will appear here.
          </p>
        ) : (
          <div className={styles.poolOuter}>
            <div className={styles.poolInner}>
              {rolls.map((roll) => (
                <GameCard
                  key={roll.id}
                  game={roll.game}
                  variant="pool"
                  platformLabelOverride={
                    roll.platform
                      ? (roll.platform.abbreviation || roll.platform.name)
                      : null
                  }
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
          className={styles.finalSection}
        >
          <h3 className={styles.finalTitle}>Final choice for this heat</h3>
          {finalSelectedGameId ? (
            <>
              <p className={styles.finalSuccess}>
                You have chosen your game for this heat.
              </p>
              {!isHeatOver && (
                <div className={styles.undoWrap}>
                  <button
                    type="button"
                    onClick={handleUndoPick}
                    className={styles.undoButton}
                  >
                    Undo pick (technical veto)
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className={styles.finalBody}>
                {isHeatOver
                  ? "This heat is over. You cannot change your chosen game anymore."
                  : "Select one of your rolled games to be your official pick for this heat."}
              </p>
              <div
                className={styles.finalRow}
              >
                <select
                  value={selectedRollId || ""}
                  onChange={(e) => setSelectedRollId(e.target.value || null)}
                  disabled={isHeatOver}
                  className={styles.finalSelect}
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
                  className={`${styles.chooseButton} ${isHeatOver ? styles.chooseButtonDisabled : ""}`.trim()}
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
