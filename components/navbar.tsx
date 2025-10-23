"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import AuthDialog from "@/components/auth-dialog";
import { FiLogOut, FiLogIn, FiChevronDown } from "react-icons/fi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Navbar() {
  const { user, signOut, loading } = useAuth();
  const [showAuthDialog, setShowAuthDialog] = useState(false);

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
