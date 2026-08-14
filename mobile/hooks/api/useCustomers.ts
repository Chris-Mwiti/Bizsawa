import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Customer as BackendCustomer, CustomerRequest, UUID } from "../../lib/api-dtos";

export interface Customer extends BackendCustomer {}

export interface CreateCustomerRequest extends CustomerRequest {
  businessId?: UUID;
}

export const useCustomers = () => {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const response = await api.get<{ customers: Customer[] }>("/customers");
      return response.data.customers || [];
    },
  });
};

export const useCreateCustomer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateCustomerRequest) => {
      const { businessId: _businessId, ...payload } = data;
      const response = await api.post<Customer>("/customers", payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
};

export const useUpdateCustomer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<CustomerRequest> & { id: UUID }) => {
      const { id, ...payload } = data;
      const response = await api.put<Customer>(`/customers/${id}`, payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
};
