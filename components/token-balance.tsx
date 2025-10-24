"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { getUserTokenBalance } from "@/lib/token-manager";
import { Coins, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function TokenBalance() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadBalance = async () => {
    if (!user) {
      setBalance(null);
      setLoading(false);
      return;
    }

    try {
      setRefreshing(true);
      const tokenBalance = await getUserTokenBalance(user.id);
      setBalance(tokenBalance.balanceTokens);
    } catch (error) {
      console.error("Failed to load token balance:", error);
      setBalance(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return null; // Don't show balance if not logged in
  }

  if (loading && balance === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800">
        <Coins className="w-4 h-4 text-gray-400 animate-pulse" />
        <span className="text-sm text-gray-400">Loading...</span>
      </div>
    );
  }

  const balanceUsd = ((balance || 0) * 0.01).toFixed(2);
  const isLow = (balance || 0) < 10; // Warning if less than 10 tokens

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
              isLow
                ? "bg-orange-100 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700"
                : "bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-700"
            }`}
          >
            <Coins
              className={`w-4 h-4 ${
                isLow
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            />
            <div className="flex flex-col">
              <span
                className={`text-sm font-semibold ${
                  isLow
                    ? "text-orange-700 dark:text-orange-300"
                    : "text-green-700 dark:text-green-300"
                }`}
              >
                {balance || 0} tokens
              </span>
              <span
                className={`text-xs ${
                  isLow
                    ? "text-orange-600 dark:text-orange-400"
                    : "text-green-600 dark:text-green-400"
                }`}
              >
                ${balanceUsd}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 ml-1"
              onClick={(e) => {
                e.preventDefault();
                loadBalance();
              }}
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-semibold">Token Balance</p>
            <p className="text-xs text-gray-500">
              {isLow && "Low balance! "}
              Click refresh to update
            </p>
            <p className="text-xs mt-1">
              1 token = $0.01 USD (at-cost pricing)
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
