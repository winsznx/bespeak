import {formatAmount} from "./format";
import {iconFor} from "./identity";
import type {TradeCardData} from "./tradeCard";
import type {StoredReceipt} from "./receipts";

export interface CardAssetContext {
  symbol: string;
  underlying: string;
  assetName: string;
  /// Decimals of whatever the order spent, and of whatever it received. On a buy that is
  /// stablecoin in and asset out; on a sell it is the reverse.
  inputDecimals: number;
  inputSymbol: string;
  outputDecimals: number;
  outputSymbol: string;
}

/// Turn a stored receipt into the card's inputs.
///
/// Nothing is inferred that the receipt does not state. `side` is absent on every receipt
/// written before v1.1, and those were all buys, so the default is accurate rather than a
/// guess. The outcome string is passed through verbatim: a card that rendered
/// PARTIALLY_VERIFIED as "filled" would be the exact overstatement this product exists to
/// refuse.
/// Resolve a token mark from the shared icon manifest.
///
/// The manifest keys equities by their exact symbol ("TSLAx") and stablecoins in lowercase
/// ("usdc"), and a wrapped asset arrives here as "wTSLAx". All three forms are tried, which
/// is why USDC first rendered as a grey "US" tile: only the exact-symbol lookup was done.
function resolveIcon(symbol: string): string | null {
  const bare = symbol.replace(/^w/, "");
  return (
    iconFor(symbol) ?? iconFor(bare) ?? iconFor(symbol.toLowerCase()) ?? iconFor(bare.toLowerCase())
  );
}

export function tradeCardFromReceipt(
  receipt: StoredReceipt,
  ctx: CardAssetContext,
): TradeCardData {
  const side = (receipt.side as string | undefined) === "SELL" ? "SELL" : "BUY";
  const checks = receipt.verificationChecks ?? [];

  const fromSym = ctx.inputSymbol;
  const toSym = ctx.outputSymbol;

  return {
    // The marks are resolved from the same manifest the rest of the product uses, so the
    // card cannot show a logo the app would not.
    fromSymbol: fromSym,
    toSymbol: toSym,
    fromIcon: resolveIcon(fromSym),
    toIcon: resolveIcon(toSym),
    symbol: ctx.symbol,
    underlying: ctx.underlying,
    assetName: ctx.assetName,
    side,
    outcome: receipt.finalOutcomeStatus,
    conditionIntent:
      (receipt.conditionIntent as string | undefined) ?? "executed on the owner's instruction",
    observedAt: receipt.conditionObservationTimestamp,
    submittedAt: receipt.transactionSubmittedAt,
    verifiedAt: (receipt.finalVerificationAt as string | undefined) ?? null,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    confirmations: receipt.confirmations,
    checksPassed: checks.filter((c) => c.passed).length,
    checksTotal: checks.length,
    broadcastSource: receipt.broadcastSource,
    verificationSource: receipt.verificationSource,
    receiptVersion: (receipt.receiptVersion as string | undefined) ?? null,
    amountIn: receipt.actualInputSpent
      ? `${formatAmount(BigInt(receipt.actualInputSpent), ctx.inputDecimals, 6)} ${ctx.inputSymbol}`
      : null,
    amountOut: receipt.actualOutputReceived
      ? `${formatAmount(BigInt(receipt.actualOutputReceived), ctx.outputDecimals, 6)} ${ctx.outputSymbol}`
      : null,
  };
}
