"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import AuthDialog from "@/components/auth-dialog";
import { FiLogOut, FiLogIn } from "react-icons/fi";

export default function Navbar() {
  const { user, signOut, loading } = useAuth();
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/">
            <h1 className="text-xl font-semibold transition-opacity duration-200 hover:opacity-70 cursor-pointer">
              Auto Quran
            </h1>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/library">
              <Button variant="ghost" className="cursor-pointer gap-2">
                Library
              </Button>
            </Link>

            {loading ? (
              <Button disabled className="cursor-pointer">
                Loading...
              </Button>
            ) : user ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {user.email}
                </span>
                <Button
                  variant="outline"
                  onClick={() => signOut()}
                  className="cursor-pointer gap-2"
                >
                  <FiLogOut /> Sign Out
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setShowAuthDialog(true)}
                className="cursor-pointer gap-2"
              >
                <FiLogIn /> Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
    </>
  );
}
