"use client";

import { useEffect, useState } from "react";
import type { Address } from "@solana/kit";
import { address as parseAddress } from "@solana/kit";
import { useCluster } from "../../cluster-context";
import { RoundState } from "../../../generated/lottery";
import { useCurrentRound } from "../../../lib/lottery/accounts";
import {
  useCommitDraw,
  usePrepareRandomness,
  useRevealDraw,
} from "../../../lib/lottery/actions";
import { useNowSeconds } from "../../../lib/lottery/now";
import {
  ActionButton,
  AddressLink,
  Field,
  Panel,
  StatusBadge,
} from "../shared";

function tryParseAddress(value: string): Address | undefined {
  try {
    return value.trim() ? parseAddress(value.trim()) : undefined;
  } catch {
    return undefined;
  }
}

function getRandomnessStorageKey(cluster: string, roundId?: bigint) {
  if (!roundId) return undefined;
  return `lottery:randomness:${cluster}:${roundId.toString()}`;
}

export function DrawController() {
  const { cluster } = useCluster();
  const { round, address: roundAddress } = useCurrentRound();
  const prepare = usePrepareRandomness();
  const commit = useCommitDraw();
  const reveal = useRevealDraw();
  const now = useNowSeconds();

  const [randomnessInput, setRandomnessInput] = useState("");

  // Reload persisted randomness key on round / cluster change. Reading from
  // localStorage is an external-source sync — the rule's normal "no setState
  // in effect" guard doesn't apply here.
  useEffect(() => {
    const key = getRandomnessStorageKey(cluster, round?.roundId);
    if (!key) return;
    const stored = window.localStorage.getItem(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setRandomnessInput(stored);
  }, [cluster, round?.roundId]);

  const randomnessAccount = tryParseAddress(randomnessInput);

  const drawTime = round?.drawTime ? Number(round.drawTime) : undefined;
  const canPrepare =
    cluster === "devnet" &&
    !!round &&
    (round.state === RoundState.Open || round.state === RoundState.Drawing);
  const canCommit =
    cluster === "devnet" &&
    !!round &&
    !!randomnessAccount &&
    (round.state === RoundState.Open
      ? !!drawTime && now >= drawTime
      : round.state === RoundState.Drawing);
  const canReveal =
    cluster === "devnet" &&
    !!round &&
    !!randomnessAccount &&
    round.state === RoundState.Drawing &&
    round.randomnessAccount === randomnessAccount;

  return (
    <Panel
      title="Draw controller"
      description={
        cluster !== "devnet" ? (
          <StatusBadge tone="warn">
            Switchboard randomness is wired for devnet in this console.
          </StatusBadge>
        ) : !round ? (
          <StatusBadge tone="warn">No active round.</StatusBadge>
        ) : (
          <span className="text-xs">
            Round #{round.roundId.toString()} · state {RoundState[round.state]}
          </span>
        )
      }
    >
      <div className="grid gap-3">
        <Field
          label="Randomness account"
          value={randomnessInput}
          onChange={setRandomnessInput}
          placeholder="Switchboard randomness pubkey"
          hint="Auto-populated by Prepare; persisted per round in localStorage."
        />
        {round?.randomnessAccount && (
          <p className="text-[11px] text-muted">
            Round-stored randomness:{" "}
            <AddressLink address={round.randomnessAccount} showCopy />
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            variant="secondary"
            size="sm"
            disabled={!canPrepare}
            isPending={prepare.isPending}
            onClick={async () => {
              try {
                const result = await prepare.trigger();
                const key = getRandomnessStorageKey(cluster, round?.roundId);
                if (key)
                  window.localStorage.setItem(key, result.randomnessAccount);
                setRandomnessInput(result.randomnessAccount);
              } catch {
                /* error reflected in prepare.lastError */
              }
            }}
          >
            Prepare randomness
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            disabled={!canCommit || !roundAddress}
            isPending={commit.isPending}
            onClick={() => {
              if (!roundAddress || !randomnessAccount) return;
              void commit
                .trigger({
                  round: roundAddress,
                  randomnessAccount,
                })
                .catch(() => {});
            }}
          >
            Commit draw
          </ActionButton>
          <ActionButton
            variant="primary"
            size="sm"
            disabled={!canReveal || !roundAddress}
            isPending={reveal.isPending}
            onClick={() => {
              if (!roundAddress || !randomnessAccount) return;
              void reveal
                .trigger({
                  round: roundAddress,
                  randomnessAccount,
                })
                .catch(() => {});
            }}
          >
            Reveal draw
          </ActionButton>
        </div>

        {(prepare.lastError || commit.lastError || reveal.lastError) && (
          <p className="text-xs text-destructive">
            {prepare.lastError ?? commit.lastError ?? reveal.lastError}
          </p>
        )}
      </div>
    </Panel>
  );
}
