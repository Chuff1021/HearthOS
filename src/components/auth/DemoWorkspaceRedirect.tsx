"use client";

import { useOrganizationList, useUser } from "@clerk/nextjs";
import { CircleAlert, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import FlameLogo from "@/components/FlameLogo";

const DEMO_ORGANIZATION_NAME = "L.T. Rush Stone Inc";
const DEMO_DESTINATIONS: Record<string, string> = {
  "ltrush@demo.hearthos.app": "/",
  "lttech@demo.hearthos.app": "/tech",
};

export default function DemoWorkspaceRedirect() {
  const { isLoaded: isUserLoaded, user } = useUser();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true, pageSize: 20 },
  });
  const {
    data: memberships,
    fetchNext,
    hasNextPage,
    isFetching: membershipsFetching,
    isLoading: membershipsLoading,
  } = userMemberships;
  const activationStarted = useRef(false);
  const [error, setError] = useState("");
  const email = user?.primaryEmailAddress?.emailAddress.toLowerCase();
  const destination = email ? DEMO_DESTINATIONS[email] : undefined;
  const organizationId = memberships?.find(
    (item) => item.organization.name === DEMO_ORGANIZATION_NAME,
  )?.organization.id;
  const accessError = error || (
    isLoaded
    && isUserLoaded
    && !membershipsLoading
    && !membershipsFetching
    && (
      !destination
        ? "This sign-in is not connected to the LT Rush demo workspace."
        : !organizationId && !hasNextPage
          ? "The LT Rush demo organization is not attached to this login yet."
          : ""
    )
  );

  useEffect(() => {
    if (!isLoaded || !isUserLoaded || membershipsLoading || activationStarted.current) return;
    if (!destination) return;

    if (organizationId) {
      activationStarted.current = true;
      void setActive({
        organization: organizationId,
        redirectUrl: destination,
      }).catch(() => {
        activationStarted.current = false;
        setError("We could not open the LT Rush workspace. Please try signing in again.");
      });
      return;
    }

    if (hasNextPage && !membershipsFetching) {
      fetchNext();
      return;
    }

  }, [destination, fetchNext, hasNextPage, isLoaded, isUserLoaded, membershipsFetching, membershipsLoading, organizationId, setActive]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8] px-4 text-slate-950">
      <section className="w-full max-w-md rounded-lg border border-white bg-white px-7 py-10 text-center shadow-[0_24px_80px_rgba(31,41,55,0.12)]">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50">
          <FlameLogo size={34} />
        </span>
        {accessError ? (
          <>
            <CircleAlert className="mx-auto mt-6 text-red-500" size={24} />
            <h1 className="mt-3 text-lg font-semibold">LT Rush access needs attention</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500" role="alert">{accessError}</p>
            <Link
              href="/sign-in"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-[#f56323] px-5 text-sm font-semibold text-white transition hover:bg-[#d94d12]"
            >
              Return to sign in
            </Link>
          </>
        ) : (
          <>
            <LoaderCircle className="mx-auto mt-6 animate-spin text-[#f56323]" size={24} />
            <h1 className="mt-3 text-lg font-semibold">Opening LT Rush Stone</h1>
            <p className="mt-2 text-sm text-slate-500">Connecting your private demo workspace...</p>
          </>
        )}
      </section>
    </main>
  );
}
