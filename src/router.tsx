import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { toast } from "@/lib/app-toast";
import { isConnectionError } from "@/lib/request-errors";

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (typeof window !== "undefined" && isConnectionError(error)) {
          toast.error(error, { id: "connection-error" });
        }
      },
    }),
    defaultOptions: { mutations: { retry: false } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
