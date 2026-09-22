"use client";

import {OrderStatus, TriggerType} from "@bespeak/shared";
import type {Address, Hash} from "viem";
import {OrderCard} from "./OrderCard";
import {ReceiptView} from "./ReceiptView";
import type {StoredReceipt} from "@/lib/receipts";
import type {OrderRecord} from "@/lib/useOrders";
import type {MarketState} from "@/lib/useMarketState";

const ASSETS = [
  {assetId: "0xaaa" as Hash, symbol: "NVDAx", underlyingSymbol: "NVDA", name: "NVIDIA xStock"},
];
const STABLES = [
  {address: "0xb6ceceab302e2e4948951ee7843fc24e92933061" as Address, symbol: "USDC", name: "USDC", decimals: 6},
];

function order(over: Partial<OrderRecord>): OrderRecord {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "0xdeadbeef" as Hash,
    owner: "0x6ba3b60ec7e8508995d11F5c32905fc264a5ca2F" as Address,
    vault: "0x0000000000000000000000000000000000000001" as Address,
    inputToken: STABLES[0]!.address,
    assetId: ASSETS[0]!.assetId,
    receiver: "0x6ba3b60ec7e8508995d11F5c32905fc264a5ca2F" as Address,
    triggerType: TriggerType.NEXT_REGULAR_SESSION,
    amountIn: 200_000_000n,
    minAmountOut: 0n,
    maxSlippageBps: 75,
    createdAt: BigInt(now - 7200),
    validAfter: 0n,
    expiresAt: BigInt(now + 6 * 86400),
    minSourceTier: 3,
    recurringId: `0x${"0".repeat(64)}` as Hash,
    occurrenceIndex: 0,
    status: OrderStatus.ACTIVE,
    ...over,
  };
}

const closedMarket: MarketState = {
  assetId: ASSETS[0]!.assetId,
  symbol: "NVDAx",
  underlyingSymbol: "NVDA",
  marketStatus: "POST_MARKET",
  issuerPeriod: "extended",
  halted: false,
  nextChangeAt: new Date(Date.now() + 15.6 * 3600_000).toISOString(),
  observedAt: new Date().toISOString(),
  eligibleForRegularSession: false,
};

export function PreviewStates() {
  const noop = () => {};
  return (
    <div className="stack gap-32">
      <Labelled title="Waiting">
        <OrderCard
          order={order({})}
          assets={ASSETS}
          stables={STABLES}
          market={closedMarket}
          sourceReachable
          onChanged={noop}
        />
      </Labelled>

      <Labelled title="Held — needs attention">
        <OrderCard
          order={order({})}
          assets={ASSETS}
          stables={STABLES}
          market={{...closedMarket, halted: true}}
          sourceReachable
          onChanged={noop}
        />
      </Labelled>

      <Labelled title="Filled">
        <OrderCard
          order={order({status: OrderStatus.FILLED})}
          assets={ASSETS}
          stables={STABLES}
          market={closedMarket}
          sourceReachable
          onChanged={noop}
        />
      </Labelled>

      <Labelled title="Receipt — verified fill">
        <ReceiptView
          receipt={SAMPLE_RECEIPT}
          symbol="NVDAx"
          underlyingSymbol="NVDA"
          assetName="NVIDIA"
          inputSymbol="USDC"
          inputDecimals={6}
          outputSymbol="wNVDAx"
          outputDecimals={18}
          receiver="0x6ba3b60ec7e8508995d11F5c32905fc264a5ca2F"
          conditionLabel="Regular session"
        />
      </Labelled>

      <Labelled title="Cancelled / expired — historical, not alarming">
        <OrderCard
          order={order({status: OrderStatus.CANCELLED})}
          assets={ASSETS}
          stables={STABLES}
          market={closedMarket}
          sourceReachable
          onChanged={noop}
        />
      </Labelled>
    </div>
  );
}

const SAMPLE_RECEIPT = {
  receiptId: "0x9f2c41ab77e0d3c5b18e4a6f0cc2913d5a77bb41e9c0d2f6a1b83e45cc7719ad",
  orderId: "0xdeadbeef",
  transactionHash: "0x4b1f9a0c7d2e83fb6a5c19d40e7b2385cfa91d6e0b47c2358ad91e6f7c033b21",
  blockNumber: "71342990",
  actualInputSpent: "200000000",
  actualOutputReceived: "1104382910000000000",
  unusedInputReleased: "0",
  amountReserved: "200000000",
  transactionSubmittedAt: "2026-09-23T13:30:07.000Z",
  conditionSource: "xstocks.fi/api/v2/public/assets",
  conditionSourceTier: "ATTESTED_SESSION",
  conditionObservationTimestamp: "2026-09-23T13:30:02.000Z",
  conditionSourcePayloadHash: "0x2a1537420eca6e141222010e0908f6bee446376fcf22ef0eda0a463d5c52d640",
  marketStatus: "market",
  routerAddress: "0x0000000000000000000000000000000000000000",
  approvalTarget: "0x0000000000000000000000000000000000000000",
  verificationSource: "https://xlayerrpc.okx.com",
  broadcastSource: "https://rpc.xlayer.tech",
  confirmations: 6,
  verificationChecks: [
    {name: "transaction status", passed: true, expected: "success", observed: "success"},
    {name: "order terminal state", passed: true, expected: "FILLED", observed: "FILLED"},
    {name: "receiver unchanged from intent", passed: true, expected: "0x6ba3…ca2F", observed: "0x6ba3…ca2F"},
    {name: "executed exactly once", passed: true, expected: "1", observed: "1"},
    {name: "output asset is the registered asset", passed: true, expected: "wNVDAx", observed: "wNVDAx"},
    {name: "receiver balance increased by the reported output", passed: true, expected: ">= 1.1043829", observed: "1.1043829"},
    {name: "vault input decreased by exactly the reported spend", passed: true, expected: "200000000", observed: "200000000"},
    {name: "reservation fully settled", passed: true, expected: "closed, 0 remaining", observed: "closed, 0 remaining"},
  ],
  finalOutcomeStatus: "VERIFIED_FILLED",
  limitations: [
    "Market session was established from the xStocks issuer's published trading state and signed by the Bespeak operator. It is operator-attested, not oracle-verified. The signature proves which key asserted this state and when; it does not prove the state itself was correct.",
  ],
} as unknown as StoredReceipt;

function Labelled({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <div>
      <div className="overline mb-12">{title}</div>
      {children}
    </div>
  );
}
