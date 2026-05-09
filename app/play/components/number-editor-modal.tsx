"use client";

import { useState } from "react";
import { Button, Chip, Modal, Separator, Surface } from "@heroui/react";
import { Dice5, Eraser, Sparkles } from "@gravity-ui/icons";
import {
  quickPick,
  usePlayForm,
  type Pick,
} from "../play-form-context";

const MAX_NORMALS = 5;

function PreviewBall(props: { value: number; isBonus?: boolean }) {
  const empty = props.value === 0;
  const filledClass = props.isBonus
    ? "bg-gradient-to-b from-foreground/80 to-foreground text-background"
    : "bg-gradient-to-b from-zinc-100 to-zinc-300 text-zinc-900 dark:from-zinc-700 dark:to-zinc-900 dark:text-zinc-50";
  const emptyClass = "border border-dashed border-default-300 text-muted";
  return (
    <span
      className={`flex size-9 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
        empty ? emptyClass : filledClass
      }`}
    >
      {empty ? "—" : props.value}
    </span>
  );
}

function NumberGrid(props: {
  range: number;
  selected: ReadonlySet<number>;
  onToggle: (n: number) => void;
  /** When true, unselected balls are disabled (cap reached). Selected
   * balls stay enabled so the user can deselect to free up a slot. */
  disableUnselected?: boolean;
}) {
  return (
    <div className="grid grid-cols-7 gap-1 place-items-center sm:grid-cols-8">
      {Array.from({ length: props.range }, (_, i) => i + 1).map((n) => {
        const isSelected = props.selected.has(n);
        return (
          <Button
            key={n}
            isIconOnly
            variant={isSelected ? "primary" : "outline"}
            className="rounded-full tabular-nums h-9 w-9 font-mono"
            isDisabled={!isSelected && props.disableUnselected}
            onPress={() => props.onToggle(n)}
          >
            {n}
          </Button>
        );
      })}
    </div>
  );
}

function EditorBody(props: { index: number; onApply: () => void }) {
  const { picks, setPick, normalMax, bonusMax } = usePlayForm();
  const original = picks[props.index];

  const [draftNormals, setDraftNormals] = useState<number[]>(() =>
    original ? original.normals.filter((n) => n > 0) : []
  );
  const [draftBonus, setDraftBonus] = useState<number>(original?.bonus ?? 0);

  const toggleNormal = (n: number) => {
    setDraftNormals((prev) => {
      if (prev.includes(n)) return prev.filter((v) => v !== n);
      if (prev.length >= MAX_NORMALS) return prev;
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const handleQuickPick = () => {
    const pick = quickPick(normalMax, bonusMax);
    setDraftNormals(pick.normals);
    setDraftBonus(pick.bonus);
  };

  const handleClear = () => {
    setDraftNormals([]);
    setDraftBonus(0);
  };

  const handleApply = () => {
    const pick: Omit<Pick, "id"> = {
      normals: [...draftNormals].sort((a, b) => a - b),
      bonus: draftBonus,
    };
    if (pick.normals.some((n) => n <= 0) || pick.bonus <= 0) return;
    setPick(props.index, pick);
    props.onApply();
  };

  const normalsRemaining = MAX_NORMALS - draftNormals.length;
  const canApply = normalsRemaining === 0 && draftBonus > 0;
  const applyLabel = !canApply
    ? normalsRemaining > 0
      ? `Pick ${normalsRemaining} more normal${normalsRemaining === 1 ? "" : "s"}`
      : "Pick a bonus number"
    : "Apply numbers";

  // Sort & pad the preview so positions stay stable as the user picks.
  const sortedNormals = [...draftNormals].sort((a, b) => a - b);
  const previewNormals = [
    ...sortedNormals,
    ...Array<number>(MAX_NORMALS - sortedNormals.length).fill(0),
  ];

  return (
    <>
      <Modal.Body className="grid gap-4">
        <Surface
          variant="secondary"
          className="flex items-center justify-center gap-1.5 rounded-2xl p-3"
        >
          {previewNormals.map((n, i) => (
            <PreviewBall key={`p-n-${i}`} value={n} />
          ))}
          <span className="px-1 text-sm font-semibold text-muted">+</span>
          <PreviewBall value={draftBonus} isBonus />
        </Surface>

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Normal balls</h3>
              <Chip size="sm" variant="secondary">
                <Chip.Label>
                  {draftNormals.length}/{MAX_NORMALS}
                </Chip.Label>
              </Chip>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onPress={handleQuickPick}>
                <Sparkles />
                Quick pick
              </Button>
              <Button size="sm" variant="outline" onPress={handleClear}>
                <Eraser />
                Clear
              </Button>
            </div>
          </div>
          <NumberGrid
            range={normalMax}
            selected={new Set(draftNormals)}
            onToggle={toggleNormal}
            disableUnselected={draftNormals.length >= MAX_NORMALS}
          />
        </section>

        <Separator />

        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Bonus ball</h3>
            <Chip size="sm" variant="secondary">
              <Chip.Label>{draftBonus > 0 ? "1" : "0"}/1</Chip.Label>
            </Chip>
          </div>
          <NumberGrid
            range={bonusMax}
            selected={new Set(draftBonus > 0 ? [draftBonus] : [])}
            onToggle={(n) =>
              setDraftBonus((current) => (current === n ? 0 : n))
            }
          />
        </section>
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="primary"
          fullWidth
          isDisabled={!canApply}
          onPress={handleApply}
        >
          {applyLabel}
        </Button>
      </Modal.Footer>
    </>
  );
}

export function NumberEditorModal() {
  const { editorIndex, closeEditor } = usePlayForm();
  const isOpen = editorIndex !== null;

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && closeEditor()}>
      <Modal.Backdrop>
        <Modal.Container className="max-w-lg">
          <Modal.Dialog className="sm:max-w-[480px]">
            <Modal.CloseTrigger />
            <Modal.Header className="items-center text-center">
              <Modal.Heading className="flex items-center gap-2 justify-center">
                <Dice5 className="size-5" />
                Choose your numbers
              </Modal.Heading>
            </Modal.Header>
            {editorIndex !== null && (
              <EditorBody
                key={editorIndex}
                index={editorIndex}
                onApply={closeEditor}
              />
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
