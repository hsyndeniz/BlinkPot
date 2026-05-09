"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card } from "@heroui/react";
import { Dice5, PencilToLine, TrashBin } from "@gravity-ui/icons";
import { usePlayForm, type Pick } from "../play-form-context";

const ROLL_FRAMES = 8;
const ROLL_FRAME_MS = 30;

function NumberBall(props: {
  value: number;
  max: number;
  isBonus?: boolean;
  onPress?: () => void;
}) {
  const [display, setDisplay] = useState(props.value);
  const prevRef = useRef(props.value);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = props.value;
    if (props.value === prev || props.value === 0) {
      setDisplay(props.value);
      return;
    }
    let frame = 0;
    const id = setInterval(() => {
      frame += 1;
      if (frame >= ROLL_FRAMES) {
        clearInterval(id);
        setDisplay(props.value);
      } else {
        setDisplay(1 + Math.floor(Math.random() * props.max));
      }
    }, ROLL_FRAME_MS);
    return () => clearInterval(id);
  }, [props.value, props.max]);

  const empty = props.value === 0;
  const gradient = props.isBonus
    ? "bg-gradient-to-b from-foreground/80 to-foreground text-background"
    : "bg-gradient-to-b from-zinc-100 to-zinc-300 text-zinc-900 dark:from-zinc-700 dark:to-zinc-900 dark:text-zinc-50";
  return (
    <button
      type="button"
      onClick={props.onPress}
      className={`h-9 w-9 font-mono flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums cursor-pointer ${gradient}`}
    >
      {empty ? "—" : display}
    </button>
  );
}

export function TicketListRow(props: { index: number; pick: Pick }) {
  const { index, pick } = props;
  const {
    openEditor,
    shuffleTicket,
    removeTicket,
    picks,
    normalMax,
    bonusMax,
  } = usePlayForm();
  const canRemove = picks.length > 1;

  return (
    <Card className="flex flex-row items-center justify-between gap-2 p-2 rounded-2xl">
      <div className="flex items-center gap-1">
        {pick.normals.map((n, i) => (
          <NumberBall
            key={i}
            value={n}
            max={normalMax}
            onPress={() => openEditor(index)}
          />
        ))}
        <NumberBall
          value={pick.bonus}
          max={bonusMax}
          isBonus
          onPress={() => openEditor(index)}
        />
      </div>
      <div className="flex items-center gap-1">
        <Button
          isIconOnly
          size="sm"
          variant="outline"
          aria-label="Shuffle"
          onPress={() => shuffleTicket(index)}
        >
          <Dice5 />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="outline"
          aria-label="Edit"
          className="hidden sm:inline-flex"
          onPress={() => openEditor(index)}
        >
          <PencilToLine />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="outline"
          aria-label="Remove"
          isDisabled={!canRemove}
          onPress={() => removeTicket(index)}
        >
          <TrashBin color="red" />
        </Button>
      </div>
    </Card>
  );
}
