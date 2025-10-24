"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import AuthDialog from "@/components/auth-dialog";
import { FiLogOut, FiLogIn, FiChevronDown } from "react-icons/fi";
import { Coins } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getUserTokenBalance } from "@/lib/token-manager";

export default function Navbar() {
  const { user, signOut, loading } = useAuth();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);

  // Load token balance when user logs in
  useEffect(() => {
    const loadBalance = async () => {
      if (!user) {
        setTokenBalance(null);
        return;
      }

      setLoadingTokens(true);
      try {
        const balance = await getUserTokenBalance(user.id);
        setTokenBalance(balance.balanceTokens);
      } catch (error) {
        console.error("Failed to load token balance:", error);
        setTokenBalance(null);
      } finally {
        setLoadingTokens(false);
      }
    };

    loadBalance();
  }, [user]);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background backdrop-blur-sm">
        <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-4">
          <Link href="/">
            <h1 className="text-lg sm:text-xl font-semibold transition-opacity duration-200 hover:opacity-70 cursor-pointer">
              Auto Quran
            </h1>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/library">
              <Button
                variant="ghost"
                className="cursor-pointer gap-1 sm:gap-2 text-sm sm:text-base px-2 sm:px-3 py-1 sm:py-2"
              >
                Library
              </Button>
            </Link>

            {loading ? (
              <Button
                disabled
                className="cursor-pointer text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
              >
                Loading...
              </Button>
            ) : user ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="cursor-pointer gap-2 text-xs sm:text-sm px-3 sm:px-4 py-1 sm:py-2"
                  >
                    <span className="max-w-[150px] sm:max-w-[200px] truncate">
                      {user.email}
                    </span>
                    <FiChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56"
                  sideOffset={8}
                >
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Account</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </span>
                    </div>
                  </DropdownMenuLabel>

                  {/* Token Balance Display */}
                  <div className="px-2 py-2">
                    <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                      <Coins className="h-4 w-4 text-primary" />
                      <div className="flex-1 flex items-baseline gap-2">
                        {loadingTokens ? (
                          <span className="text-sm text-muted-foreground">Loading...</span>
                        ) : tokenBalance !== null ? (
                          <>
                            <span className="text-sm font-semibold">{tokenBalance}</span>
                            <span className="text-xs text-muted-foreground">tokens</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              ${(tokenBalance * 0.01).toFixed(2)}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">--</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut()}
                    className="cursor-pointer"
                  >
                    <FiLogOut className="mr-2 h-4 w-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                onClick={() => setShowAuthDialog(true)}
                className="cursor-pointer gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
              >
                <FiLogIn className="h-3 w-3 sm:h-4 sm:w-4" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
    </>
  );
}
