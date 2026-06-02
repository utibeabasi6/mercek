import { QueryClient } from "@tanstack/react-query";

export const REFETCH_MS = {
  tasks: 10_000,
  tasksDeploying: 5_000,
  services: 20_000,
  servicesDeploying: 5_000,
  targetHealth: 20_000,
  containerInstances: 30_000,
  clusters: 45_000,
  metrics: 45_000,
  capacityProviders: 60_000,
  discovery: 30_000,
  taskDefs: Infinity,
} as const;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
