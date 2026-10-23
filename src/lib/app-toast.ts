import { toast as sonnerToast } from "sonner";
import { requestErrorMessage } from "./request-errors";

/** Shared action feedback; never automatically repeat an interrupted write. */
export const toast = Object.assign((...args: Parameters<typeof sonnerToast>) => sonnerToast(...args), sonnerToast, {
  error: (error: unknown, options?: Parameters<typeof sonnerToast.error>[1]) => sonnerToast.error(requestErrorMessage(error), options),
});