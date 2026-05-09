"use client";

import { Button, Dropdown, Label } from "@heroui/react";
import { Check } from "@gravity-ui/icons";
import type { ClusterMoniker } from "../lib/solana-client";
import { useCluster, CLUSTERS } from "./cluster-context";

const CLUSTER_DOT: Record<string, string> = {
  mainnet: "bg-success",
  devnet: "bg-accent",
  testnet: "bg-warning",
};

function Dot(props: { cluster: string }) {
  return (
    <span
      className={`size-2 rounded-full ${CLUSTER_DOT[props.cluster] ?? "bg-muted"}`}
    />
  );
}

export function ClusterSelect() {
  const { cluster, setCluster } = useCluster();

  return (
    <Dropdown>
      <Button variant="outline" size="sm">
        <Dot cluster={cluster} />
        {cluster}
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          aria-label="Cluster"
          selectionMode="single"
          selectedKeys={new Set([cluster])}
          onAction={(key) => setCluster(key as ClusterMoniker)}
        >
          {CLUSTERS.map((c) => (
            <Dropdown.Item key={c} id={c} textValue={c}>
              <Dot cluster={c} />
              <Label>{c}</Label>
              {c === cluster && <Check />}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
