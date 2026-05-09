"use client";

import { useEffect, useRef } from "react";
import {
  Alert,
  Button,
  Card,
  Disclosure,
  Label,
  NumberField,
  ScrollShadow,
  Surface,
} from "@heroui/react";
import {
  Calendar,
  Eraser,
  ListUl,
  Plus,
  ShieldCheck,
  Shuffle,
} from "@gravity-ui/icons";
import { RoundState } from "../../generated/lottery";
import { useConfig, useCurrentRound } from "../../lib/lottery/accounts";
import { useNowSeconds } from "../../lib/lottery/now";
import {
  formatTokenAmount,
  useMint,
  useTokenAccount,
  useTokenSymbol,
} from "../../lib/lottery/tokens";
import { useWallet } from "../../lib/wallet/context";
import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  PRESET_QUANTITIES,
  usePlayForm,
} from "../play-form-context";
import { TicketListRow } from "./ticket-list-row";

export function BuyTicketsCard() {
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const { round } = useCurrentRound();
  const userToken = useTokenAccount(walletAddress, config?.paymentMint);

  const {
    quantity,
    picks,
    setQuantity,
    shuffleAll,
    clearAll,
    addTicket,
    openCheckout,
  } = usePlayForm();

  const now = useNowSeconds();

  // Auto-scroll the picks list to its bottom when a new ticket is added so
  // the latest row is visible (incrementing quantity, preset chips, +Add).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(picks.length);
  useEffect(() => {
    if (picks.length > prevLengthRef.current) {
      sentinelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
    prevLengthRef.current = picks.length;
  }, [picks.length]);

  const ticketPrice = round?.ticketPrice ?? 0n;
  const totalPrice = ticketPrice * BigInt(quantity);
  const balance = userToken.amount;
  const cantAfford = balance > 0n && totalPrice > balance;

  // Buys close once draw_time is reached, even if the on-chain state is
  // still Open (someone has to call commit_draw to flip it to Drawing).
  const remainingSec = round ? Number(round.drawTime) - now : null;
  const drawTimeReached = remainingSec != null && remainingSec <= 0;
  const closingSoon =
    remainingSec != null && remainingSec > 0 && remainingSec <= 5 * 60;
  const isAcceptingTickets =
    round?.state === RoundState.Open && !drawTimeReached;
  const blocked =
    !signer ||
    !config ||
    !round ||
    !isAcceptingTickets ||
    config.paused ||
    config.emergencyMode;

  const blockedReason = !signer
    ? "Connect a wallet"
    : !config
      ? "Config not initialized"
      : !round
        ? "No active round"
        : config.paused
          ? "Protocol paused"
          : config.emergencyMode
            ? "Emergency mode"
            : round.state === RoundState.Drawing
              ? "Drawing in progress"
              : round.state === RoundState.Claimable
                ? "Round complete"
                : round.state === RoundState.Archived
                  ? "Round archived"
                  : round.state === RoundState.Emergency
                    ? "Round halted"
                    : drawTimeReached
                      ? "Drawing now"
                      : !isAcceptingTickets
                        ? "Round closed"
                        : cantAfford
                          ? `Insufficient ${symbol}`
                          : null;

  const total = `${formatTokenAmount(totalPrice, decimals, { maxDecimals: 2 })} ${symbol}`;
  const buttonLabel = blockedReason ? blockedReason : `Buy Tickets · ${total}`;
  const shortfall =
    cantAfford && totalPrice > balance
      ? `Need ${formatTokenAmount(totalPrice - balance, decimals, { maxDecimals: 2 })} ${symbol} more`
      : null;
  const closingSoonMins =
    remainingSec != null ? Math.max(1, Math.ceil(remainingSec / 60)) : null;

  return (
    <div className="w-full max-w-lg grid gap-2">
      <Card>
        <Card.Content className="grid gap-2">
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Tickets</Label>
              <div className="flex items-center gap-1">
                {PRESET_QUANTITIES.map((preset) => (
                  <Button
                    key={preset}
                    size="sm"
                    variant={preset === quantity ? "primary" : "outline"}
                    onPress={() => setQuantity(preset)}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
            </div>
            <NumberField
              variant="secondary"
              value={quantity}
              minValue={MIN_QUANTITY}
              maxValue={MAX_QUANTITY}
              onChange={(v) => setQuantity(v || MIN_QUANTITY)}
              aria-label="Tickets quantity"
              fullWidth
            >
              <NumberField.Group className="h-12">
                <NumberField.DecrementButton />
                <NumberField.Input className="text-center font-semibold" />
                <NumberField.IncrementButton />
              </NumberField.Group>
            </NumberField>
          </div>

          {closingSoon && isAcceptingTickets && closingSoonMins != null && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Round closing soon</Alert.Title>
                <Alert.Description>
                  Buys lock in about {closingSoonMins} minute
                  {closingSoonMins === 1 ? "" : "s"} when the draw begins.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <Button
            fullWidth
            size="lg"
            variant="primary"
            className="h-12"
            isDisabled={blocked || cantAfford}
            onPress={openCheckout}
          >
            {buttonLabel}
          </Button>

          {shortfall && (
            <p className="text-center text-xs text-muted">{shortfall}</p>
          )}

          <Disclosure className="p-0">
            <Disclosure.Heading>
              <Button
                slot="trigger"
                variant="ghost"
                fullWidth
                className="justify-between p-3"
              >
                <span className="flex-1 text-left text-md font-semibold">
                  Choose your lucky numbers
                </span>
                <Disclosure.Indicator />
              </Button>
            </Disclosure.Heading>
            <Disclosure.Content className="p-0">
              <Disclosure.Body
                className="grid gap-2 pt-2"
                style={{ padding: 0 }}
              >
                <div className="flex items-center justify-between gap-2 p-0">
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onPress={shuffleAll}>
                      <Shuffle />
                      Shuffle
                    </Button>
                    <Button size="sm" variant="outline" onPress={clearAll}>
                      <Eraser />
                      Clear
                    </Button>
                  </div>
                  <Button size="sm" variant="outline" onPress={addTicket}>
                    <Plus />
                    Add
                  </Button>
                </div>
                <Surface
                  variant="default"
                  className="overflow-hidden border rounded-2xl"
                >
                  <ScrollShadow className="grid max-h-[280px] gap-2 p-2">
                    {picks.map((pick, index) => (
                      <TicketListRow key={pick.id} index={index} pick={pick} />
                    ))}
                    <div ref={sentinelRef} aria-hidden />
                  </ScrollShadow>
                </Surface>
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        </Card.Content>
      </Card>

      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <ShieldCheck className="size-3" />
          On-chain randomness
        </span>
        <span className="flex items-center gap-1">
          <ListUl className="size-3" />
          Settled in {symbol ?? "USDC"}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="size-3" />
          Daily draws
        </span>
      </div>
    </div>
  );
}
