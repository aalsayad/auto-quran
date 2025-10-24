"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Coins, AlertCircle, TrendingUp } from "lucide-react";
import type { CostEstimate } from "@/lib/token-pricing";

interface CostEstimationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimate: CostEstimate | null;
  currentBalance: number;
  onConfirm: () => void;
  onCancel: () => void;
  surahName?: string;
}

export function CostEstimationDialog({
  open,
  onOpenChange,
  estimate,
  currentBalance,
  onConfirm,
  onCancel,
  surahName,
}: CostEstimationDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!estimate) return null;

  const isInsufficient = currentBalance < estimate.totalTokens;
  const shortage = Math.max(0, estimate.totalTokens - currentBalance);
  const remainingAfter = currentBalance - estimate.totalTokens;

  const handleConfirm = () => {
    setIsConfirming(true);
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-green-600" />
            Confirm Transcription
          </DialogTitle>
          <DialogDescription>
            {surahName
              ? `Cost estimate for ${surahName}`
              : "Estimated cost for this transcription"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Cost Breakdown */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Cost Breakdown:
            </p>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">
                  Whisper API (Audio Transcription)
                </span>
                <span className="font-mono">
                  {estimate.whisperTokens} tokens
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">
                  GPT-5 (Ayah Mapping)
                </span>
                <span className="font-mono">{estimate.gpt5Tokens} tokens</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">
                  Lambda Processing
                </span>
                <span className="font-mono">
                  {estimate.lambdaTokens} tokens
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">
                  Storage (S3)
                </span>
                <span className="font-mono">{estimate.s3Tokens} tokens</span>
              </div>

              <div className="border-t pt-2 mt-2 flex justify-between items-center font-semibold">
                <span>Total Estimated Cost:</span>
                <span className="text-lg font-bold text-green-600">
                  {estimate.totalTokens} tokens
                </span>
              </div>

              <div className="flex justify-end text-xs text-gray-500">
                ≈ ${estimate.totalUsd.toFixed(2)} USD
              </div>
            </div>
          </div>

          {/* Balance Information */}
          <div
            className={`rounded-lg border p-4 ${
              isInsufficient
                ? "bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-700"
                : "bg-green-50 dark:bg-green-900/10 border-green-300 dark:border-green-700"
            }`}
          >
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="font-medium">Current Balance:</span>
                <span className="font-mono font-semibold">
                  {currentBalance} tokens
                </span>
              </div>

              {!isInsufficient && (
                <div className="flex justify-between items-center text-gray-600 dark:text-gray-400">
                  <span>Remaining After:</span>
                  <span className="font-mono">{remainingAfter} tokens</span>
                </div>
              )}
            </div>
          </div>

          {/* Warning for insufficient balance */}
          {isInsufficient && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold">Insufficient tokens!</p>
                <p className="text-sm mt-1">
                  You need {shortage} more tokens to complete this
                  transcription. Please purchase more tokens to continue.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Warning for low balance after */}
          {!isInsufficient && remainingAfter < 10 && (
            <Alert>
              <TrendingUp className="h-4 w-4" />
              <AlertDescription>
                <p className="text-sm">
                  Your balance will be low after this transcription (
                  {remainingAfter} tokens remaining). Consider purchasing more
                  tokens soon.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* At-cost pricing notice */}
          <p className="text-xs text-center text-gray-500">
            💚 Pricing is at-cost with no markup (for the sake of Allah)
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </Button>

          {isInsufficient ? (
            <Button
              onClick={() => {
                // TODO: Navigate to purchase tokens page
                alert("Purchase tokens feature coming soon!");
              }}
            >
              Purchase Tokens
            </Button>
          ) : (
            <Button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="bg-green-600 hover:bg-green-700"
            >
              {isConfirming ? "Starting..." : "Start Transcription"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
