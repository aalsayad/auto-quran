"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import AuthDialog from "@/components/auth-dialog";
import {
  FiLogOut,
  FiLogIn,
  FiChevronDown,
  FiSun,
  FiMoon,
  FiMenu,
  FiX,
} from "react-icons/fi";
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

export default function TopNavbar() {
  const { user, signOut, loading } = useAuth();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Initialize theme from localStorage
  useEffect(() => {
    const isDark =
      localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDarkMode(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem("theme", newDarkMode ? "dark" : "light");
    document.documentElement.classList.toggle("dark", newDarkMode);
  };

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
      <nav className="border-b bg-background relative">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/">
              <h1 className="text-lg sm:text-xl font-semibold transition-opacity duration-200 hover:opacity-70 cursor-pointer">
                Auto Quran
              </h1>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1 sm:gap-2">
              <Link href="/library">
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer text-sm sm:text-base px-2 sm:px-3 py-1 sm:py-2 h-auto"
                >
                  Library
                </Button>
              </Link>
              <Link href="/mushaf">
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer text-sm sm:text-base px-2 sm:px-3 py-1 sm:py-2 h-auto"
                >
                  Mushaf
                </Button>
              </Link>

              {/* Dark Mode Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleDarkMode}
                className="cursor-pointer text-sm sm:text-base px-2 sm:px-3 py-1 sm:py-2 h-auto"
                title={
                  darkMode ? "Switch to light mode" : "Switch to dark mode"
                }
              >
                {darkMode ? (
                  <FiSun className="h-4 w-4" />
                ) : (
                  <FiMoon className="h-4 w-4" />
                )}
              </Button>

              {loading ? (
                <Button
                  disabled
                  size="sm"
                  className="cursor-pointer text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-auto"
                >
                  Loading...
                </Button>
              ) : user ? (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer gap-2 text-xs sm:text-sm px-3 sm:px-4 py-1 sm:py-2 h-auto"
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
                            <span className="text-sm text-muted-foreground">
                              Loading...
                            </span>
                          ) : tokenBalance !== null ? (
                            <>
                              <span className="text-sm font-semibold">
                                {tokenBalance}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                tokens
                              </span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                ${(tokenBalance * 0.01).toFixed(2)}
                              </span>
                            </>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              --
                            </span>
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
                  size="sm"
                  className="cursor-pointer gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-auto"
                >
                  <FiLogIn className="h-3 w-3 sm:h-4 sm:w-4" />
                  Sign In
                </Button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center gap-2">
              {!mobileMenuOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(true)}
                  className="cursor-pointer p-2"
                >
                  <FiMenu className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 z-50 border-t bg-background shadow-lg">
            <div className="container mx-auto px-4 py-3 space-y-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Menu</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(false)}
                  className="cursor-pointer p-2"
                >
                  <FiX className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-2">
                <Link href="/library">
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Library
                  </Button>
                </Link>

                <Link href="/mushaf">
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Mushaf
                  </Button>
                </Link>

                <div className="flex items-center justify-between px-3 py-2 border-y">
                  <span className="text-sm">Theme</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleDarkMode}
                    className="cursor-pointer"
                  >
                    {darkMode ? (
                      <FiSun className="h-4 w-4" />
                    ) : (
                      <FiMoon className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {loading ? (
                  <Button disabled className="w-full">
                    Loading...
                  </Button>
                ) : user ? (
                  <div className="space-y-2">
                    <div className="px-3 py-2 border rounded-md">
                      <div className="text-sm font-medium">{user.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {tokenBalance !== null
                          ? `${tokenBalance} tokens`
                          : "Loading tokens..."}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        signOut();
                      }}
                    >
                      <FiLogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowAuthDialog(true);
                    }}
                    className="w-full"
                  >
                    <FiLogIn className="mr-2 h-4 w-4" />
                    Sign In
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
    </>
  );
}
