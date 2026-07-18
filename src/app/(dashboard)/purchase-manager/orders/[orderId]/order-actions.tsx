"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOrder, reorder } from "@/lib/actions/orders";

export function OrderActions({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);

  function doReorder() {
    startTransition(async () => {
      await reorder({ orderId });
      router.push("/purchase-manager/cart");
    });
  }
  function doCancel() {
    startTransition(async () => {
      await cancelOrder({ orderId });
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={doReorder}
        disabled={pending}
        className="text-sm text-velvet hover:text-velvet-dark font-medium disabled:opacity-60"
      >
        Reorder
      </button>
      {status === "PENDING" &&
        (confirmCancel ? (
          <button
            onClick={doCancel}
            disabled={pending}
            onBlur={() => setConfirmCancel(false)}
            className="text-sm text-out font-medium"
          >
            Confirm cancel?
          </button>
        ) : (
          <button
            onClick={() => setConfirmCancel(true)}
            className="text-sm text-muted hover:text-out"
          >
            Cancel order
          </button>
        ))}
    </div>
  );
}
