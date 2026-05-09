"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Description,
  Label,
  Modal,
  Radio,
  RadioGroup,
  Surface,
} from "@heroui/react";
import { ArrowsRotateRight } from "@gravity-ui/icons";
import { RoundState, type TicketPickArgs } from "../../generated/lottery";
import {
  useBuyerEntry,
  useConfig,
  useCurrentRound,
} from "../../lib/lottery/accounts";
import {
  useBuyTickets,
  useProcessSubscription,
  useSubscribeDaily,
} from "../../lib/lottery/actions";
import {
  formatTokenAmount,
  useMint,
  useTokenSymbol,
} from "../../lib/lottery/tokens";
import { useWallet } from "../../lib/wallet/context";
import { classifyError } from "../../lib/errors/classify";
import {
  isPickFilled,
  quickPick,
  SUBSCRIPTION_DAY_OPTIONS,
  usePlayForm,
  type Pick,
  type SubscriptionDays,
} from "../play-form-context";

const POPULAR_DAYS: SubscriptionDays = 7;

function isSubscriptionDays(value: number): value is SubscriptionDays {
  return SUBSCRIPTION_DAY_OPTIONS.some((option) => option === value);
}

function picksForBuy(picks: Pick[]): TicketPickArgs[] {
  return picks.filter(isPickFilled).map((p) => ({
    normals: Uint8Array.from(p.normals),
    bonusball: p.bonus,
  }));
}

export function CheckoutModal() {
  const { quantity, finalizePicks, checkoutOpen, closeCheckout } =
    usePlayForm();
  const { signer, wallet } = useWallet();
  const walletAddress = signer?.address ?? wallet?.account.address;
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const symbol = useTokenSymbol(config?.paymentMint);
  const { round, address: roundAddress } = useCurrentRound();
  const buyerEntry = useBuyerEntry(round?.roundId, walletAddress);

  const buy = useBuyTickets();
  const subscribe = useSubscribeDaily();
  const processSub = useProcessSubscription();

  const [days, setDays] = useState<SubscriptionDays | null>(null);
  const isPending =
    buy.isPending || subscribe.isPending || processSub.isPending;

  const ticketPrice = round?.ticketPrice ?? 0n;
  const errorMessage = buy.lastError ?? subscribe.lastError ?? null;
  const errorClass = errorMessage ? classifyError(errorMessage) : null;

  const fmt = (v: bigint) =>
    `${formatTokenAmount(v, decimals, { maxDecimals: 2 })} ${symbol}`;

  const handleDaysChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (isSubscriptionDays(parsed)) {
      setDays(parsed);
    }
  };

  const handleSubscribe = async () => {
    if (days == null) return;
    try {
      await subscribe.trigger({ dailyTicketCount: quantity, days });
    } catch {
      // surfaced via lastError — bail out early; nothing to chain.
      return;
    }

    // Best-effort: kick off the first round's process_subscription right away
    // so the user doesn't have to wait for a keeper to mint their tickets.
    // Only meaningful when the current round is still Open and we know the
    // user's wallet. If this fails (e.g. round closed mid-flight, simulate
    // failure), the keeper will pick it up on the next pass.
    if (
      walletAddress &&
      round &&
      roundAddress &&
      round.state === RoundState.Open
    ) {
      const picks: TicketPickArgs[] = Array.from(
        { length: quantity },
        () => {
          const p = quickPick(round.normalBallMax, round.bonusballMax);
          return {
            normals: Uint8Array.from(p.normals),
            bonusball: p.bonus,
          };
        }
      );
      try {
        await processSub.trigger({
          owner: walletAddress,
          round: { address: roundAddress, data: round },
          picks,
        });
      } catch {
        // Swallow — subscription itself succeeded; the keeper will catch up.
      }
    }

    closeCheckout();
  };

  const handleOneShotBuy = async () => {
    if (!round || !roundAddress) return;
    const finalized = finalizePicks();
    const finalizedPicks = picksForBuy(finalized);
    if (finalizedPicks.length !== quantity) return;
    try {
      const firstTicketIndex = buyerEntry.buyerEntry?.ticketCount ?? 0n;
      await buy.trigger({
        round: { address: roundAddress, data: round },
        picks: finalizedPicks,
        firstTicketIndex,
      });
      closeCheckout();
    } catch {
      // surfaced via lastError
    }
  };

  return (
    <Modal
      isOpen={checkoutOpen}
      onOpenChange={(open) => !open && closeCheckout()}
    >
      <Modal.Backdrop>
        <Modal.Container className="max-w-lg">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header className="items-center text-center">
              <Modal.Icon className="bg-success/15 text-success">
                <ArrowsRotateRight className="size-5" />
              </Modal.Icon>
              <Modal.Heading className="font-bold uppercase">
                Never miss a round
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-2">
              <Surface className="w-full rounded-3xl px-4">
                <RadioGroup
                  value={days != null ? String(days) : null}
                  onChange={handleDaysChange}
                  name="subscription-days"
                  variant="secondary"
                >
                  <Description>
                    <p className="text-center text-sm text-muted">
                      <strong className="text-foreground">
                        Fund a streak now and we&apos;ll auto-buy your tickets
                        when each round opens.
                      </strong>{" "}
                      Stop whenever you want, any unused balance refunds
                      straight back to your wallet.
                    </p>
                  </Description>
                  {SUBSCRIPTION_DAY_OPTIONS.map((optionDays) => {
                    const estimatedCost =
                      ticketPrice * BigInt(quantity) * BigInt(optionDays);

                    return (
                      <Radio key={optionDays} value={String(optionDays)}>
                        <Radio.Control>
                          <Radio.Indicator />
                        </Radio.Control>
                        <Radio.Content>
                          <div className="flex items-center gap-2">
                            <Label className="text-primary text-md font-semibold">
                              {optionDays}-day streak
                            </Label>
                            {optionDays === POPULAR_DAYS && (
                              <Chip
                                size="sm"
                                color="success"
                                variant="secondary"
                              >
                                <Chip.Label>Popular</Chip.Label>
                              </Chip>
                            )}
                          </div>
                          <Description className="text-secondary text-xs font-semibold">
                            ${fmt(estimatedCost)} {quantity} tickets
                          </Description>
                        </Radio.Content>
                      </Radio>
                    );
                  })}
                </RadioGroup>
              </Surface>
            </Modal.Body>
            <Modal.Footer className="flex flex-col gap-2">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                isPending={subscribe.isPending || processSub.isPending}
                isDisabled={isPending || days == null}
                className="h-12 w-full"
                onPress={() => void handleSubscribe()}
              >
                {days == null ? "Pick a duration" : "Checkout"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                isPending={buy.isPending}
                isDisabled={isPending}
                className="w-full"
                onPress={() => void handleOneShotBuy()}
              >
                No thanks, only play once
              </Button>
              {errorMessage && errorClass && (
                <Alert status={errorClass.status}>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{errorClass.title}</Alert.Title>
                    <Alert.Description>{errorMessage}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
