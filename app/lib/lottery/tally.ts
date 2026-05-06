"use client";

import type { Round } from "../../generated/lottery/accounts/round";
import type { Ticket } from "../../generated/lottery/accounts/ticket";

export function countTicketMatches(round: Round, ticket: Ticket) {
  const winningNormals = Array.from(round.winningNormals);
  const ticketNormals = Array.from(ticket.normals);
  let matches = 0;
  let i = 0;
  let j = 0;

  while (i < ticketNormals.length && j < winningNormals.length) {
    const ticketValue = ticketNormals[i];
    const winningValue = winningNormals[j];
    if (ticketValue === winningValue) {
      matches += 1;
      i += 1;
      j += 1;
    } else if (ticketValue < winningValue) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return {
    matches,
    hasBonusball: ticket.bonusball === round.winningBonusball,
  };
}

export function tierForMatch(matches: number, hasBonusball: boolean) {
  if (matches === 0 && !hasBonusball) return 0;
  if (matches === 0 && hasBonusball) return 1;
  if (matches === 1 && !hasBonusball) return 2;
  if (matches === 1 && hasBonusball) return 3;
  if (matches === 2 && !hasBonusball) return 4;
  if (matches === 2 && hasBonusball) return 5;
  if (matches === 3 && !hasBonusball) return 6;
  if (matches === 3 && hasBonusball) return 7;
  if (matches === 4 && !hasBonusball) return 8;
  if (matches === 4 && hasBonusball) return 9;
  if (matches === 5 && !hasBonusball) return 10;
  if (matches === 5 && hasBonusball) return 11;
  return 0;
}

export function isWinningTicket(round: Round, ticket: Ticket) {
  const { matches, hasBonusball } = countTicketMatches(round, ticket);
  const tier = tierForMatch(matches, hasBonusball);
  return {
    matches,
    hasBonusball,
    tier,
    winning: tier > 0,
  };
}
